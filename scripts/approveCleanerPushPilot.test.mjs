import assert from "node:assert/strict";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cleanerAccountUid } from "../functions/src/cleanerHubAccess.js";
import { approveCleanerPushPilot, readPrivatePilotRequest } from "./approveCleanerPushPilot.mjs";
import { notificationProject, sha256 } from "./notificationReleaseCloud.mjs";
import { deployGroups, releaseBBranch } from "./preflightNotificationRelease.mjs";
import { releaseBSnapshot, releaseBSteps } from "./releaseNotificationB.mjs";

const sourceSha = "a".repeat(40);
const artifactHash = "b".repeat(64);
const organizationId = "cleanflow-demo";
const cleanerId = "synthetic-cleaner";
const uid = cleanerAccountUid(organizationId, cleanerId);
const sessionId = "d".repeat(32);
const deviceId = "synthetic-installation-42";
const nowMs = Date.parse("2026-11-04T22:00:00.000Z");
const expiresAt = "2026-11-05T01:00:00.000Z";
const request = { organizationId, cleanerId, pairingCode: `${sessionId}.${deviceId}`, expiresAt };
const record = (value) => Buffer.from(JSON.stringify(value));
const str = (value) => ({ stringValue: value });
const org = `projects/${notificationProject}/databases/(default)/documents/organizations/${organizationId}`;
const memberPath = `${org}/members/${uid}`;
const profilePath = `${org}/cleaners/${cleanerId}`;
const grantPath = `${org}/cleanerPushPilotSessions/${sessionId}`;
const lockPath = `projects/${notificationProject}/databases/(default)/documents/cleanflowReleaseControl/production`;
const approvedAt = { timestampValue: new Date(nowMs).toISOString() };

function fixture() {
  const dedicatedApp = { projectId: notificationProject, appId: "synthetic-app", apiKey: "synthetic-api" };
  const planBytes = record({
    schema: 1, project: notificationProject, branch: releaseBBranch, sha: sourceSha, artifactHash,
    pilotPolicy: "explicit-device-approval", steps: releaseBSteps,
    cleanerBinding: {
      appIdHash: sha256(dedicatedApp.appId), apiKeyHash: sha256(dedicatedApp.apiKey), vapidFingerprint: "c".repeat(64),
    },
  });
  const functionRow = (id, fields) => ({
    id, state: "ACTIVE", runtime: "nodejs22", region: "us-central1", maxInstances: 20, revision: "synthetic-revision",
    configurationHash: "e".repeat(64), automaticOffersMode: "disabled", cleanerPushMode: "disabled", ...fields,
  });
  const report = {
    functionsComplete: true, noPendingFunctionOperations: true, iam: { ok: true },
    deploymentPrerequisites: { existingServiceAgents: true, unavailableApis: [], artifactCleanupConfigured: true },
    reminderSchedules: [{ compatible: true }, { compatible: true }],
    hostingVersion: "B-version", hostingRelease: "B-release", ruleset: "ruleset", rulesUpdated: "timestamp",
    firestoreRulesSha256: "f".repeat(64), releaseLock: { state: "AVAILABLE" },
    fcmRegistrationApi: "ENABLED", fcmDeliveryApi: "ENABLED",
    functions: [
      ...["listNotificationInbox", "markNotificationRead", "openNotificationInboxItem"]
        .map((name) => functionRow(name, { inboxMode: "enabled" })),
      ...[...deployGroups.prepareB, ...deployGroups.enable].map((name) => functionRow(name, {
        cleanerPushMode: "pilot", cleanerPushPilotRelease: sourceSha,
      })),
    ],
  };
  const receipt = { schema: 1, state: "COMPLETE", action: "publish", sha: sourceSha,
    planHash: sha256(planBytes), artifactHash, snapshot: releaseBSnapshot(report) };
  const records = new Map([
    [memberPath, { fields: { organizationId: str(organizationId), cleanerId: str(cleanerId), role: str("CLEANER"),
      active: { booleanValue: true }, sessionIds: { arrayValue: { values: [str(sessionId)] } } } }],
    [profilePath, { fields: { organizationId: str(organizationId), active: { booleanValue: true } } }],
  ]);
  const reads = [];
  const writes = [];
  let transactionCount = 0;
  let inspections = 0;
  const read = async (path, mask) => {
    reads.push({ path, mask });
    return records.get(path) ?? null;
  };
  const requestBytes = record(request);
  const settings = {
    requestBytes, planBytes, receipt, sourceSha, now: () => nowMs,
    inspectRelease: async () => { inspections += 1; return { report, dedicatedApp }; },
    readDocument: read,
    writeTransaction: async (action) => {
      transactionCount += 1;
      return action({
        read,
        commit: async (write) => {
          writes.push(write);
          records.set(write.update.name, { fields: { ...write.update.fields, approvedAt } });
        },
      });
    },
  };
  return { settings, writes, reads, records, report, receipt, dedicatedApp, inspections: () => inspections,
    transactions: () => transactionCount, approve: `grant:${sha256(requestBytes)}` };
}

test("dry run reads only the exact subject and lock, and returns an approval hash", async () => {
  const f = fixture();
  assert.deepEqual(await approveCleanerPushPilot(f.settings),
    { state: "DRY_RUN_READY", requiredApproval: f.approve, expiresAt });
  assert.equal(f.inspections(), 1);
  assert.equal(f.transactions(), 0);
  assert.deepEqual(f.reads.map(({ path }) => path), [memberPath, profilePath, grantPath, lockPath]);
  assert.ok(!f.reads.find(({ path }) => path === profilePath).mask.includes("name"));
  assert.equal(f.writes.length, 0);
});

test("matching approval creates exactly one strict grant, with server time, and repeats without extension", async () => {
  const f = fixture();
  const approved = { ...f.settings, approval: f.approve };
  assert.deepEqual(await approveCleanerPushPilot(approved),
    { state: "GRANTED", requestHash: sha256(f.settings.requestBytes), expiresAt });
  assert.deepEqual(f.writes, [{
    update: {
      name: grantPath,
      fields: {
        organizationId: str(organizationId), cleanerId: str(cleanerId), uid: str(uid), sessionId: str(sessionId),
        deviceId: str(deviceId), releaseSha: str(sourceSha), active: { booleanValue: true }, expiresAt: { timestampValue: expiresAt },
      },
    },
    currentDocument: { exists: false },
    updateTransforms: [{ fieldPath: "approvedAt", setToServerValue: "REQUEST_TIME" }],
  }]);
  assert.equal((await approveCleanerPushPilot(approved)).state, "ALREADY_GRANTED");
  assert.equal((await approveCleanerPushPilot(f.settings)).state, "ALREADY_GRANTED");
  assert.equal(f.writes.length, 1);
  const modified = record({ ...request, expiresAt: "2026-11-05T02:00:00.000Z" });
  await assert.rejects(approveCleanerPushPilot({ ...approved, requestBytes: modified, approval: `grant:${sha256(modified)}` }), /conflicts/);
  assert.equal(f.writes.length, 1);
});

test("rejects unreviewed input before any cloud read or write", async () => {
  const invalid = [
    { sourceSha: "a".repeat(39) },
    { receipt: { state: "STARTING" } },
    { approval: "grant:wrong" },
    ...[
      { cleanerId: "../other" }, { organizationId: "another" },
      { pairingCode: [request.pairingCode] }, { expiresAt: "2026-11-06T00:00:00.000Z" },
      { expiresAt: "2026-11-04T21:00:00.000Z" }, { token: "synthetic-token" },
    ].map((change) => ({ requestBytes: record({ ...request, ...change }) })),
  ];
  for (const change of invalid) {
    const f = fixture();
    await assert.rejects(approveCleanerPushPilot({ ...f.settings, ...change }));
    assert.equal(f.inspections(), 0);
    assert.equal(f.reads.length, 0);
    assert.equal(f.writes.length, 0);
  }
});

test("fails closed when live receipt, release SHA, project, app binding or lock differs", async () => {
  const changes = [
    (f) => { f.report.hostingVersion = "different"; },
    (f) => {
      f.report.functions.at(-1).cleanerPushPilotRelease = "b".repeat(40);
      f.receipt.snapshot = releaseBSnapshot(f.report);
    },
    (f) => { f.dedicatedApp.projectId = "wrong-project"; },
    (f) => { f.dedicatedApp.apiKey = "different"; },
    (f) => { f.report.releaseLock.state = "HELD"; },
  ];
  for (const change of changes) {
    const f = fixture();
    change(f);
    await assert.rejects(approveCleanerPushPilot({ ...f.settings, approval: f.approve }), /exact COMPLETE/);
    assert.equal(f.reads.length, 0);
    assert.equal(f.transactions(), 0);
  }
});

test("transaction refuses revoked sessions, archived cleaners, held release lock or prior malformed grant", async () => {
  const changes = [
    (f) => { f.records.get(memberPath).fields.active.booleanValue = false; },
    (f) => { f.records.get(memberPath).fields.sessionIds.arrayValue.values = [str("other-session")]; },
    (f) => { f.records.get(profilePath).fields.archivedAt = approvedAt; },
    (f) => { f.records.set(lockPath, { fields: { action: str("rollback") } }); },
    (f) => { f.records.set(grantPath, { fields: { active: { booleanValue: false } } }); },
  ];
  for (const change of changes) {
    const f = fixture();
    change(f);
    await assert.rejects(approveCleanerPushPilot({ ...f.settings, approval: f.approve }), /unavailable|conflicts/);
    assert.equal(f.transactions(), 1);
    assert.equal(f.writes.length, 0);
  }
});

test("does not claim a write or retry when commit readback differs", async () => {
  const f = fixture();
  const writeTransaction = async (action) => action({
    read: f.settings.readDocument,
    commit: async (write) => f.writes.push(write),
  });
  await assert.rejects(approveCleanerPushPilot({ ...f.settings, approval: f.approve, writeTransaction }), /could not be confirmed/);
  assert.equal(f.writes.length, 1);
});

test("requires a private owned file and refuses symlinks and hard links", (context) => {
  const worktree = mkdtempSync(join(tmpdir(), "synthetic-cleaner-pilot-"));
  const real = realpathSync(worktree);
  context.after(() => rmSync(worktree, { recursive: true, force: true }));
  const base = join(real, ".tmp");
  mkdirSync(base, { mode: 0o700 });
  const path = join(base, "request.json");
  writeFileSync(path, record(request), { mode: 0o600 });
  assert.deepEqual(readPrivatePilotRequest(path, real), record(request));
  chmodSync(path, 0o644);
  assert.throws(() => readPrivatePilotRequest(path, real), /0600/);
  chmodSync(path, 0o600);
  const symlink = join(base, "request-symlink");
  symlinkSync(path, symlink);
  assert.throws(() => readPrivatePilotRequest(symlink, real), /without symlinks/);
  linkSync(path, join(base, "request-hardlink"));
  assert.throws(() => readPrivatePilotRequest(path, real), /regular file/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { cleanerAccountUid } from "../functions/src/cleanerHubAccess.js";
import {
  currentGrants, grantRequest, pilotStatus, pilotTestEventId, resolvePairing, sendPilotTest, summarizeDelivery,
} from "./cleanerPushPilot.mjs";
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
const documents = `projects/${notificationProject}/databases/(default)/documents`;
const org = `${documents}/organizations/${organizationId}`;
const lockPath = `${documents}/cleanflowReleaseControl/production`;
const str = (value) => ({ stringValue: value });
const record = (value) => Buffer.from(JSON.stringify(value));
const testRequest = { kind: "PUSH_TEST", organizationId, cleanerId, nonce: "0b6f6c8e-6d0e-4a8b-9a77-2f1d8f5d1c11" };
const eventId = pilotTestEventId(testRequest);
const eventPath = `${org}/cleanerNotificationInboxes/${cleanerId}/items/${eventId}`;
const deliveryPath = `${org}/cleanerNotificationDeliveries/${eventId}`;

function release() {
  const dedicatedApp = { projectId: notificationProject, appId: "synthetic-app", apiKey: "synthetic-api" };
  const planBytes = record({
    schema: 1, project: notificationProject, branch: releaseBBranch, sha: sourceSha, artifactHash,
    pilotPolicy: "explicit-device-approval", steps: releaseBSteps,
    cleanerBinding: { appIdHash: sha256(dedicatedApp.appId), apiKeyHash: sha256(dedicatedApp.apiKey), vapidFingerprint: "c".repeat(64) },
  });
  const row = (id, fields) => ({
    id, state: "ACTIVE", runtime: "nodejs22", region: "us-central1", maxInstances: 20, revision: "r",
    configurationHash: "e".repeat(64), automaticOffersMode: "disabled", cleanerPushMode: "disabled", ...fields,
  });
  const report = {
    functionsComplete: true, noPendingFunctionOperations: true, iam: { ok: true },
    deploymentPrerequisites: { existingServiceAgents: true, unavailableApis: [], artifactCleanupConfigured: true },
    reminderSchedules: [{ compatible: true }, { compatible: true }],
    hostingVersion: "B", hostingRelease: "B", ruleset: "rules", rulesUpdated: "t", firestoreRulesSha256: "f".repeat(64),
    releaseLock: { state: "AVAILABLE" }, fcmRegistrationApi: "ENABLED", fcmDeliveryApi: "ENABLED",
    functions: [
      ...deployGroups.inboxUpdate.map((name) => row(name, { inboxMode: "enabled" })),
      ...[...deployGroups.prepareB, ...deployGroups.enable].map((name) => row(name, { cleanerPushMode: "pilot", cleanerPushPilotRelease: sourceSha })),
    ],
  };
  const receipt = { schema: 1, state: "COMPLETE", action: "publish", sha: sourceSha, planHash: sha256(planBytes), artifactHash,
    snapshot: releaseBSnapshot(report) };
  return { planBytes, receipt, sourceSha, inspectRelease: async () => ({ report, dedicatedApp }), report };
}

function grantDocument(fields = {}) {
  return { name: `${org}/cleanerPushPilotSessions/${sessionId}`, fields: {
    cleanerId: str(cleanerId), sessionId: str(sessionId), deviceId: str(deviceId), active: { booleanValue: true },
    releaseSha: str(sourceSha), approvedAt: { timestampValue: new Date(nowMs - 60_000).toISOString() },
    expiresAt: { timestampValue: new Date(nowMs + 3_600_000).toISOString() }, ...fields,
  } };
}

function fixture({ grants = [grantDocument()], members, locked = false } = {}) {
  const records = new Map([[`${org}/cleaners/${cleanerId}`, { fields: { active: { booleanValue: true } } }]]);
  if (locked) records.set(lockPath, { fields: { action: str("B-publish") } });
  const memberDocs = members ?? [{ name: `${org}/members/${uid}`, fields: {
    organizationId: str(organizationId), cleanerId: str(cleanerId), role: str("CLEANER"), active: { booleanValue: true },
    sessionIds: { arrayValue: { values: [str(sessionId)] } },
  } }];
  const queries = [];
  const writes = [];
  const readDocument = async (path) => records.get(path) ?? null;
  const runQuery = async (parent, query) => {
    queries.push({ parent, query });
    const collection = query.from[0].collectionId;
    if (collection === "members") {
      const { field: { fieldPath }, op } = query.where.fieldFilter;
      return memberDocs.filter((doc) => (op === "ARRAY_CONTAINS"
        ? doc.fields[fieldPath]?.arrayValue?.values?.some((v) => v.stringValue === sessionId)
        : doc.fields[fieldPath]?.stringValue === sessionId));
    }
    if (collection === "cleanerPushPilotSessions") return grants;
    if (collection === "devices") return [{ name: `${org}/cleanerPushAccounts/${uid}/devices/${sessionId}`, fields: {
      deviceId: str(deviceId), platform: str("ios-pwa"), active: { booleanValue: true }, tokenState: str("active"),
      permission: str("granted"),
    } }];
    if (collection === "cleanerNotificationDeliveries") return records.has(deliveryPath) ? [records.get(deliveryPath)] : [];
    return [];
  };
  const writeTransaction = async (action) => action({
    read: readDocument,
    commit: async (write) => {
      writes.push(write);
      records.set(write.update.name, { fields: write.update.fields });
      // Synthetic stand-in for the Function trigger and FCM acceptance.
      records.set(deliveryPath, { fields: {
        eventId: str(eventId), type: str("PUSH_TEST"), deliveryStatus: str("FCM_ACCEPTED"),
        pendingProviderResult: { booleanValue: false }, targetDeviceCount: { integerValue: "1" },
        acceptedByFcmDevices: { integerValue: "1" }, stages: { arrayValue: { values: [str("PUSH_ATTEMPTED"), str("PROVIDER_ACCEPTED")] } },
        devices: { arrayValue: { values: [{ mapValue: { fields: { installationKey: str("f".repeat(64)), outcome: str("PROVIDER_ACCEPTED") } } }] } },
      } });
    },
  });
  return { ...release(), readDocument, runQuery, writeTransaction, records, writes, queries,
    now: () => nowMs, wait: async () => {}, requestBytes: record(testRequest) };
}

test("pairing reference resolves exactly one active cleaner session and projects only identity fields", async () => {
  const f = fixture();
  assert.deepEqual(await resolvePairing({ pairingCode: `${sessionId}.${deviceId}`, ...f }),
    { organizationId, cleanerId, pairingCode: `${sessionId}.${deviceId}` });
  for (const { query } of f.queries) assert.ok(!JSON.stringify(query.select).includes("name"));
  await assert.rejects(resolvePairing({ pairingCode: "not-a-reference", ...f }), /malformed/);
  await assert.rejects(resolvePairing({ pairingCode: `${sessionId}.${deviceId}`, ...fixture({ members: [] }) }), /No single/);
  const inactive = fixture({ members: [{ name: "m", fields: { organizationId: str(organizationId), cleanerId: str(cleanerId),
    role: str("CLEANER"), active: { booleanValue: false }, sessionIds: { arrayValue: { values: [str(sessionId)] } } } }] });
  await assert.rejects(resolvePairing({ pairingCode: `${sessionId}.${deviceId}`, ...inactive }), /not active/);
});

test("grant requests expire within 24 hours on a whole second", () => {
  const request = grantRequest({ organizationId, cleanerId, pairingCode: "p" }, 12, nowMs + 456);
  assert.equal(request.expiresAt, "2026-11-05T10:00:00.000Z");
  assert.throws(() => grantRequest({}, 25, nowMs), /between 1 and 24/);
  assert.throws(() => grantRequest({}, 0, nowMs), /between 1 and 24/);
});

test("test dry run needs a current grant for the live release and writes nothing", async () => {
  const f = fixture();
  const result = await sendPilotTest(f);
  assert.deepEqual(result, { state: "DRY_RUN_READY", requiredApproval: `test:${sha256(f.requestBytes)}`, approvedInstallations: 1 });
  assert.equal(f.writes.length, 0);
  for (const grants of [[], [grantDocument({ active: { booleanValue: false } })],
    [grantDocument({ releaseSha: str("9".repeat(40)) })],
    [grantDocument({ expiresAt: { timestampValue: new Date(nowMs - 1).toISOString() } })]]) {
    await assert.rejects(sendPilotTest(fixture({ grants })), /no current approved installation/);
  }
  await assert.rejects(sendPilotTest({ ...f, approval: "test:wrong" }), /does not match/);
});

test("approved test stores one server-timed PUSH_TEST record and reports a token-free outcome", async () => {
  const f = fixture();
  const approval = `test:${sha256(f.requestBytes)}`;
  const result = await sendPilotTest({ ...f, approval });
  assert.equal(result.state, "TEST_STORED");
  assert.equal(result.delivery.deliveryStatus, "FCM_ACCEPTED");
  assert.deepEqual(result.delivery.devices, [{ installation: "ffffffffff", outcome: "PROVIDER_ACCEPTED" }]);
  assert.deepEqual(f.writes, [{
    update: { name: eventPath, fields: {
      eventId: str(eventId), organizationId: str(organizationId), cleanerId: str(cleanerId), type: str("PUSH_TEST"),
      eventVersion: { integerValue: "1" }, processingState: str("STORED"), priority: str("HIGH"), transitionKey: str("operator-test"),
    } },
    currentDocument: { exists: false },
    updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
  }]);
  assert.equal((await sendPilotTest({ ...f, approval })).state, "TEST_ALREADY_STORED");
  assert.equal(f.writes.length, 1);
  await assert.rejects(sendPilotTest({ ...fixture({ locked: true }), approval }), /locked/);
});

test("status lists grants, devices and deliveries without registration tokens", async () => {
  const f = fixture();
  await sendPilotTest({ ...f, approval: `test:${sha256(f.requestBytes)}` });
  const status = await pilotStatus({ ...f, cleanerId, testRequestBytes: f.requestBytes });
  assert.equal(status.release.state, "LIVE_B_PILOT");
  assert.equal(status.grants[0].current, true);
  assert.equal(status.devices[0].platform, "ios-pwa");
  assert.equal(status.test.delivery.acceptedByFcmDevices, 1);
  assert.equal(status.test.readInHistoryAt, null);
  const text = JSON.stringify(status);
  assert.ok(!text.includes(sessionId) && !text.includes(deviceId) && !text.includes("token\""));
  const devicesQuery = f.queries.find(({ query }) => query.from[0].collectionId === "devices").query;
  assert.ok(!devicesQuery.select.fields.some(({ fieldPath }) => fieldPath === "token"));
});

test("grant filter and delivery summary are strict", () => {
  assert.equal(currentGrants([grantDocument()], { cleanerId: "other", releaseSha: sourceSha }, nowMs).length, 0);
  assert.equal(summarizeDelivery(null), null);
});

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { cleanerAccountUid, eligibleCleaner, isActiveCleanerSession } from "../functions/src/cleanerHubAccess.js";
import { cleanerPushPilotCollection } from "../functions/src/cleanerPushPilot.js";
import {
  PilotError, approveCleanerPushPilot, firestoreAccess, parseRecord, readPrivatePilotRequest, reviewedRelease, verifyRelease,
} from "./approveCleanerPushPilot.mjs";
import { notificationProject, readNotificationProduction, sha256 } from "./notificationReleaseCloud.mjs";
import { releaseBBranch } from "./preflightNotificationRelease.mjs";

// Operator tool for the restricted cleaner push pilot. Every Production write
// needs the exact hash printed by a previous dry run. Output never contains
// registration tokens, names, full session or installation identifiers.

const root = resolve(import.meta.dirname, "..");
export const pilotOrganizationId = "cleanflow-demo";
const documents = `projects/${notificationProject}/databases/(default)/documents`;
const org = (organizationId) => `${documents}/organizations/${organizationId}`;
const lockPath = `${documents}/cleanflowReleaseControl/production`;
const pairingPattern = /^([a-f0-9]{32})\.([A-Za-z0-9-]{16,80})$/;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const ttlMaxMs = 86_400_000;
const requireCondition = (condition, message) => { if (!condition) throw new PilotError(message); };
const short = (value) => (typeof value === "string" && value ? sha256(value).slice(0, 10) : null);
const str = (value) => ({ stringValue: value });
const select = (...paths) => ({ fields: paths.map((fieldPath) => ({ fieldPath })) });
const field = (document, name) => {
  const value = document?.fields?.[name];
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map((entry) => entry.stringValue ?? entry.integerValue);
  if ("nullValue" in value) return null;
  return undefined;
};

function memberData(document) {
  const sessionIds = field(document, "sessionIds");
  return {
    organizationId: field(document, "organizationId"), cleanerId: field(document, "cleanerId"), role: field(document, "role"),
    active: field(document, "active"), sessionId: field(document, "sessionId"),
    ...(Array.isArray(sessionIds) ? { sessionIds } : {}),
  };
}

/** Resolves the cleaner from the pairing reference shown in their signed-in Hub. */
export async function resolvePairing({ pairingCode, organizationId = pilotOrganizationId, runQuery, readDocument }) {
  const pairing = typeof pairingCode === "string" && pairingPattern.exec(pairingCode.trim());
  requireCondition(pairing, "The pairing reference is malformed. Copy it from Minha agenda > Conta > Avisos no celular.");
  const [, sessionId] = pairing;
  const parent = org(organizationId);
  const byField = (path, op, value) => ({
    from: [{ collectionId: "members" }], select: select("organizationId", "cleanerId", "role", "active", "sessionId", "sessionIds"),
    where: { fieldFilter: { field: { fieldPath: path }, op, value: str(value) } }, limit: 3,
  });
  const found = new Map();
  for (const query of [byField("sessionIds", "ARRAY_CONTAINS", sessionId), byField("sessionId", "EQUAL", sessionId)]) {
    for (const document of await runQuery(parent, query)) found.set(document.name, document);
  }
  const members = [...found.values()].map(memberData)
    .filter((member) => member.role === "CLEANER" && idPattern.test(member.cleanerId ?? ""));
  requireCondition(members.length === 1, "No single active cleaner session matches this pairing reference.");
  const [{ cleanerId }] = members;
  const identity = { organizationId, cleanerId, uid: cleanerAccountUid(organizationId, cleanerId), sessionId };
  requireCondition(isActiveCleanerSession(members[0], identity), "The cleaner session for this reference is not active.");
  const profile = await readDocument(`${parent}/cleaners/${cleanerId}`, ["organizationId", "active", "archivedAt"]);
  const archived = profile?.fields?.archivedAt && !Object.hasOwn(profile.fields.archivedAt, "nullValue");
  requireCondition(eligibleCleaner({ active: field(profile, "active"), archivedAt: archived ? true : null }),
    "The cleaner profile is inactive or archived.");
  return { organizationId, cleanerId, pairingCode: pairing[0] };
}

export function grantRequest({ organizationId, cleanerId, pairingCode }, hours, nowMs) {
  requireCondition(Number.isFinite(hours) && hours > 0 && hours * 3_600_000 <= ttlMaxMs, "Use --hours between 1 and 24.");
  const expiresAt = new Date(Math.floor((nowMs + hours * 3_600_000) / 1000) * 1000).toISOString();
  return { organizationId, cleanerId, pairingCode, expiresAt };
}

export function testRequestIdentity(bytes) {
  const record = parseRecord(bytes);
  const keys = ["kind", "organizationId", "cleanerId", "nonce"];
  requireCondition(Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key))
    && record.kind === "PUSH_TEST" && record.organizationId === pilotOrganizationId
    && idPattern.test(record.cleanerId ?? "") && /^[0-9a-f-]{36}$/.test(record.nonce ?? ""),
  "Pilot test request is invalid.");
  return record;
}

export function pilotTestEventId({ organizationId, cleanerId, nonce }) {
  return sha256(JSON.stringify(["cleaner-push-test", organizationId, cleanerId, nonce]));
}

export function pilotTestWrite(name, { organizationId, cleanerId }, eventId) {
  return {
    update: {
      name,
      fields: {
        eventId: str(eventId), organizationId: str(organizationId), cleanerId: str(cleanerId), type: str("PUSH_TEST"),
        eventVersion: { integerValue: "1" }, processingState: str("STORED"), priority: str("HIGH"),
        transitionKey: str("operator-test"),
      },
    },
    currentDocument: { exists: false },
    updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
  };
}

export function currentGrants(grantDocuments, { cleanerId, releaseSha }, nowMs) {
  return grantDocuments.filter((document) => field(document, "cleanerId") === cleanerId
    && field(document, "active") === true && field(document, "releaseSha") === releaseSha
    && Date.parse(field(document, "approvedAt")) <= nowMs && Date.parse(field(document, "expiresAt")) > nowMs);
}

export function summarizeGrant(document) {
  return {
    session: short(field(document, "sessionId")), installation: short(field(document, "deviceId")),
    active: field(document, "active") === true, approvedAt: field(document, "approvedAt") ?? null,
    expiresAt: field(document, "expiresAt") ?? null, releaseSha: field(document, "releaseSha") ?? null,
  };
}

export function summarizeDevice(document) {
  return {
    session: short(document.name.split("/").at(-1)), installation: short(field(document, "deviceId")),
    platform: field(document, "platform") ?? null, active: field(document, "active") === true,
    tokenState: field(document, "tokenState") ?? null, permission: field(document, "permission") ?? null,
    updatedAt: document.updateTime ?? null,
  };
}

export function summarizeDelivery(document) {
  if (!document) return null;
  const devices = document.fields?.devices?.arrayValue?.values || [];
  return {
    event: short(field(document, "eventId")), type: field(document, "type") ?? null,
    deliveryStatus: field(document, "deliveryStatus") ?? null,
    pending: field(document, "pendingProviderResult") === true,
    targetDeviceCount: field(document, "targetDeviceCount") ?? 0,
    acceptedByFcmDevices: field(document, "acceptedByFcmDevices") ?? 0,
    rejectedDevices: field(document, "rejectedDevices") ?? 0, unknownDevices: field(document, "unknownDevices") ?? 0,
    stages: field(document, "stages") ?? [], failureCode: field(document, "failureCode") ?? null,
    devices: devices.map((entry) => ({
      installation: entry.mapValue?.fields?.installationKey?.stringValue?.slice(0, 10) ?? null,
      outcome: entry.mapValue?.fields?.outcome?.stringValue ?? null,
    })),
    recordedAt: field(document, "recordedAt") ?? null, completedAt: field(document, "completedAt") ?? null,
  };
}

async function liveRelease({ planBytes, receipt, sourceSha, inspectRelease }) {
  const reviewed = reviewedRelease(planBytes, receipt, sourceSha);
  verifyRelease(reviewed, receipt, await inspectRelease());
  return reviewed.plan;
}

async function grantsFor(runQuery, { organizationId, cleanerId }) {
  return runQuery(org(organizationId), {
    from: [{ collectionId: cleanerPushPilotCollection }],
    select: select("cleanerId", "sessionId", "deviceId", "active", "releaseSha", "approvedAt", "expiresAt"),
    where: { fieldFilter: { field: { fieldPath: "cleanerId" }, op: "EQUAL", value: str(cleanerId) } }, limit: 20,
  });
}

/** Dry run without approval; with `test:<hash>` it stores one PUSH_TEST Inbox record. */
export async function sendPilotTest({
  requestBytes, planBytes, receipt, sourceSha, approval, inspectRelease, readDocument, runQuery, writeTransaction,
  now = Date.now, wait = sleep, pollMs = 3_000, timeoutMs = 90_000,
}) {
  const request = testRequestIdentity(requestBytes);
  const requestHash = sha256(requestBytes);
  const requiredApproval = `test:${requestHash}`;
  requireCondition(approval === undefined || approval === requiredApproval, "Approval does not match the exact test request.");
  const plan = await liveRelease({ planBytes, receipt, sourceSha, inspectRelease });
  const identity = { organizationId: request.organizationId, cleanerId: request.cleanerId };
  const approvedDevices = currentGrants(await grantsFor(runQuery, identity), { ...identity, releaseSha: plan.sha }, now());
  requireCondition(approvedDevices.length > 0, "This cleaner has no current approved installation. Enroll a device first.");
  const eventId = pilotTestEventId(request);
  const eventPath = `${org(identity.organizationId)}/cleanerNotificationInboxes/${identity.cleanerId}/items/${eventId}`;
  const deliveryPath = `${org(identity.organizationId)}/cleanerNotificationDeliveries/${eventId}`;
  if (approval === undefined) {
    return { state: "DRY_RUN_READY", requiredApproval, approvedInstallations: approvedDevices.length };
  }

  const created = await writeTransaction(async ({ read, commit }) => {
    const [existing, lock] = await Promise.all([read(eventPath), read(lockPath, ["action"])]);
    requireCondition(!lock, "The Production release is locked. No test notice was written.");
    if (existing) return false;
    await commit(pilotTestWrite(eventPath, identity, eventId));
    return true;
  });
  let delivery = null;
  for (let waited = 0; waited <= timeoutMs; waited += pollMs) {
    delivery = summarizeDelivery(await readDocument(deliveryPath));
    if (delivery && !delivery.pending) break;
    await wait(pollMs);
  }
  return {
    state: created ? "TEST_STORED" : "TEST_ALREADY_STORED", event: short(eventId),
    approvedInstallations: approvedDevices.length, delivery: delivery ?? { deliveryStatus: "NOT_YET_RECORDED" },
  };
}

/** Read-only diagnostics for one cleaner; optional event shows read and open receipts. */
export async function pilotStatus({ planBytes, receipt, sourceSha, inspectRelease, readDocument, runQuery, cleanerId, testRequestBytes, now = Date.now }) {
  let release;
  try {
    release = { state: "LIVE_B_PILOT", sha: (await liveRelease({ planBytes, receipt, sourceSha, inspectRelease })).sha };
  } catch (error) {
    release = { state: "NOT_VERIFIED", reason: error instanceof PilotError ? error.message : "Release could not be verified." };
  }
  const result = { release };
  if (!cleanerId) return result;
  requireCondition(idPattern.test(cleanerId), "Cleaner ID is invalid.");
  const identity = { organizationId: pilotOrganizationId, cleanerId };
  const uid = cleanerAccountUid(pilotOrganizationId, cleanerId);
  const grants = await grantsFor(runQuery, identity);
  const devices = await runQuery(`${org(pilotOrganizationId)}/cleanerPushAccounts/${uid}`, {
    from: [{ collectionId: "devices" }],
    select: select("deviceId", "platform", "active", "tokenState", "permission"), limit: 20,
  });
  const deliveries = await runQuery(org(pilotOrganizationId), {
    from: [{ collectionId: "cleanerNotificationDeliveries" }],
    select: select("eventId", "type", "deliveryStatus", "pendingProviderResult", "targetDeviceCount", "acceptedByFcmDevices",
      "rejectedDevices", "unknownDevices", "stages", "failureCode", "devices", "recordedAt", "completedAt"),
    where: { fieldFilter: { field: { fieldPath: "cleanerId" }, op: "EQUAL", value: str(cleanerId) } }, limit: 50,
  });
  const nowMs = now();
  Object.assign(result, {
    grants: grants.map(summarizeGrant).map((grant) => ({
      ...grant, current: grant.active && Date.parse(grant.expiresAt) > nowMs && grant.releaseSha === release.sha,
    })),
    devices: devices.map(summarizeDevice),
    recentDeliveries: deliveries.map(summarizeDelivery)
      .sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt))).slice(0, 10),
  });
  if (testRequestBytes) {
    const request = testRequestIdentity(testRequestBytes);
    requireCondition(request.cleanerId === cleanerId, "The test request belongs to another cleaner.");
    const eventId = pilotTestEventId(request);
    const receiptDoc = await readDocument(`${org(pilotOrganizationId)}/notificationInboxReadStates/${uid}/items/${eventId}`);
    result.test = {
      event: short(eventId),
      delivery: summarizeDelivery(await readDocument(`${org(pilotOrganizationId)}/cleanerNotificationDeliveries/${eventId}`)),
      readInHistoryAt: field(receiptDoc, "readAt") ?? null,
    };
  }
  return result;
}

function writePrivate(kind, record) {
  const directory = join(root, ".tmp", "cleaner-push-pilot");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${new Date().toISOString().replace(/[:.]/g, "-")}-${kind}.json`);
  writeFileSync(file, JSON.stringify(record), { flag: "wx", mode: 0o600 });
  return file;
}

async function runCli() {
  const [command, ...args] = process.argv.slice(2);
  const { values } = parseArgs({ args, options: {
    dir: { type: "string" }, pairing: { type: "string" }, hours: { type: "string" }, request: { type: "string" },
    cleaner: { type: "string" }, approve: { type: "string" },
  } });
  requireCondition(["enroll", "grant", "test", "status"].includes(command) && values.dir,
    "Use enroll|grant|test|status with --dir <sealed Release B directory>.");
  const git = (...gitArgs) => execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  requireCondition(process.versions.node.split(".")[0] === "22" && realpathSync(process.cwd()) === root
    && git("branch", "--show-current") === releaseBBranch && !git("status", "--porcelain"),
  "Use the clean Release B worktree and Node 22.");
  for (const name of ["FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT",
    "FIREBASE_CONFIG", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FUNCTIONS_EMULATOR"]) {
    requireCondition(!process.env[name], "Use the authenticated Firebase CLI session without environment overrides.");
  }
  const directory = realpathSync(resolve(values.dir));
  const planBytes = readFileSync(join(directory, "release-plan-B.json"));
  const receipt = parseRecord(readFileSync(join(directory, "publish-receipt-B.json")));
  const sourceSha = git("rev-parse", "HEAD");
  const inspectRelease = () => readNotificationProduction("B");
  const access = firestoreAccess();
  const context = { planBytes, receipt, sourceSha, inspectRelease, ...access };
  const print = (value) => console.log(JSON.stringify(value, null, 2));

  if (command === "enroll") {
    // Verifies the live release before reading any account metadata.
    await liveRelease(context);
    const subject = await resolvePairing({ pairingCode: values.pairing, ...access });
    const request = grantRequest(subject, Number(values.hours ?? 12), Date.now());
    const file = writePrivate("grant", request);
    const dryRun = await approveCleanerPushPilot({ ...context, requestBytes: readPrivatePilotRequest(file) });
    print({ ...dryRun, cleanerId: subject.cleanerId, request: file,
      next: `node scripts/cleanerPushPilot.mjs grant --dir "${values.dir}" --request "${file}" --approve ${dryRun.requiredApproval}` });
  } else if (command === "grant") {
    requireCondition(values.request, "Use --request <file printed by enroll>.");
    print(await approveCleanerPushPilot({ ...context, requestBytes: readPrivatePilotRequest(values.request), approval: values.approve }));
  } else if (command === "test") {
    let file = values.request;
    if (!file) {
      requireCondition(idPattern.test(values.cleaner ?? ""), "Use --cleaner <cleanerId printed by enroll>.");
      file = writePrivate("test", { kind: "PUSH_TEST", organizationId: pilotOrganizationId, cleanerId: values.cleaner, nonce: randomUUID() });
    }
    const result = await sendPilotTest({ ...context, requestBytes: readPrivatePilotRequest(file), approval: values.approve });
    print({ ...result, request: file, ...(result.state === "DRY_RUN_READY" ? {
      next: `node scripts/cleanerPushPilot.mjs test --dir "${values.dir}" --request "${file}" --approve ${result.requiredApproval}`,
    } : {}) });
  } else {
    print(await pilotStatus({ ...context, cleanerId: values.cleaner,
      testRequestBytes: values.request ? readPrivatePilotRequest(values.request) : undefined }));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof PilotError ? error.message : "The pilot command could not be verified. Inspect local inputs before retrying.");
    process.exitCode = 1;
  }
}

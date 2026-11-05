import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { cleanerAccountUid, eligibleCleaner, isActiveCleanerSession } from "../functions/src/cleanerHubAccess.js";
import { cleanerPushPilotCollection } from "../functions/src/cleanerPushPilot.js";
import { notificationProject, readNotificationProduction, sha256 } from "./notificationReleaseCloud.mjs";
import { deployGroups, releaseBBranch } from "./preflightNotificationRelease.mjs";
import { releaseBSnapshot, releaseBSteps, verifiedBReceipt } from "./releaseNotificationB.mjs";

const root = resolve(import.meta.dirname, "..");
const pilotOrganizationId = "cleanflow-demo";
const database = `projects/${notificationProject}/databases/(default)`;
const documents = `${database}/documents`;
const lockPath = `${documents}/cleanflowReleaseControl/production`;
const ttlMaxMs = 86_400_000;
const fullSha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const pairingPattern = /^([a-f0-9]{32})\.([A-Za-z0-9-]{16,80})$/;
const memberMask = ["organizationId", "cleanerId", "role", "active", "sessionId", "sessionIds"];
const profileMask = ["organizationId", "active", "archivedAt"];
const identityKeys = ["organizationId", "cleanerId", "uid", "sessionId", "deviceId", "releaseSha"];

export class PilotError extends Error {}
const requireCondition = (condition, message) => { if (!condition) throw new PilotError(message); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function parseRecord(bytes) {
  try {
    const record = JSON.parse(bytes);
    if (record && typeof record === "object" && !Array.isArray(record)) return record;
  } catch { /* Caller gets a fixed message without input data. */ }
  throw new PilotError("Invalid pilot input or release evidence.");
}

function insidePrivateDirectory(path, worktree) {
  if (!isAbsolute(path || "")) return false;
  const child = relative(join(worktree, ".tmp"), path);
  return child !== "" && !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`);
}

export function readPrivatePilotRequest(path, worktree = root) {
  requireCondition(insidePrivateDirectory(path, worktree) && realpathSync(path) === resolve(path),
    "Use an absolute request file under the ignored .tmp directory without symlinks.");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    requireCondition(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid()
      && (stat.mode & 0o777) === 0o600 && stat.size > 0 && stat.size <= 4096,
    "Pilot request must be a small owned regular file with mode 0600.");
    const bytes = readFileSync(fd);
    requireCondition(bytes.length === stat.size, "Pilot request changed while being read.");
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function requestIdentity(bytes, releaseSha, nowMs) {
  const record = parseRecord(bytes);
  const allowed = ["organizationId", "cleanerId", "pairingCode", "expiresAt"];
  const pairing = typeof record.pairingCode === "string" && pairingPattern.exec(record.pairingCode);
  const expiresMs = Date.parse(record.expiresAt);
  requireCondition(Object.keys(record).length === allowed.length && allowed.every((key) => Object.hasOwn(record, key))
    && record.organizationId === pilotOrganizationId && typeof record.cleanerId === "string"
    && /^[A-Za-z0-9_-]{1,128}$/.test(record.cleanerId) && pairing
    && Number.isFinite(expiresMs) && new Date(expiresMs).toISOString() === record.expiresAt
    && expiresMs > nowMs && expiresMs - nowMs <= ttlMaxMs,
  "Pilot request identity, pairing code or UTC expiry is invalid.");
  const { organizationId, cleanerId, expiresAt } = record;
  return {
    identity: { organizationId, cleanerId, uid: cleanerAccountUid(organizationId, cleanerId),
      sessionId: pairing[1], deviceId: pairing[2], releaseSha },
    expiresAt,
  };
}

export function reviewedRelease(planBytes, receipt, sourceSha) {
  const plan = parseRecord(planBytes);
  requireCondition(plan.schema === 1 && plan.project === notificationProject && plan.branch === releaseBBranch
    && fullSha.test(sourceSha ?? "") && plan.sha === sourceSha && digest.test(plan.artifactHash ?? "")
    && plan.pilotPolicy === "explicit-device-approval" && equal(plan.steps, releaseBSteps)
    && digest.test(plan.cleanerBinding?.appIdHash ?? "") && digest.test(plan.cleanerBinding?.apiKeyHash ?? "")
    && digest.test(plan.cleanerBinding?.vapidFingerprint ?? ""),
  "Use the exact sealed Production Release B plan and source SHA.");
  const receiptIdentity = { action: "publish", sha: plan.sha, planHash: sha256(planBytes), artifactHash: plan.artifactHash };
  requireCondition(receipt?.snapshot && verifiedBReceipt(receipt, { ...receiptIdentity, snapshot: receipt.snapshot }),
    "An exact COMPLETE Release B publication receipt is required.");
  return { plan, receiptIdentity };
}

export function verifyRelease({ plan, receiptIdentity }, receipt, live) {
  let snapshot;
  try { snapshot = releaseBSnapshot(live.report); } catch {
    throw new PilotError("Live Production Release B inventory is incomplete or drifted.");
  }
  requireCondition(verifiedBReceipt(receipt, { ...receiptIdentity, snapshot })
    && live.report.releaseLock?.state === "AVAILABLE"
    && [...deployGroups.prepareB, ...deployGroups.enable].every((name) => (
      snapshot.functions[name]?.cleanerPushMode === "pilot"
      && snapshot.functions[name].cleanerPushPilotRelease === plan.sha
    )) && live.report.fcmRegistrationApi === "ENABLED" && live.report.fcmDeliveryApi === "ENABLED"
    && live.dedicatedApp?.projectId === notificationProject
    && typeof live.dedicatedApp.appId === "string" && sha256(live.dedicatedApp.appId) === plan.cleanerBinding.appIdHash
    && typeof live.dedicatedApp.apiKey === "string" && sha256(live.dedicatedApp.apiKey) === plan.cleanerBinding.apiKeyHash,
  "Live Production must match the exact COMPLETE Release B pilot publication.");
}

function memberData(document) {
  const fields = document?.fields ?? {};
  return {
    organizationId: fields.organizationId?.stringValue,
    cleanerId: fields.cleanerId?.stringValue,
    role: fields.role?.stringValue,
    active: fields.active?.booleanValue,
    sessionId: fields.sessionId?.stringValue,
    ...(Object.hasOwn(fields, "sessionIds") ? {
      sessionIds: Array.isArray(fields.sessionIds?.arrayValue?.values)
        ? fields.sessionIds.arrayValue.values.map((entry) => entry.stringValue) : [],
    } : {}),
  };
}

function matchesGrant(document, identity, expiresAt, nowMs) {
  const fields = document?.fields;
  const approvedAtMs = Date.parse(fields?.approvedAt?.timestampValue);
  return Boolean(fields) && Object.keys(fields).length === identityKeys.length + 3
    && identityKeys.every((key) => fields[key]?.stringValue === identity[key])
    && fields.active?.booleanValue === true && Number.isFinite(approvedAtMs) && approvedAtMs <= nowMs
    && Date.parse(fields.expiresAt?.timestampValue) === Date.parse(expiresAt);
}

async function currentGrant(read, identity, paths) {
  const [member, profile, existing, lock] = await Promise.all([
    read(paths.member, memberMask), read(paths.profile, profileMask), read(paths.grant), read(lockPath, ["action"]),
  ]);
  const fields = profile?.fields;
  const profileData = { active: fields?.active?.booleanValue,
    archivedAt: fields?.archivedAt && !Object.hasOwn(fields.archivedAt, "nullValue") ? true : null };
  requireCondition(!lock && isActiveCleanerSession(memberData(member), identity)
    && eligibleCleaner(profileData)
    && (!fields.organizationId || fields.organizationId.stringValue === identity.organizationId),
  "The pilot session is unavailable or the Production release is locked.");
  return existing;
}

function grantWrite(name, identity, expiresAt) {
  return {
    update: {
      name,
      fields: {
        ...Object.fromEntries(identityKeys.map((key) => [key, { stringValue: identity[key] }])),
        active: { booleanValue: true }, expiresAt: { timestampValue: expiresAt },
      },
    },
    currentDocument: { exists: false },
    updateTransforms: [{ fieldPath: "approvedAt", setToServerValue: "REQUEST_TIME" }],
  };
}

/** The only mutation is one conditional grant in the approved database. */
export async function approveCleanerPushPilot({
  requestBytes, planBytes, receipt, sourceSha, approval, inspectRelease, readDocument, writeTransaction, now = Date.now,
}) {
  const { identity, expiresAt } = requestIdentity(requestBytes, sourceSha, now());
  const requestHash = sha256(requestBytes);
  const requiredApproval = `grant:${requestHash}`;
  requireCondition(approval === undefined || approval === requiredApproval, "Approval does not match the exact pilot request.");
  const reviewed = reviewedRelease(planBytes, receipt, sourceSha);
  verifyRelease(reviewed, receipt, await inspectRelease());

  const org = `${documents}/organizations/${identity.organizationId}`;
  const paths = {
    member: `${org}/members/${identity.uid}`,
    profile: `${org}/cleaners/${identity.cleanerId}`,
    grant: `${org}/${cleanerPushPilotCollection}/${identity.sessionId}`,
  };
  function checkedExisting(existing) {
    requireCondition(Date.parse(expiresAt) > now(), "The pilot request expired before approval.");
    if (!existing) return false;
    requireCondition(matchesGrant(existing, identity, expiresAt, now()),
      "An existing grant conflicts with this request. No grant was replaced or extended.");
    return true;
  }

  if (approval === undefined) {
    const existing = await currentGrant(readDocument, identity, paths);
    const state = checkedExisting(existing) ? "ALREADY_GRANTED" : "DRY_RUN_READY";
    return { state, requiredApproval, expiresAt };
  }

  const created = await writeTransaction(async ({ read, commit }) => {
    const existing = await currentGrant(read, identity, paths);
    if (checkedExisting(existing)) return false;
    await commit(grantWrite(paths.grant, identity, expiresAt));
    return true;
  });
  if (created) requireCondition(matchesGrant(await readDocument(paths.grant), identity, expiresAt, now()),
    "Pilot grant write could not be confirmed. Reconcile before attempting another approval.");
  return { state: created ? "GRANTED" : "ALREADY_GRANTED", requestHash, expiresAt };
}

export function firestoreAccess() {
  const require = createRequire(import.meta.url);
  const { getAccessToken } = require("firebase-tools/lib/apiv2");
  async function query(path, body) {
    // The verified Firebase CLI session is initialized by readNotificationProduction.
    // Use this fixed official endpoint directly so document IDs and payloads
    // never reach CLI debug loggers. A write is attempted at most once.
    const response = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      redirect: "error",
      headers: { Authorization: `Bearer ${await getAccessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    return { status: response.status, body: response.ok ? await response.json() : null };
  }
  async function readDocument(path, fields = [], transaction) {
    const params = new URLSearchParams();
    if (transaction) params.set("transaction", transaction);
    for (const field of fields) params.append("mask.fieldPaths", field);
    const suffix = params.size ? `?${params}` : "";
    const response = await query(`${path}${suffix}`);
    if (response.status === 404) return null;
    requireCondition(response.status === 200 && response.body?.name === path, "Required pilot metadata could not be read.");
    return response.body;
  }
  const post = (action, body) => query(`${documents}:${action}`, body);
  async function runQuery(parent, structuredQuery) {
    const response = await query(`${parent}:runQuery`, { structuredQuery });
    requireCondition(response.status === 200 && Array.isArray(response.body), "Required pilot metadata could not be queried.");
    return response.body.filter((row) => row.document).map((row) => row.document);
  }
  async function writeTransaction(operation) {
    const begun = await post("beginTransaction", { options: { readWrite: {} } });
    const transaction = begun.body?.transaction;
    requireCondition(begun.status === 200 && typeof transaction === "string" && transaction.length > 0,
      "The Firestore pilot transaction could not be started.");
    let committed = false;
    try {
      return await operation({
        read: (path, fields) => readDocument(path, fields, transaction),
        async commit(write) {
          let result;
          try { result = await post("commit", { transaction, writes: [write] }); } catch { /* Outcome may be ambiguous. */ }
          requireCondition(result?.status === 200 && result.body?.writeResults?.length === 1 && result.body.commitTime,
            "Pilot grant commit could not be confirmed. Reconcile before retrying.");
          committed = true;
        },
      });
    } finally {
      if (!committed) {
        // This only closes the Firestore transaction. It cannot retract a commit.
        try { await post("rollback", { transaction }); } catch { /* Let the transaction expire. */ }
      }
    }
  }
  return { readDocument, writeTransaction, runQuery };
}

async function runCli() {
  const { values } = parseArgs({ options: {
    request: { type: "string" }, dir: { type: "string" }, approve: { type: "string" },
  } });
  requireCondition(values.request && values.dir, "Use --request <absolute private .tmp file> --dir <sealed B review directory>.");
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  requireCondition(process.versions.node.split(".")[0] === "22" && realpathSync(process.cwd()) === root
    && git("branch", "--show-current") === releaseBBranch && !git("status", "--porcelain"),
  "Use the clean Release B worktree and Node 22.");
  for (const name of ["FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT",
    "FIREBASE_CONFIG", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FUNCTIONS_EMULATOR"]) {
    requireCondition(!process.env[name], "Use the authenticated Firebase CLI session without environment overrides.");
  }
  const directory = realpathSync(resolve(values.dir));
  requireCondition(insidePrivateDirectory(directory, root), "Use a sealed Release B directory under the ignored .tmp directory.");
  const requestBytes = readPrivatePilotRequest(values.request);
  const planBytes = readFileSync(join(directory, "release-plan-B.json"));
  const receipt = parseRecord(readFileSync(join(directory, "publish-receipt-B.json")));
  const result = await approveCleanerPushPilot({
    requestBytes, planBytes, receipt, sourceSha: git("rev-parse", "HEAD"), approval: values.approve,
    inspectRelease: () => readNotificationProduction("B"),
    ...firestoreAccess(),
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof PilotError ? error.message : "Pilot approval could not be verified. Inspect local inputs before retrying.");
    process.exitCode = 1;
  }
}

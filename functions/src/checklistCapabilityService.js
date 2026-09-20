import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { projectChecklistRunForCleaner } from "./checklistRunDefinition.js";

export const initialChecklistCapabilityId = "active";
export const checklistCapabilityLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1000;

export function validChecklistCleanerId(cleanerId) {
  return typeof cleanerId === "string"
    && cleanerId.length > 0
    && cleanerId.length <= 256
    && !cleanerId.includes("/");
}

function currentRevision(job) {
  return Number.isInteger(job?.checklistContextRevision) && job.checklistContextRevision >= 0
    ? job.checklistContextRevision
    : 0;
}

function assignedCleanerIds(job) {
  const ids = Array.isArray(job?.assignedCleanerIds)
    ? job.assignedCleanerIds
    : [job?.assignedCleanerId];
  return new Set(ids.filter(validChecklistCleanerId));
}

export function checklistCapabilityState(capability, job, run, now = new Date()) {
  if (!capability) return "NONE";
  if (capability.status === "REVOKED") return "REVOKED";
  if (capability.status !== "ACTIVE") return "UNAVAILABLE";
  if (!capability.expiresAt?.toMillis || capability.expiresAt.toMillis() <= now.getTime()) return "EXPIRED";
  if (!job || job.archivedAt || run?.status !== "DRAFT") return "STALE";
  if (capability.contextRevision !== currentRevision(job)) return "STALE";
  if (!assignedCleanerIds(job).has(capability.cleanerId)) return "STALE";
  if (!["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus)) return "STALE";
  return "ACTIVE";
}

function capabilityReference(database, organizationId, jobId, runId) {
  return database.doc(
    `organizations/${organizationId}/jobs/${jobId}/checklistRuns/${runId}/checklistCapabilities/${initialChecklistCapabilityId}`,
  );
}

function runReference(database, organizationId, jobId, runId) {
  return database.doc(`organizations/${organizationId}/jobs/${jobId}/checklistRuns/${runId}`);
}

function jobReference(database, organizationId, jobId) {
  return database.doc(`organizations/${organizationId}/jobs/${jobId}`);
}

/** Manager summaries intentionally never include the bearer token or its hash. */
export function projectChecklistCapabilityForManager(capability, job, run, now = new Date()) {
  if (!capability) return { state: "NONE" };
  return {
    state: checklistCapabilityState(capability, job, run, now),
    cleanerId: validChecklistCleanerId(capability.cleanerId) ? capability.cleanerId : null,
    expiresAt: capability.expiresAt?.toDate?.()?.toISOString() || null,
    issuedAt: capability.issuedAt?.toDate?.()?.toISOString() || null,
  };
}

function assertEligible(job, run, cleanerId) {
  if (!job) throw new HttpsError("not-found", "Job not found.");
  if (!run || run.status !== "DRAFT") {
    throw new HttpsError("failed-precondition", "A Draft Checklist Run is required.");
  }
  if (job.archivedAt || !["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus)) {
    throw new HttpsError("failed-precondition", "Job is not eligible for a cleaner checklist link.");
  }
  if (!assignedCleanerIds(job).has(cleanerId)) {
    throw new HttpsError("failed-precondition", "Cleaner is not assigned to this Job.");
  }
}

export async function issueChecklistCapabilityForManager(database, {
  organizationId,
  jobId,
  runId,
  cleanerId,
  actorUid,
  token,
  tokenHash,
  now = new Date(),
}) {
  if (!validChecklistCleanerId(cleanerId) || typeof tokenHash !== "string" || !tokenHash) {
    throw new HttpsError("invalid-argument", "Checklist capability request is invalid.");
  }
  const jobRef = jobReference(database, organizationId, jobId);
  const runRef = runReference(database, organizationId, jobId, runId);
  const capabilityRef = capabilityReference(database, organizationId, jobId, runId);
  const expiresAt = Timestamp.fromMillis(now.getTime() + checklistCapabilityLifetimeMilliseconds);

  await database.runTransaction(async (transaction) => {
    const [jobSnapshot, runSnapshot, capabilitySnapshot] = await Promise.all([
      transaction.get(jobRef), transaction.get(runRef), transaction.get(capabilityRef),
    ]);
    const job = jobSnapshot.exists ? jobSnapshot.data() : null;
    const run = runSnapshot.exists ? runSnapshot.data() : null;
    assertEligible(job, run, cleanerId);
    const previousRotation = Number.isInteger(capabilitySnapshot.data()?.rotation)
      ? capabilitySnapshot.data().rotation
      : 0;
    transaction.set(capabilityRef, {
      organizationId,
      jobId,
      runId,
      cleanerId,
      tokenHash,
      contextRevision: currentRevision(job),
      status: "ACTIVE",
      rotation: previousRotation + 1,
      issuedByUid: actorUid,
      issuedAt: FieldValue.serverTimestamp(),
      expiresAt,
    });
  });

  return { token, capability: await getChecklistCapabilityForManager(database, { organizationId, jobId, runId }) };
}

export async function getChecklistCapabilityForManager(database, { organizationId, jobId, runId }) {
  const [jobSnapshot, runSnapshot, capabilitySnapshot] = await Promise.all([
    jobReference(database, organizationId, jobId).get(),
    runReference(database, organizationId, jobId, runId).get(),
    capabilityReference(database, organizationId, jobId, runId).get(),
  ]);
  if (!jobSnapshot.exists) throw new HttpsError("not-found", "Job not found.");
  return projectChecklistCapabilityForManager(
    capabilitySnapshot.exists ? capabilitySnapshot.data() : null,
    jobSnapshot.data(),
    runSnapshot.exists ? runSnapshot.data() : null,
  );
}

export async function revokeChecklistCapabilityForManager(database, { organizationId, jobId, runId, actorUid }) {
  const capabilityRef = capabilityReference(database, organizationId, jobId, runId);
  await database.runTransaction(async (transaction) => {
    const capabilitySnapshot = await transaction.get(capabilityRef);
    if (!capabilitySnapshot.exists) return;
    transaction.update(capabilityRef, {
      status: "REVOKED",
      revokedAt: FieldValue.serverTimestamp(),
      revokedByUid: actorUid,
    });
  });
  return getChecklistCapabilityForManager(database, { organizationId, jobId, runId });
}

function capabilityDocumentFromPath(document, organizationId) {
  const path = document.path.split("/");
  if (
    path.length !== 8 || path[0] !== "organizations" || path[1] !== organizationId
    || path[2] !== "jobs" || path[4] !== "checklistRuns" || path[6] !== "checklistCapabilities"
    || path[7] !== initialChecklistCapabilityId
  ) return null;
  return { jobId: path[3], runId: path[5] };
}

export async function loadPublicChecklistCapability(database, { organizationId, tokenHash, now = new Date() }) {
  const matches = await database.collectionGroup("checklistCapabilities")
    .where("tokenHash", "==", tokenHash).limit(2).get();
  if (matches.size !== 1) return { state: "not-found" };
  const capabilityRef = matches.docs[0].ref;
  const location = capabilityDocumentFromPath(capabilityRef, organizationId);
  if (!location) return { state: "not-found" };

  return database.runTransaction(async (transaction) => {
    const [capabilitySnapshot, jobSnapshot, runSnapshot] = await Promise.all([
      transaction.get(capabilityRef),
      transaction.get(jobReference(database, organizationId, location.jobId)),
      transaction.get(runReference(database, organizationId, location.jobId, location.runId)),
    ]);
    if (!capabilitySnapshot.exists || !jobSnapshot.exists || !runSnapshot.exists) return { state: "not-found" };
    const capability = capabilitySnapshot.data();
    if (capability.tokenHash !== tokenHash) return { state: "not-found" };
    const state = checklistCapabilityState(capability, jobSnapshot.data(), runSnapshot.data(), now);
    if (state !== "ACTIVE") return { state: state.toLowerCase() };
    return {
      state: "active",
      checklist: projectChecklistRunForCleaner(runSnapshot.data()),
    };
  });
}

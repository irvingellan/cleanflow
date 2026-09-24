import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { projectChecklistRunForCleaner } from "./checklistRunDefinition.js";
import {
  applyChecklistDraftMutation,
  checklistDraftReviewRequirements,
  checklistDraftMutationHash,
  checklistReadyForReviewRequestHash,
  normalizeChecklistReadyForReviewRequest,
  normalizeChecklistDraftMutation,
  projectChecklistDraftForRead,
} from "./checklistDraftService.js";
import {
  isPilotChecklistPhotoRequirement,
  pilotChecklistPhotoRequirementId,
} from "./checklistEvidenceDefinition.js";

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
  // A valid capability remains read-only after handoff so a lost response can
  // be recovered by reopening the same link. Mutations still require DRAFT.
  if (!job || job.archivedAt || !["DRAFT", "READY_FOR_REVIEW"].includes(run?.status)) return "STALE";
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

function draftReference(database, organizationId, jobId, runId) {
  return runReference(database, organizationId, jobId, runId).collection("drafts").doc("current");
}

function mutationReference(database, organizationId, jobId, runId, mutationId) {
  return runReference(database, organizationId, jobId, runId).collection("draftMutations").doc(mutationId);
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
  const resolutionStartedAt = Date.now();
  const matches = await database.collectionGroup("checklistCapabilities")
    .where("tokenHash", "==", tokenHash).limit(2).get();
  if (matches.size !== 1) {
    return {
      state: "not-found",
      diagnostics: {
        capabilityResolutionMs: Date.now() - resolutionStartedAt,
        capabilityResult: "not-found",
        draftLoadMs: null,
        draftResult: "not-started",
      },
    };
  }
  const capabilityRef = matches.docs[0].ref;
  const location = capabilityDocumentFromPath(capabilityRef, organizationId);
  if (!location) {
    return {
      state: "not-found",
      diagnostics: {
        capabilityResolutionMs: Date.now() - resolutionStartedAt,
        capabilityResult: "not-found",
        draftLoadMs: null,
        draftResult: "not-started",
      },
    };
  }

  let draftLoadMs = null;
  const jobRef = jobReference(database, organizationId, location.jobId);
  const result = await database.runTransaction(async (transaction) => {
    const draftRef = draftReference(database, organizationId, location.jobId, location.runId);
    const draftStartedAt = Date.now();
    const draftPromise = transaction.get(draftRef).then((snapshot) => {
      draftLoadMs = Date.now() - draftStartedAt;
      return snapshot;
    });
    const [capabilitySnapshot, jobSnapshot, runSnapshot, draftSnapshot] = await Promise.all([
      transaction.get(capabilityRef),
      transaction.get(jobRef),
      transaction.get(runReference(database, organizationId, location.jobId, location.runId)),
      draftPromise,
    ]);
    if (!capabilitySnapshot.exists || !jobSnapshot.exists || !runSnapshot.exists) return { state: "not-found" };
    const capability = capabilitySnapshot.data();
    if (capability.tokenHash !== tokenHash) return { state: "not-found" };
    const job = jobSnapshot.data();
    const state = checklistCapabilityState(capability, job, runSnapshot.data(), now);
    if (state !== "ACTIVE") return { state: state.toLowerCase() };

    let assignedCleanerName = null;
    if (Array.isArray(job.assignedCleanerIds)) {
      const assignmentSnapshots = await transaction.get(
        jobRef.collection("assignments").where("cleanerId", "==", capability.cleanerId),
      );
      const assignment = assignmentSnapshots.docs.find((snapshot) => snapshot.data().isActive === true);
      const name = assignment?.data().cleanerNameSnapshot;
      assignedCleanerName = typeof name === "string" ? name.trim().slice(0, 120) || null : null;
    } else if (job.assignedCleanerId === capability.cleanerId) {
      const name = job.assignedCleanerName;
      assignedCleanerName = typeof name === "string" ? name.trim().slice(0, 120) || null : null;
    }
    return {
      state: "active",
      checklist: projectChecklistRunForCleaner(runSnapshot.data(), { assignedCleanerName }),
      draft: projectChecklistDraftForRead(
        runSnapshot.data(), draftSnapshot.exists ? draftSnapshot.data() : null,
      ),
    };
  });

  const capabilityResult = result.state === "active" ? "active" : result.state;
  return {
    ...result,
    diagnostics: {
      capabilityResolutionMs: Date.now() - resolutionStartedAt,
      capabilityResult,
      draftLoadMs,
      draftResult: result.state === "active" ? "loaded" : draftLoadMs === null ? "not-started" : "unknown",
    },
  };
}

/**
 * A receipt lives beside the mutable draft, never on the immutable Run. The
 * capability is validated before receipt lookup so revoked access cannot replay
 * an old success response.
 */
export async function savePublicChecklistDraft(database, {
  organizationId,
  tokenHash,
  request,
  now = new Date(),
}) {
  const matches = await database.collectionGroup("checklistCapabilities")
    .where("tokenHash", "==", tokenHash).limit(2).get();
  if (matches.size !== 1) throw new HttpsError("not-found", "Checklist capability not found.");
  const capabilityRef = matches.docs[0].ref;
  const location = capabilityDocumentFromPath(capabilityRef, organizationId);
  if (!location) throw new HttpsError("not-found", "Checklist capability not found.");
  const runRef = runReference(database, organizationId, location.jobId, location.runId);
  const jobRef = jobReference(database, organizationId, location.jobId);
  const draftRef = draftReference(database, organizationId, location.jobId, location.runId);

  return database.runTransaction(async (transaction) => {
    const [capabilitySnapshot, jobSnapshot, runSnapshot, draftSnapshot] = await Promise.all([
      transaction.get(capabilityRef), transaction.get(jobRef), transaction.get(runRef), transaction.get(draftRef),
    ]);
    if (!capabilitySnapshot.exists || !jobSnapshot.exists || !runSnapshot.exists) {
      throw new HttpsError("not-found", "Checklist capability not found.");
    }
    const capability = capabilitySnapshot.data();
    if (capability.tokenHash !== tokenHash || checklistCapabilityState(capability, jobSnapshot.data(), runSnapshot.data(), now) !== "ACTIVE") {
      throw new HttpsError("failed-precondition", "Checklist capability is no longer available.");
    }
    if (runSnapshot.data().status !== "DRAFT") {
      throw new HttpsError("failed-precondition", "Checklist Run is no longer editable.");
    }
    const mutation = normalizeChecklistDraftMutation(runSnapshot.data(), request);
    const mutationHash = checklistDraftMutationHash(mutation);
    const receiptRef = mutationReference(database, organizationId, location.jobId, location.runId, mutation.mutationId);
    const receiptSnapshot = await transaction.get(receiptRef);
    const resolvedIdentity = {
      cleanerId: capability.cleanerId,
      contextRevision: capability.contextRevision,
      capabilityRotation: capability.rotation || 0,
    };
    if (receiptSnapshot.exists) {
      const receipt = receiptSnapshot.data();
      if (receipt.mutationHash !== mutationHash
        || receipt.cleanerId !== resolvedIdentity.cleanerId
        || receipt.contextRevision !== resolvedIdentity.contextRevision
        || receipt.capabilityRotation !== resolvedIdentity.capabilityRotation) {
        throw new HttpsError("already-exists", "Draft mutation ID was used with a different request.");
      }
      return {
        duplicate: true,
        revision: receipt.revision,
        draft: projectChecklistDraftForRead(runSnapshot.data(), draftSnapshot.exists ? draftSnapshot.data() : null),
      };
    }
    const currentDraft = draftSnapshot.exists ? draftSnapshot.data() : null;
    const currentRevision = Number.isInteger(currentDraft?.revision) ? currentDraft.revision : 0;
    if (mutation.baseRevision !== currentRevision) {
      throw new HttpsError("aborted", "Checklist draft revision conflict.");
    }
    const draft = applyChecklistDraftMutation(runSnapshot.data(), currentDraft, mutation);
    transaction.set(draftRef, draft);
    transaction.create(receiptRef, {
      mutationHash,
      cleanerId: resolvedIdentity.cleanerId,
      contextRevision: resolvedIdentity.contextRevision,
      capabilityRotation: resolvedIdentity.capabilityRotation,
      revision: draft.revision,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { duplicate: false, revision: draft.revision, draft: projectChecklistDraftForRead(runSnapshot.data(), draft) };
  });
}

/**
 * The Run itself is the durable review receipt. It permits an exact retry after
 * a lost response while refusing a different handoff or any post-review edit.
 */
export async function readyPublicChecklistForReview(database, {
  organizationId,
  tokenHash,
  request,
  now = new Date(),
}) {
  const matches = await database.collectionGroup("checklistCapabilities")
    .where("tokenHash", "==", tokenHash).limit(2).get();
  if (matches.size !== 1) throw new HttpsError("not-found", "Checklist capability not found.");
  const capabilityRef = matches.docs[0].ref;
  const location = capabilityDocumentFromPath(capabilityRef, organizationId);
  if (!location) throw new HttpsError("not-found", "Checklist capability not found.");
  const runRef = runReference(database, organizationId, location.jobId, location.runId);
  const jobRef = jobReference(database, organizationId, location.jobId);
  const draftRef = draftReference(database, organizationId, location.jobId, location.runId);
  const evidenceRef = runRef.collection("evidence").doc(pilotChecklistPhotoRequirementId);
  const submission = normalizeChecklistReadyForReviewRequest(request);
  const requestHash = checklistReadyForReviewRequestHash(submission);

  return database.runTransaction(async (transaction) => {
    const [capabilitySnapshot, jobSnapshot, runSnapshot, draftSnapshot, evidenceSnapshot] = await Promise.all([
      transaction.get(capabilityRef), transaction.get(jobRef), transaction.get(runRef), transaction.get(draftRef), transaction.get(evidenceRef),
    ]);
    if (!capabilitySnapshot.exists || !jobSnapshot.exists || !runSnapshot.exists) {
      throw new HttpsError("not-found", "Checklist capability not found.");
    }
    const capability = capabilitySnapshot.data();
    const run = runSnapshot.data();
    if (capability.tokenHash !== tokenHash || checklistCapabilityState(capability, jobSnapshot.data(), run, now) !== "ACTIVE") {
      throw new HttpsError("failed-precondition", "Checklist capability is no longer available.");
    }
    const identity = {
      cleanerId: capability.cleanerId,
      contextRevision: capability.contextRevision,
      capabilityRotation: capability.rotation || 0,
    };
    if (run.status === "READY_FOR_REVIEW") {
      if (run.readyForReviewSubmissionId !== submission.submissionId
        || run.readyForReviewRequestHash !== requestHash
        || run.readyForReviewCleanerId !== identity.cleanerId
        || run.readyForReviewContextRevision !== identity.contextRevision
        || run.readyForReviewCapabilityRotation !== identity.capabilityRotation) {
        throw new HttpsError("already-exists", "Checklist Run was already sent for review.");
      }
      return {
        duplicate: true,
        checklist: projectChecklistRunForCleaner(run),
        draft: projectChecklistDraftForRead(run, draftSnapshot.exists ? draftSnapshot.data() : null),
      };
    }
    if (run.status !== "DRAFT") throw new HttpsError("failed-precondition", "Checklist Run is not editable.");
    const currentDraft = draftSnapshot.exists ? draftSnapshot.data() : null;
    const { draft: validatedDraft, missingChecklistCount, missingInventoryCount } =
      checklistDraftReviewRequirements(run, currentDraft);
    if (submission.baseRevision !== validatedDraft.revision) {
      throw new HttpsError("aborted", "Checklist draft revision conflict.");
    }
    const missingPhotoCount = isPilotChecklistPhotoRequirement(run, pilotChecklistPhotoRequirementId)
      && evidenceSnapshot.data()?.status !== "SAVED" ? 1 : 0;
    if (missingChecklistCount || missingInventoryCount || missingPhotoCount) {
      throw new HttpsError("failed-precondition", "Checklist requirements are incomplete.", {
        reason: "checklist-requirements-missing",
        missingChecklistCount,
        missingInventoryCount,
        missingPhotoCount,
      });
    }
    transaction.update(runRef, {
      status: "READY_FOR_REVIEW",
      readyForReviewAt: FieldValue.serverTimestamp(),
      readyForReviewCleanerId: identity.cleanerId,
      readyForReviewContextRevision: identity.contextRevision,
      readyForReviewCapabilityRotation: identity.capabilityRotation,
      readyForReviewDraftRevision: validatedDraft.revision,
      readyForReviewSubmissionId: submission.submissionId,
      readyForReviewRequestHash: requestHash,
    });
    return {
      duplicate: false,
      checklist: projectChecklistRunForCleaner({ ...run, status: "READY_FOR_REVIEW" }),
      draft: projectChecklistDraftForRead(run, currentDraft),
    };
  });
}

import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { initialChecklistRunId, validChecklistRunJobId } from "./checklistRunService.js";

const completableStatuses = new Set(["ASSIGNED", "IN_PROGRESS"]);
const checklistRunAbandonReason = "MANAGER_COMPLETED_WITHOUT_CHECKLIST";

/**
 * Closes a manager-reviewed service only when no checklist Run exists.
 * Reading the Job and initial Run in one transaction prevents a concurrently
 * created Run from being bypassed by this completion path.
 */
export async function completeJobWithoutChecklistForManager(database, { organizationId, jobId }) {
  if (!validChecklistRunJobId(organizationId) || !validChecklistRunJobId(jobId)) {
    throw new HttpsError("invalid-argument", "Job is invalid.");
  }

  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const runReference = jobReference.collection("checklistRuns").doc(initialChecklistRunId);

  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, runSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(runReference),
    ]);

    if (!jobSnapshot.exists) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const job = jobSnapshot.data();
    if (job.archivedAt) {
      throw new HttpsError("failed-precondition", "Archived Job cannot be completed.", { reason: "archived" });
    }
    if (runSnapshot.exists) {
      throw new HttpsError(
        "failed-precondition",
        "This Job has a Checklist Run and must follow checklist review.",
        { reason: "checklist-run-exists" },
      );
    }

    if (job.operationalStatus === "COMPLETED") {
      return { completed: false, operationalStatus: "COMPLETED" };
    }
    if (!completableStatuses.has(job.operationalStatus)) {
      throw new HttpsError("failed-precondition", "Job is not eligible for completion.", { reason: "status" });
    }

    const revision = Object.prototype.hasOwnProperty.call(job, "checklistContextRevision")
      ? job.checklistContextRevision
      : 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) {
      throw new HttpsError("failed-precondition", "Job checklist context revision is invalid.", { reason: "revision" });
    }
    transaction.update(jobReference, {
      operationalStatus: "COMPLETED",
      completedAt: FieldValue.serverTimestamp(),
      checklistContextRevision: revision + 1,
    });

    return { completed: true, operationalStatus: "COMPLETED" };
  });
}

/**
 * Explicitly closes a Job whose initial checklist was started but never handed
 * off for review. The Run and its saved draft/evidence remain available to the
 * manager; only the active cleaner link is revoked. This is deliberately
 * separate from the no-Run completion path above.
 */
export async function abandonChecklistRunAndCompleteJobForManager(database, {
  organizationId, jobId, actorUid,
}) {
  if (!validChecklistRunJobId(organizationId) || !validChecklistRunJobId(jobId)
    || !validChecklistRunJobId(actorUid)) {
    throw new HttpsError("invalid-argument", "Job completion request is invalid.");
  }

  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const runReference = jobReference.collection("checklistRuns").doc(initialChecklistRunId);
  const capabilityReference = runReference.collection("checklistCapabilities").doc("active");

  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, runSnapshot, capabilitySnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(runReference),
      transaction.get(capabilityReference),
    ]);

    if (!jobSnapshot.exists) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const job = jobSnapshot.data();
    if (job.archivedAt) {
      throw new HttpsError("failed-precondition", "Archived Job cannot be completed.", { reason: "archived" });
    }
    if (!runSnapshot.exists) {
      throw new HttpsError("failed-precondition", "A Draft Checklist Run is required.", { reason: "checklist-run-missing" });
    }

    const run = runSnapshot.data();
    if (job.operationalStatus === "COMPLETED") {
      if (run.status === "ABANDONED"
        && run.abandonReason === checklistRunAbandonReason
        && run.abandonedByUid === actorUid
        && run.abandonedAt
        && job.completedAt
        && (!capabilitySnapshot.exists || capabilitySnapshot.data().status !== "ACTIVE")) {
        return { completed: false, operationalStatus: "COMPLETED" };
      }
      throw new HttpsError("failed-precondition", "Job was completed through another path.", { reason: "already-completed" });
    }
    if (!completableStatuses.has(job.operationalStatus)) {
      throw new HttpsError("failed-precondition", "Job is not eligible for completion.", { reason: "status" });
    }
    if (run.status !== "DRAFT") {
      throw new HttpsError("failed-precondition", "Only a Draft Checklist Run can be abandoned.", { reason: "checklist-run-status" });
    }

    const revision = Object.prototype.hasOwnProperty.call(job, "checklistContextRevision")
      ? job.checklistContextRevision
      : 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) {
      throw new HttpsError("failed-precondition", "Job checklist context revision is invalid.", { reason: "revision" });
    }

    transaction.update(runReference, {
      status: "ABANDONED",
      abandonedAt: FieldValue.serverTimestamp(),
      abandonedByUid: actorUid,
      abandonReason: checklistRunAbandonReason,
    });
    if (capabilitySnapshot.exists && capabilitySnapshot.data().status === "ACTIVE") {
      transaction.update(capabilityReference, {
        status: "REVOKED",
        revokedAt: FieldValue.serverTimestamp(),
        revokedByUid: actorUid,
      });
    }
    transaction.update(jobReference, {
      operationalStatus: "COMPLETED",
      completedAt: FieldValue.serverTimestamp(),
      checklistContextRevision: revision + 1,
    });

    return { completed: true, operationalStatus: "COMPLETED" };
  });
}

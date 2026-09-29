import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { initialChecklistRunId, validChecklistRunJobId } from "./checklistRunService.js";

const completableStatuses = new Set(["ASSIGNED", "IN_PROGRESS"]);

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

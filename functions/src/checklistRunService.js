import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { buildChecklistRunSnapshot } from "./checklistRunDefinition.js";

export const initialChecklistRunId = "initial";

export function validChecklistRunJobId(jobId) {
  return typeof jobId === "string"
    && jobId.length > 0
    && jobId.length <= 256
    && !jobId.includes("/");
}

export async function createChecklistRunForManager(database, { organizationId, jobId, actorUid }) {
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

    if (runSnapshot.exists) {
      return { runId: runSnapshot.id, created: false, status: runSnapshot.data().status || "DRAFT" };
    }

    const job = { id: jobSnapshot.id, ...jobSnapshot.data() };
    if (!validChecklistRunJobId(job.propertyId)) {
      throw new HttpsError("failed-precondition", "Job needs a canonical Property before creating a checklist.");
    }

    const propertyReference = database.doc(`organizations/${organizationId}/properties/${job.propertyId}`);
    const propertySnapshot = await transaction.get(propertyReference);
    if (!propertySnapshot.exists) {
      throw new HttpsError("failed-precondition", "Job Property was not found.");
    }

    const property = { id: propertySnapshot.id, ...propertySnapshot.data() };
    transaction.create(runReference, {
      organizationId,
      jobId,
      status: "DRAFT",
      createdByUid: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      ...buildChecklistRunSnapshot({ job, property }),
    });

    return { runId: runReference.id, created: true, status: "DRAFT" };
  });
}

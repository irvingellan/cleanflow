import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { buildChecklistRunSnapshot } from "./checklistRunDefinition.js";
import { projectChecklistDraftForRead } from "./checklistDraftService.js";

export const initialChecklistRunId = "initial";

export function validChecklistRunJobId(jobId) {
  return typeof jobId === "string"
    && jobId.length > 0
    && jobId.length <= 256
    && !jobId.includes("/");
}

function toIsoTimestamp(value) {
  const date = value?.toDate?.();
  return date ? date.toISOString() : null;
}

/**
 * The browser gets this manager summary through a callable rather than direct
 * Firestore access. Keep the Property configuration snapshot server-owned so
 * access details or future manager-only fields cannot leak by accident.
 */
export function projectChecklistRunForManager(run, runId = initialChecklistRunId, draft = null) {
  const definition = run?.resolvedDefinition || {};
  const sections = Array.isArray(definition.sections) ? definition.sections : [];
  const requiredPhotoTypes = Array.isArray(definition.requiredPhotoTypes)
    ? definition.requiredPhotoTypes
      .filter((photoType) => typeof photoType?.id === "string" && typeof photoType?.label === "string")
      .map(({ id, label, maximum }) => ({
        id,
        label,
        ...(Number.isInteger(maximum) && maximum > 0 ? { maximum } : {}),
      }))
    : [];

  return {
    id: runId,
    status: run?.status || "DRAFT",
    jobId: typeof run?.jobId === "string" ? run.jobId : null,
    definitionVersion: Number.isInteger(run?.definitionVersion) ? run.definitionVersion : null,
    property: {
      id: typeof run?.propertySnapshot?.propertyId === "string"
        ? run.propertySnapshot.propertyId
        : null,
      name: typeof run?.propertySnapshot?.propertyName === "string"
        ? run.propertySnapshot.propertyName
        : null,
    },
    checklistItemCount: sections.reduce(
      (count, section) => count + (Array.isArray(section?.items) ? section.items.length : 0),
      0,
    ),
    inventoryItemCount: Array.isArray(definition.inventoryItems) ? definition.inventoryItems.length : 0,
    requiredPhotoTypes,
    cleanerInstructions: typeof definition.cleanerInstructions === "string"
      ? definition.cleanerInstructions
      : "",
    createdAt: toIsoTimestamp(run?.createdAt),
    readyForReviewAt: toIsoTimestamp(run?.readyForReviewAt),
    draft: projectChecklistDraftForRead(run, draft),
  };
}

export async function getChecklistRunForManager(database, { organizationId, jobId }) {
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const runReference = jobReference.collection("checklistRuns").doc(initialChecklistRunId);
  const [jobSnapshot, runSnapshot, draftSnapshot] = await Promise.all([
    jobReference.get(),
    runReference.get(),
    runReference.collection("drafts").doc("current").get(),
  ]);

  if (!jobSnapshot.exists) {
    throw new HttpsError("not-found", "Job not found.");
  }

  return runSnapshot.exists
    ? projectChecklistRunForManager(
      runSnapshot.data(), runSnapshot.id, draftSnapshot.exists ? draftSnapshot.data() : null,
    )
    : null;
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
      const run = projectChecklistRunForManager(runSnapshot.data(), runSnapshot.id);
      return { runId: run.id, created: false, status: run.status, run };
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
    const runData = {
      organizationId,
      jobId,
      status: "DRAFT",
      createdByUid: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      ...buildChecklistRunSnapshot({ job, property }),
    };
    transaction.create(runReference, runData);

    const run = projectChecklistRunForManager(runData, runReference.id);
    return { runId: run.id, created: true, status: run.status, run };
  });
}

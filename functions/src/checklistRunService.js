import { FieldValue } from "firebase-admin/firestore";
import { applyManagerCorrections, managerCorrection } from "./checklistManagerCorrection.js";
import { HttpsError } from "firebase-functions/v2/https";
import { buildChecklistRunSnapshot } from "./checklistRunDefinition.js";
import { checklistDraftReviewRequirements, projectChecklistDraftForRead } from "./checklistDraftService.js";
import { createChecklistEvidencePolicy, isPilotChecklistPhotoRequirement, pilotChecklistPhotoRequirementId, projectChecklistEvidence, projectChecklistEvidenceGallery } from "./checklistEvidenceDefinition.js";

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
export function projectChecklistRunForManager(run, runId = initialChecklistRunId, draft = null, evidence = null) {
  const definition = run?.resolvedDefinition || {};
  const sections = Array.isArray(definition.sections) ? definition.sections : [];
  const draftProjection = projectChecklistDraftForRead(run, draft);
  const corrected = applyManagerCorrections(run, draftProjection);
  // The cleaner's own answer stays visible next to a manager correction.
  const withCorrection = (kind, itemId, saved) => (managerCorrection(run, kind, itemId)
    ? { correctedByManager: true, cleanerAnswer: saved || "UNANSWERED" } : {});
  const requiredPhotoTypes = Array.isArray(definition.requiredPhotoTypes)
    ? definition.requiredPhotoTypes
      .filter((photoType) => typeof photoType?.id === "string" && typeof photoType?.label === "string")
      .map(({ id, label, maximum }) => ({
        id,
        label,
        ...(Number.isInteger(maximum) && maximum > 0 ? { maximum } : {}),
      }))
    : [];
  const requiredChecklistPhotoCount = sections.reduce(
    (count, section) => count + (Array.isArray(section?.items)
      ? section.items.filter((item) => item?.requiresPhoto === true).length
      : 0),
    0,
  );

  return {
    id: runId,
    status: run?.status || "DRAFT",
    jobId: typeof run?.jobId === "string" ? run.jobId : null,
    definitionVersion: Number.isInteger(run?.definitionVersion) ? run.definitionVersion : null,
    ...(run?.evidencePolicy?.version === 2 ? { evidencePolicy: createChecklistEvidencePolicy(run.evidencePolicy) } : {}),
    property: {
      id: typeof run?.propertySnapshot?.propertyId === "string"
        ? run.propertySnapshot.propertyId
        : null,
      name: typeof run?.propertySnapshot?.propertyName === "string"
        ? run.propertySnapshot.propertyName
        : null,
    },
    serviceDate: typeof run?.jobSnapshot?.scheduledDate === "string" ? run.jobSnapshot.scheduledDate : null,
    sections: sections.map((section) => ({
      id: typeof section?.id === "string" ? section.id : "",
      titleKey: typeof section?.titleKey === "string" ? section.titleKey : null,
      title: typeof section?.title === "string" ? section.title : null,
      items: (Array.isArray(section?.items) ? section.items : []).map((item) => ({
        id: typeof item?.id === "string" ? item.id : "",
        labelKey: typeof item?.labelKey === "string" ? item.labelKey : null,
        label: typeof item?.label === "string" ? item.label : null,
        ...(item?.canBeNotApplicable === true ? { canBeNotApplicable: true } : {}),
        answer: corrected.checklistAnswers?.[item?.id] || "UNANSWERED",
        ...withCorrection("checklist", item?.id, draftProjection.checklistAnswers?.[item?.id]),
      })),
    })),
    inventoryItems: (Array.isArray(definition.inventoryItems) ? definition.inventoryItems : []).map((item) => ({
      id: typeof item?.id === "string" ? item.id : "",
      labelKey: typeof item?.labelKey === "string" ? item.labelKey : null,
      label: typeof item?.label === "string" ? item.label : null,
      answer: corrected.inventoryAnswers?.[item?.id] || "UNANSWERED",
      ...withCorrection("inventory", item?.id, draftProjection.inventoryAnswers?.[item?.id]),
    })),
    checklistItemCount: sections.reduce(
      (count, section) => count + (Array.isArray(section?.items) ? section.items.length : 0),
      0,
    ),
    inventoryItemCount: Array.isArray(definition.inventoryItems) ? definition.inventoryItems.length : 0,
    requiredPhotoTypes,
    requiredPhotoCount: requiredChecklistPhotoCount + requiredPhotoTypes.length,
    cleanerInstructions: typeof definition.cleanerInstructions === "string"
      ? definition.cleanerInstructions
      : "",
    createdAt: toIsoTimestamp(run?.createdAt),
    readyForReviewAt: toIsoTimestamp(run?.readyForReviewAt),
    abandonedAt: toIsoTimestamp(run?.abandonedAt),
    draft: draftProjection,
    evidence: run?.evidencePolicy?.version === 2
      ? projectChecklistEvidenceGallery(evidence?.photos).map((photo) => {
        const hidden = run?.reportHiddenEvidence?.[photo.evidenceId];
        return hidden?.hidden === true
          ? { ...photo, hiddenFromReport: true, hiddenFromReportReason: typeof hidden.reason === "string" ? hidden.reason : "" }
          : photo;
      })
      : projectChecklistEvidence(evidence),
  };
}

export async function getChecklistRunForManager(database, { organizationId, jobId }) {
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const runReference = jobReference.collection("checklistRuns").doc(initialChecklistRunId);
  const [jobSnapshot, runSnapshot, draftSnapshot, evidenceSnapshot] = await Promise.all([
    jobReference.get(),
    runReference.get(),
    runReference.collection("drafts").doc("current").get(),
    runReference.collection("evidence").doc(pilotChecklistPhotoRequirementId).get(),
  ]);

  if (!jobSnapshot.exists) {
    throw new HttpsError("not-found", "Job not found.");
  }

  const projectedEvidence = runSnapshot.data()?.evidencePolicy?.version === 2
    ? (await runReference.collection("evidenceState").doc("current").get()).data()
    : evidenceSnapshot.exists ? evidenceSnapshot.data() : null;
  return runSnapshot.exists
    ? projectChecklistRunForManager(
      runSnapshot.data(), runSnapshot.id, draftSnapshot.exists ? draftSnapshot.data() : null,
      projectedEvidence,
    )
    : null;
}

export async function createChecklistRunForManager(database, { organizationId, jobId, actorUid, evidencePolicy }) {
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
    if (job.archivedAt || job.operationalStatus === "COMPLETED") {
      throw new HttpsError("failed-precondition", "Checklist cannot be started on an archived or completed Job.");
    }
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
      evidencePolicy: createChecklistEvidencePolicy(evidencePolicy),
      createdByUid: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      ...buildChecklistRunSnapshot({ job, property }),
    };
    transaction.create(runReference, runData);

    const run = projectChecklistRunForManager(runData, runReference.id);
    return { runId: run.id, created: true, status: run.status, run };
  });
}

/**
 * A manager may close the operational Job only after the cleaner has locked
 * the frozen Run for review. This is intentionally a Job transition, not a
 * payout or Assignment transition.
 */
export async function approveChecklistRunForManager(database, { organizationId, jobId }) {
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

    if (!runSnapshot.exists || runSnapshot.data().status !== "READY_FOR_REVIEW") {
      throw new HttpsError("failed-precondition", "Checklist Run is not ready for manager review.");
    }

    const job = jobSnapshot.data();
    if (job.archivedAt) {
      throw new HttpsError("failed-precondition", "Archived Job cannot be completed.");
    }

    if (job.operationalStatus === "COMPLETED") {
      return { completed: false, operationalStatus: "COMPLETED" };
    }

    if (!["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus)) {
      throw new HttpsError("failed-precondition", "Job is not eligible for checklist approval.");
    }

    const revision = Number.isInteger(job.checklistContextRevision) && job.checklistContextRevision >= 0
      ? job.checklistContextRevision
      : 0;
    transaction.update(jobReference, {
      operationalStatus: "COMPLETED",
      completedAt: FieldValue.serverTimestamp(),
      checklistContextRevision: revision + 1,
    });

    return { completed: true, operationalStatus: "COMPLETED" };
  });
}

/**
 * Section 8: the cleaner filled everything but never tapped "Send for review".
 * The manager may send it on her behalf with exactly the cleaner's rules
 * (every required item answered, the required photo saved, no photo still
 * uploading) and the revision she is looking at. The transition is recorded
 * as the manager's; it does not approve the Run or complete the Job.
 */
export async function submitChecklistRunForManager(database, { organizationId, jobId, actorUid, baseRevision, now = () => Date.now() }) {
  if (typeof actorUid !== "string" || !actorUid || !Number.isInteger(baseRevision) || baseRevision < 0) {
    throw new HttpsError("invalid-argument", "Checklist review request is invalid.");
  }
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const runReference = jobReference.collection("checklistRuns").doc(initialChecklistRunId);
  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, runSnapshot, draftSnapshot, aliasSnapshot, stateSnapshot] = await Promise.all([
      transaction.get(jobReference), transaction.get(runReference),
      transaction.get(runReference.collection("drafts").doc("current")),
      transaction.get(runReference.collection("evidence").doc(pilotChecklistPhotoRequirementId)),
      transaction.get(runReference.collection("evidenceState").doc("current")),
    ]);
    if (!jobSnapshot.exists || !runSnapshot.exists) throw new HttpsError("not-found", "Checklist Run not found.");
    const job = jobSnapshot.data();
    const run = runSnapshot.data();
    if (run.status === "READY_FOR_REVIEW") return { submitted: false, status: "READY_FOR_REVIEW" };
    if (run.status !== "DRAFT" || job.archivedAt || !["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus)) {
      throw new HttpsError("failed-precondition", "Checklist Run cannot be sent for review.");
    }
    const { draft, missingChecklistCount, missingInventoryCount } =
      checklistDraftReviewRequirements(run, draftSnapshot.exists ? draftSnapshot.data() : null);
    if (draft.revision !== baseRevision) throw new HttpsError("aborted", "Checklist draft changed. Refresh and review again.");
    const photoSaved = run.evidencePolicy?.version === 2
      ? (stateSnapshot.data()?.photos || []).some((photo) => photo.requirementId === pilotChecklistPhotoRequirementId)
      : aliasSnapshot.data()?.status === "SAVED";
    const missingPhotoCount = isPilotChecklistPhotoRequirement(run, pilotChecklistPhotoRequirementId) && !photoSaved ? 1 : 0;
    const pendingPhotoCount = (stateSnapshot.data()?.pending || [])
      .filter((photo) => photo.status === "RESERVED" && photo.leaseExpiresAt > now()).length;
    if (missingChecklistCount || missingInventoryCount || missingPhotoCount || pendingPhotoCount) {
      throw new HttpsError("failed-precondition", "Checklist requirements are incomplete.", {
        reason: "checklist-requirements-missing", missingChecklistCount, missingInventoryCount, missingPhotoCount,
        ...(pendingPhotoCount ? { pendingPhotoCount } : {}),
      });
    }
    transaction.update(runReference, {
      status: "READY_FOR_REVIEW",
      readyForReviewAt: FieldValue.serverTimestamp(),
      readyForReviewDraftRevision: draft.revision,
      readyForReviewByRole: "MANAGER",
      readyForReviewByUid: actorUid,
    });
    return { submitted: true, status: "READY_FOR_REVIEW" };
  });
}

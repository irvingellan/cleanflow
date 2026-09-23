import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { assertChecklistDraftReadyForReview } from "./checklistDraftService.js";
import { downloadSavedChecklistEvidence } from "./checklistEvidenceService.js";
import { pilotChecklistPhotoRequirementId } from "./checklistEvidenceDefinition.js";

export const clientReportCapabilityId = "active";
export const clientReportLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1000;
const initialRunId = "initial";
const tokenHashPattern = /^[a-f0-9]{64}$/;
const checklistAnswers = new Set(["UNANSWERED", "DONE", "NOT_APPLICABLE"]);
const inventoryAnswers = new Set(["UNANSWERED", "LOW", "MEDIUM", "HIGH", "NEEDS_RESTOCK"]);

function runReference(database, organizationId, jobId, runId) {
  return database.doc(`organizations/${organizationId}/jobs/${jobId}/checklistRuns/${runId}`);
}

function jobReference(database, organizationId, jobId) {
  return database.doc(`organizations/${organizationId}/jobs/${jobId}`);
}

function capabilityReference(database, organizationId, jobId, runId) {
  return runReference(database, organizationId, jobId, runId)
    .collection("clientReportCapabilities").doc(clientReportCapabilityId);
}

function lookupReference(database, tokenHash) {
  return database.collection("clientReportTokenLookups").doc(tokenHash);
}

function validPathId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !value.includes("/");
}

function toIso(value) {
  return value?.toDate?.()?.toISOString?.() || null;
}

function validAnswer(value, allowed) {
  return allowed.has(value) ? value : "UNANSWERED";
}

function visibleLabel(item) {
  return {
    ...(typeof item?.label === "string" && item.label.trim() ? { label: item.label.trim() } : {}),
    ...(typeof item?.labelKey === "string" && item.labelKey.trim() ? { labelKey: item.labelKey.trim() } : {}),
  };
}

/** Strict client-facing projection from the frozen Run and locked saved draft only. */
export function projectClientReport(run, draft, evidence) {
  if (run?.status !== "READY_FOR_REVIEW") {
    throw new HttpsError("failed-precondition", "A checklist ready for review is required.");
  }
  const normalizedDraft = assertChecklistDraftReadyForReview(run, draft);
  if (run.readyForReviewDraftRevision !== normalizedDraft.revision) {
    throw new HttpsError("failed-precondition", "The saved checklist revision is unavailable.");
  }
  const definition = run.resolvedDefinition || {};
  return {
    titleKey: "clientReport.title",
    propertyName: typeof run.propertySnapshot?.propertyName === "string"
      ? run.propertySnapshot.propertyName
      : "",
    serviceDate: /^\d{4}-\d{2}-\d{2}$/.test(run.jobSnapshot?.scheduledDate || "")
      ? run.jobSnapshot.scheduledDate
      : null,
    sections: (Array.isArray(definition.sections) ? definition.sections : []).map((section) => ({
      ...(typeof section?.title === "string" && section.title.trim() ? { title: section.title.trim() } : {}),
      ...(typeof section?.titleKey === "string" && section.titleKey.trim() ? { titleKey: section.titleKey.trim() } : {}),
      items: (Array.isArray(section?.items) ? section.items : []).map((item) => ({
        ...visibleLabel(item),
        answer: validAnswer(normalizedDraft.checklistAnswers?.[item.id], checklistAnswers),
      })),
    })),
    inventoryItems: (Array.isArray(definition.inventoryItems) ? definition.inventoryItems : []).map((item) => ({
      ...visibleLabel(item),
      answer: validAnswer(normalizedDraft.inventoryAnswers?.[item.id], inventoryAnswers),
    })),
    issueNotes: normalizedDraft.issueNotes || "",
    generalNotes: normalizedDraft.generalNotes || "",
    hasPhoto: evidence?.status === "SAVED"
      && evidence.requirementId === pilotChecklistPhotoRequirementId,
  };
}

export function clientReportCapabilityState(capability, now = new Date()) {
  if (!capability) return "NONE";
  if (capability.status === "REVOKED") return "REVOKED";
  if (capability.status === "REPLACED") return "REPLACED";
  if (capability.status !== "ACTIVE" || !capability.expiresAt?.toMillis) return "UNAVAILABLE";
  return capability.expiresAt.toMillis() <= now.getTime() ? "EXPIRED" : "ACTIVE";
}

function projectCapability(capability, now) {
  if (!capability) return { state: "NONE" };
  return {
    state: clientReportCapabilityState(capability, now),
    expiresAt: toIso(capability.expiresAt),
    issuedAt: toIso(capability.createdAt),
  };
}

function validateReportableRun(run, draft) {
  if (!run || run.status !== "READY_FOR_REVIEW") {
    throw new HttpsError("failed-precondition", "The checklist must be ready for manager review.");
  }
  projectClientReport(run, draft, null);
}

export async function getClientReportCapabilityForManager(database, {
  organizationId, jobId, runId = initialRunId, now = new Date(),
}) {
  if (!validPathId(jobId) || !validPathId(runId)) throw new HttpsError("invalid-argument", "Report request is invalid.");
  const [job, run, capability] = await Promise.all([
    jobReference(database, organizationId, jobId).get(),
    runReference(database, organizationId, jobId, runId).get(),
    capabilityReference(database, organizationId, jobId, runId).get(),
  ]);
  if (!job.exists || !run.exists) throw new HttpsError("not-found", "Checklist Run not found.");
  return projectCapability(capability.exists ? capability.data() : null, now);
}

export async function issueClientReportForManager(database, {
  organizationId, jobId, runId = initialRunId, actorUid, token, tokenHash,
  replaceExisting = false, now = new Date(),
}) {
  if (!validPathId(jobId) || !validPathId(runId) || typeof actorUid !== "string"
    || typeof token !== "string" || !tokenHashPattern.test(tokenHash || "")
    || createHash("sha256").update(token).digest("hex") !== tokenHash) {
    throw new HttpsError("invalid-argument", "Report request is invalid.");
  }
  const jobRef = jobReference(database, organizationId, jobId);
  const runRef = runReference(database, organizationId, jobId, runId);
  const draftRef = runRef.collection("drafts").doc("current");
  const evidenceRef = runRef.collection("evidence").doc(pilotChecklistPhotoRequirementId);
  const capabilityRef = capabilityReference(database, organizationId, jobId, runId);
  const newLookupRef = lookupReference(database, tokenHash);
  const expiresAt = Timestamp.fromMillis(now.getTime() + clientReportLifetimeMilliseconds);

  return database.runTransaction(async (transaction) => {
    const [job, run, draft, evidence, current, newLookup] = await Promise.all([
      transaction.get(jobRef), transaction.get(runRef), transaction.get(draftRef),
      transaction.get(evidenceRef), transaction.get(capabilityRef), transaction.get(newLookupRef),
    ]);
    if (!job.exists || !run.exists) throw new HttpsError("not-found", "Checklist Run not found.");
    const currentCapability = current.exists ? current.data() : null;
    const activeState = clientReportCapabilityState(currentCapability, now);
    if (newLookup.exists) throw new HttpsError("already-exists", "Report link could not be issued.");
    const runData = run.data();
    const draftData = draft.exists ? draft.data() : null;
    validateReportableRun(runData, draftData);
    if (!evidence.exists || evidence.data().status !== "SAVED"
      || evidence.data().requirementId !== pilotChecklistPhotoRequirementId) {
      throw new HttpsError("failed-precondition", "Saved checklist evidence is unavailable.");
    }
    if (activeState === "ACTIVE" && !replaceExisting) {
      return { created: false, capability: projectCapability(currentCapability, now) };
    }

    if (current.exists && tokenHashPattern.test(currentCapability?.tokenHash || "")) {
      const oldLookupRef = lookupReference(database, currentCapability.tokenHash);
      const oldLookup = await transaction.get(oldLookupRef);
      transaction.set(capabilityRef, {
        ...currentCapability,
        status: "REPLACED",
        replacedAt: FieldValue.serverTimestamp(),
      });
      if (oldLookup.exists) transaction.update(oldLookupRef, {
        status: "REPLACED",
        replacedAt: FieldValue.serverTimestamp(),
      });
    }

    const capability = {
      status: "ACTIVE",
      tokenHash,
      createdByUid: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    };
    transaction.set(capabilityRef, capability);
    transaction.create(newLookupRef, { organizationId, jobId, runId, status: "ACTIVE", expiresAt });
    return { created: true, token, capability: projectCapability({ ...capability, createdAt: Timestamp.fromDate(now) }, now) };
  });
}

export async function revokeClientReportForManager(database, {
  organizationId, jobId, runId = initialRunId,
}) {
  if (!validPathId(jobId) || !validPathId(runId)) throw new HttpsError("invalid-argument", "Report request is invalid.");
  const capabilityRef = capabilityReference(database, organizationId, jobId, runId);
  return database.runTransaction(async (transaction) => {
    const capabilitySnapshot = await transaction.get(capabilityRef);
    if (!capabilitySnapshot.exists) return { state: "NONE" };
    const capability = capabilitySnapshot.data();
    const hash = capability.tokenHash;
    const oldLookupRef = tokenHashPattern.test(hash || "") ? lookupReference(database, hash) : null;
    const lookupSnapshot = oldLookupRef ? await transaction.get(oldLookupRef) : null;
    transaction.update(capabilityRef, { status: "REVOKED", revokedAt: FieldValue.serverTimestamp() });
    if (lookupSnapshot?.exists) transaction.update(oldLookupRef, { status: "REVOKED", revokedAt: FieldValue.serverTimestamp() });
    return { state: "REVOKED" };
  });
}

async function resolvePublicClientReport(database, { organizationId, tokenHash, now = new Date() }) {
  if (!tokenHashPattern.test(tokenHash || "")) throw new HttpsError("not-found", "Report not found.");
  const lookupSnapshot = await lookupReference(database, tokenHash).get();
  if (!lookupSnapshot.exists) throw new HttpsError("not-found", "Report not found.");
  const lookup = lookupSnapshot.data();
  if (lookup.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Report is unavailable.");
  if (lookup.organizationId !== organizationId || !validPathId(lookup.jobId) || !validPathId(lookup.runId)) {
    throw new HttpsError("not-found", "Report not found.");
  }
  const jobRef = jobReference(database, organizationId, lookup.jobId);
  const runRef = runReference(database, organizationId, lookup.jobId, lookup.runId);
  const draftRef = runRef.collection("drafts").doc("current");
  const evidenceRef = runRef.collection("evidence").doc(pilotChecklistPhotoRequirementId);
  const capabilityRef = capabilityReference(database, organizationId, lookup.jobId, lookup.runId);
  const [job, run, draft, evidence, capability] = await Promise.all([
    jobRef.get(), runRef.get(), draftRef.get(), evidenceRef.get(), capabilityRef.get(),
  ]);
  if (!job.exists || !run.exists || !capability.exists) throw new HttpsError("not-found", "Report not found.");
  const capabilityData = capability.data();
  const lookupExpiry = lookup.expiresAt?.toMillis?.();
  if (capabilityData.tokenHash !== tokenHash || clientReportCapabilityState(capabilityData, now) !== "ACTIVE"
    || !lookupExpiry || lookupExpiry <= now.getTime() || run.data().status !== "READY_FOR_REVIEW") {
    throw new HttpsError("failed-precondition", "Report is unavailable.");
  }
  const draftData = draft.exists ? draft.data() : null;
  if (!evidence.exists || evidence.data().status !== "SAVED"
    || evidence.data().requirementId !== pilotChecklistPhotoRequirementId) {
    throw new HttpsError("failed-precondition", "Saved checklist evidence is unavailable.");
  }
  const report = projectClientReport(run.data(), draftData, evidence.exists ? evidence.data() : null);
  return { report, run: run.data(), evidence: evidence.exists ? evidence.data() : null, location: lookup };
}

export async function loadPublicClientReport(database, options) {
  const result = await resolvePublicClientReport(database, options);
  return result.report;
}

export async function downloadPublicClientReportPhoto(database, {
  organizationId, tokenHash, now = new Date(), storage,
}) {
  const result = await resolvePublicClientReport(database, { organizationId, tokenHash, now });
  if (!result.report.hasPhoto || !result.evidence) throw new HttpsError("not-found", "Report photo not found.");
  return downloadSavedChecklistEvidence(result.run, result.evidence, { storage });
}

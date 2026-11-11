import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { assertChecklistDraftReadyForReview } from "./checklistDraftService.js";
import { downloadSavedChecklistEvidence } from "./checklistEvidenceService.js";
import { pilotChecklistPhotoRequirementId, projectChecklistEvidenceGallery } from "./checklistEvidenceDefinition.js";
import { selectMultiPhotoEvidence } from "./checklistMultiPhotoService.js";

export const clientReportCapabilityId = "active";
export const clientReportLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1000;
const initialRunId = "initial";
const tokenHashPattern = /^[a-f0-9]{64}$/;
const checklistAnswers = new Set(["UNANSWERED", "DONE", "NOT_APPLICABLE"]);
const inventoryAnswers = new Set(["UNANSWERED", "LOW", "MEDIUM", "HIGH", "NEEDS_RESTOCK"]);
export const clientReportNoteMaximum = 1000;
export const clientReportSentChannels = Object.freeze(["WHATSAPP", "EMAIL", "OTHER"]);

/**
 * How the manager presents one report link: an optional note to the client
 * and whether the cleaner's own notes are included. Stored on the link, never
 * on the checklist evidence.
 */
export function normalizeClientReportPresentation(value = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Report presentation is invalid.");
  }
  const note = value.managerNote ?? "";
  if (typeof note !== "string" || note.length > clientReportNoteMaximum) {
    throw new HttpsError("invalid-argument", "Report note is invalid.");
  }
  if (value.includeCleanerNotes !== undefined && typeof value.includeCleanerNotes !== "boolean") {
    throw new HttpsError("invalid-argument", "Report presentation is invalid.");
  }
  return { managerNote: note.trim(), includeCleanerNotes: value.includeCleanerNotes !== false };
}

function storedPresentation(capability) {
  try {
    return normalizeClientReportPresentation(capability?.presentation || {});
  } catch {
    return { managerNote: "", includeCleanerNotes: true };
  }
}

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
/** FB07: photos the manager excluded from the client presentation. Evidence is never deleted. */
export function reportHiddenEvidenceIds(run) {
  const hidden = run?.reportHiddenEvidence;
  return new Set(hidden && typeof hidden === "object" ? Object.keys(hidden).filter((id) => hidden[id]?.hidden === true) : []);
}

/** Counts the client reads first: tasks done, photos and supplies that need attention. */
export function clientReportSummary(sections, inventoryItems, photoCount) {
  const items = sections.flatMap((section) => section.items);
  return {
    tasksDone: items.filter((item) => item.answer === "DONE").length,
    tasksNotApplicable: items.filter((item) => item.answer === "NOT_APPLICABLE").length,
    tasksTotal: items.length,
    photoCount,
    restockCount: inventoryItems.filter((item) => item.answer === "NEEDS_RESTOCK" || item.answer === "LOW").length,
  };
}

export function projectClientReport(run, draft, evidence, presentationInput = {}) {
  const presentation = normalizeClientReportPresentation(presentationInput);
  if (run?.status !== "READY_FOR_REVIEW") {
    throw new HttpsError("failed-precondition", "A checklist ready for review is required.");
  }
  const normalizedDraft = assertChecklistDraftReadyForReview(run, draft);
  if (run.readyForReviewDraftRevision !== normalizedDraft.revision) {
    throw new HttpsError("failed-precondition", "The saved checklist revision is unavailable.");
  }
  const definition = run.resolvedDefinition || {};
  const sections = (Array.isArray(definition.sections) ? definition.sections : []).map((section) => ({
    ...(typeof section?.title === "string" && section.title.trim() ? { title: section.title.trim() } : {}),
    ...(typeof section?.titleKey === "string" && section.titleKey.trim() ? { titleKey: section.titleKey.trim() } : {}),
    items: (Array.isArray(section?.items) ? section.items : []).map((item) => ({
      ...visibleLabel(item),
      answer: validAnswer(normalizedDraft.checklistAnswers?.[item.id], checklistAnswers),
    })),
  }));
  const inventoryItems = (Array.isArray(definition.inventoryItems) ? definition.inventoryItems : []).map((item) => ({
    ...visibleLabel(item),
    answer: validAnswer(normalizedDraft.inventoryAnswers?.[item.id], inventoryAnswers),
  }));
  const galleryPhotos = run.evidencePolicy?.version === 2 ? visiblePhotos(run, evidence) : null;
  const hasPhoto = galleryPhotos ? galleryPhotos.length > 0
    : evidence?.status === "SAVED" && evidence.requirementId === pilotChecklistPhotoRequirementId;
  return {
    titleKey: "clientReport.title",
    propertyName: typeof run.propertySnapshot?.propertyName === "string"
      ? run.propertySnapshot.propertyName
      : "",
    serviceDate: /^\d{4}-\d{2}-\d{2}$/.test(run.jobSnapshot?.scheduledDate || "")
      ? run.jobSnapshot.scheduledDate
      : null,
    sections,
    inventoryItems,
    issueNotes: presentation.includeCleanerNotes ? normalizedDraft.issueNotes || "" : "",
    generalNotes: presentation.includeCleanerNotes ? normalizedDraft.generalNotes || "" : "",
    managerNote: presentation.managerNote,
    summary: clientReportSummary(sections, inventoryItems, galleryPhotos ? galleryPhotos.length : hasPhoto ? 1 : 0),
    hasPhoto,
    ...(galleryPhotos ? { evidence: projectChecklistEvidenceGallery(galleryPhotos) } : {}),
  };
}

function visiblePhotos(run, evidence) {
  const hidden = reportHiddenEvidenceIds(run);
  return (evidence?.photos || []).filter((photo) => !hidden.has(photo?.evidenceId));
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
    presentation: storedPresentation(capability),
    ...(clientReportSentChannels.includes(capability.lastSent?.channel)
      ? { lastSent: { channel: capability.lastSent.channel, at: toIso(capability.lastSent.at) } } : {}),
  };
}

/**
 * Changes how the active link presents the report, or records that the
 * manager sent it (the manager sends it herself; nothing is sent from here).
 * The link and token stay the same.
 */
export async function updateClientReportForManager(database, {
  organizationId, jobId, runId = initialRunId, actorUid, presentation, markSent, now = new Date(),
}) {
  if (!validPathId(jobId) || !validPathId(runId) || typeof actorUid !== "string" || !actorUid
    || (presentation === undefined && markSent === undefined)
    || (markSent !== undefined && !clientReportSentChannels.includes(markSent?.channel))) {
    throw new HttpsError("invalid-argument", "Report request is invalid.");
  }
  const next = presentation === undefined ? null : normalizeClientReportPresentation(presentation);
  const capabilityRef = capabilityReference(database, organizationId, jobId, runId);
  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(capabilityRef);
    const capability = snapshot.exists ? snapshot.data() : null;
    if (clientReportCapabilityState(capability, now) !== "ACTIVE") {
      throw new HttpsError("failed-precondition", "An active report link is required.");
    }
    const changes = {
      ...(next ? { presentation: next, presentationUpdatedAt: FieldValue.serverTimestamp(), presentationUpdatedByUid: actorUid } : {}),
      ...(markSent ? { lastSent: { channel: markSent.channel, at: FieldValue.serverTimestamp(), byUid: actorUid } } : {}),
    };
    transaction.update(capabilityRef, changes);
    return {
      capability: projectCapability({
        ...capability,
        ...(next ? { presentation: next } : {}),
        ...(markSent ? { lastSent: { channel: markSent.channel, at: Timestamp.fromDate(now) } } : {}),
      }, now),
    };
  });
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
  replaceExisting = false, presentation, now = new Date(),
}) {
  const requestedPresentation = presentation === undefined ? null : normalizeClientReportPresentation(presentation);
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
      // A replaced link keeps the manager's note and choice unless new ones are given.
      presentation: requestedPresentation || storedPresentation(currentCapability),
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

/**
 * Reads one report from the frozen Run. `admit` decides whether the report's
 * own link state allows this reader; everything else is checked here.
 */
async function loadReportAt(database, { organizationId, jobId, runId, admit }) {
  const jobRef = jobReference(database, organizationId, jobId);
  const runRef = runReference(database, organizationId, jobId, runId);
  const draftRef = runRef.collection("drafts").doc("current");
  const evidenceRef = runRef.collection("evidence").doc(pilotChecklistPhotoRequirementId);
  const capabilityRef = capabilityReference(database, organizationId, jobId, runId);
  const [job, run, draft, evidence, capability] = await Promise.all([
    jobRef.get(), runRef.get(), draftRef.get(), evidenceRef.get(), capabilityRef.get(),
  ]);
  if (!job.exists || !run.exists || !capability.exists) throw new HttpsError("not-found", "Report not found.");
  const capabilityData = capability.data();
  if (!admit(capabilityData) || run.data().status !== "READY_FOR_REVIEW") {
    throw new HttpsError("failed-precondition", "Report is unavailable.");
  }
  const draftData = draft.exists ? draft.data() : null;
  if (!evidence.exists || evidence.data().status !== "SAVED"
    || evidence.data().requirementId !== pilotChecklistPhotoRequirementId) {
    throw new HttpsError("failed-precondition", "Saved checklist evidence is unavailable.");
  }
  const gallery = run.data().evidencePolicy?.version === 2
    ? (await runRef.collection("evidenceState").doc("current").get()).data() : null;
  const report = projectClientReport(run.data(), draftData, gallery || (evidence.exists ? evidence.data() : null),
    storedPresentation(capabilityData));
  return { report, job: job.data(), run: run.data(), evidence: evidence.exists ? evidence.data() : null, gallery };
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
  const lookupExpiry = lookup.expiresAt?.toMillis?.();
  const result = await loadReportAt(database, { organizationId, jobId: lookup.jobId, runId: lookup.runId,
    admit: (capability) => capability.tokenHash === tokenHash && clientReportCapabilityState(capability, now) === "ACTIVE"
      && Boolean(lookupExpiry) && lookupExpiry > now.getTime() });
  return { ...result, location: lookup };
}

/**
 * A report the manager has released to the client: she created its client
 * report and has not turned it off. The seven-day life of the report's own
 * link does not apply to the client portal.
 */
export function clientReportReleased(capability) {
  return capability?.status === "ACTIVE";
}

/** The released report of one Job, for a reader already authorized for that Job. */
export async function loadReleasedClientReport(database, { organizationId, jobId, runId = initialRunId }) {
  if (!validPathId(jobId)) throw new HttpsError("not-found", "Report not found.");
  return loadReportAt(database, { organizationId, jobId, runId, admit: clientReportReleased });
}

function reportPhoto(result, { evidenceId, variant, storage }) {
  if (result.run.evidencePolicy?.version === 2) {
    const photo = selectMultiPhotoEvidence(result.gallery, { evidenceId });
    if (!photo || reportHiddenEvidenceIds(result.run).has(photo.evidenceId)) throw new HttpsError("not-found", "Report photo not found.");
    return downloadSavedChecklistEvidence(result.run, photo, { storage, variant });
  }
  if (evidenceId !== undefined) throw new HttpsError("not-found", "Report photo not found.");
  if (!result.report.hasPhoto || !result.evidence) throw new HttpsError("not-found", "Report photo not found.");
  return downloadSavedChecklistEvidence(result.run, result.evidence, { storage, variant });
}

export async function downloadReleasedClientReportPhoto(database, { organizationId, jobId, evidenceId, variant, storage }) {
  return reportPhoto(await loadReleasedClientReport(database, { organizationId, jobId }), { evidenceId, variant, storage });
}

/** Whether the manager released the report of this Job; one read. */
export async function clientReportReleasedForJob(database, { organizationId, jobId, runId = initialRunId }) {
  return clientReportReleased((await capabilityReference(database, organizationId, jobId, runId).get()).data());
}

export async function loadPublicClientReport(database, options) {
  const result = await resolvePublicClientReport(database, options);
  return result.report;
}

export async function downloadPublicClientReportPhoto(database, {
  organizationId, tokenHash, evidenceId, variant, now = new Date(), storage,
}) {
  return reportPhoto(await resolvePublicClientReport(database, { organizationId, tokenHash, now }), { evidenceId, variant, storage });
}

/**
 * The manager hides (or shows again) one saved photo in the client report,
 * with a reason. The photo, its author and time stay in the checklist evidence.
 */
export async function setReportPhotoVisibilityForManager(database, { organizationId, jobId, evidenceId, hidden, reason, actorUid }) {
  if (typeof evidenceId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(evidenceId) || typeof hidden !== "boolean"
    || typeof actorUid !== "string" || !actorUid || (reason !== undefined && (typeof reason !== "string" || reason.length > 300))) {
    throw new HttpsError("invalid-argument", "Report photo request is invalid.");
  }
  const runRef = database.doc(`organizations/${organizationId}/jobs/${jobId}/checklistRuns/initial`);
  return database.runTransaction(async (transaction) => {
    const [runSnapshot, stateSnapshot] = await Promise.all([
      transaction.get(runRef), transaction.get(runRef.collection("evidenceState").doc("current")),
    ]);
    if (!runSnapshot.exists || runSnapshot.data().evidencePolicy?.version !== 2
      || !(stateSnapshot.data()?.photos || []).some((photo) => photo.evidenceId === evidenceId)) {
      throw new HttpsError("not-found", "Checklist photo not found.");
    }
    transaction.update(runRef, {
      [`reportHiddenEvidence.${evidenceId}`]: {
        hidden, reason: typeof reason === "string" ? reason.trim() : "", byUid: actorUid, at: FieldValue.serverTimestamp(),
      },
    });
    return { evidenceId, hidden };
  });
}

import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError } from "firebase-functions/v2/https";
import { checklistCapabilityState } from "./checklistCapabilityService.js";
import { createChecklistEvidencePolicy, isPilotChecklistPhotoRequirement, pilotChecklistPhotoRequirementId, projectChecklistEvidenceGallery } from "./checklistEvidenceDefinition.js";
import { assertMetadataSafeChecklistImage } from "./checklistImagePrivacy.js";
import { getChecklistAttemptStorage } from "./checklistAttemptStorage.js";

export const checklistUploadLeaseMilliseconds = 2 * 60 * 1000;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const mutationPattern = /^[A-Za-z0-9_-]{1,128}$/;
const emptyState = () => ({ photos: [], pending: [], contentCount: 0, revision: 0 });
// Saved, removed and failed contents of one Run; leaves room for corrections at 60 photos.
export const maximumChecklistContentHistory = 150;
const stateRef = initial => initial.runRef.collection("evidenceState").doc("current");
const identityRef = (initial, hash) => initial.runRef.collection("evidenceContent").doc(hash);
const aliasRef = initial => initial.runRef.collection("evidence").doc(pilotChecklistPhotoRequirementId);
const clockFor = now => { const start = Date.now(); return () => new Date((now?.getTime() ?? start) + Date.now() - start); };
function unavailable() { throw new HttpsError("failed-precondition", "Checklist capability is no longer available."); }

function assertContext(initial, options, capability, job, run, now, editable = true) {
  if (!capability || !job || !run || capability.tokenHash !== options.tokenHash
    || capability.organizationId !== options.organizationId || capability.jobId !== initial.location.jobId
    || capability.runId !== initial.location.runId || run.organizationId !== options.organizationId
    || run.jobId !== initial.location.jobId || checklistCapabilityState(capability, job, run, now) !== "ACTIVE") unavailable();
  if (run.evidencePolicy?.version !== 2 || (editable && run.status !== "DRAFT")) {
    throw new HttpsError("failed-precondition", "Checklist Run is no longer editable.");
  }
  createChecklistEvidencePolicy(run.evidencePolicy);
}

async function readContext(transaction, initial, options, now, editable = true) {
  const [cap, job, run, state] = await Promise.all([
    transaction.get(initial.capabilityRef), transaction.get(initial.jobRef), transaction.get(initial.runRef), transaction.get(stateRef(initial)),
  ]);
  assertContext(initial, options, cap.data(), job.data(), run.data(), typeof now === "function" ? now() : now, editable);
  return { capability: cap.data(), run: run.data(), state: state.exists ? state.data() : emptyState() };
}

/** Attempt paths are unique and never reused. Generation preconditions prevent cross-attempt deletion. */
async function cleanupObject(storage, photo) {
  // Neither absence nor an observed generation fences an outstanding write.
  // Unknown writers remain charged even after their finalization lease expires.
  if (!photo?.storagePath || photo.writerSettled !== true) return false;
  const file = storage.bucket().file(photo.storagePath);
  try {
    const generation = photo.generation || (await file.getMetadata())[0].generation;
    if (!generation) return false;
    await storage.bucket().file(photo.storagePath, { generation, preconditionOpts: { ifGenerationMatch: generation } }).delete({ ignoreNotFound: true });
    return true;
  } catch (error) { return error?.code === 404 || error?.code === "404"; }
}

async function releaseCleanedAttempt(database, initial, photo) {
  if (photo.writerSettled !== true) return;
  await database.runTransaction(async transaction => {
    const [stateSnapshot, contentSnapshot] = await Promise.all([transaction.get(stateRef(initial)), transaction.get(identityRef(initial, photo.contentHash))]);
    const state = stateSnapshot.data() || emptyState();
    const content = contentSnapshot.data();
    // Cleanup never changes a committed photo or another writer's reservation.
    if (content?.status === "SAVED" && content.attemptId === photo.attemptId) return;
    if (content?.status === "RESERVED" && content.attemptId === photo.attemptId) transaction.set(identityRef(initial, photo.contentHash), { ...content, status: "FAILED" });
    transaction.set(stateRef(initial), { ...state, pending: state.pending.filter(p => p.attemptId !== photo.attemptId) });
  });
}

/** Reclaim expired leases only on mutations. An old writer cannot finalize without its exact live lease. */
async function reclaimExpired(database, initial, options, clock, storage) {
  const stale = await database.runTransaction(async transaction => {
    const { state } = await readContext(transaction, initial, options, clock);
    const expired = state.pending.filter(p => p.leaseExpiresAt <= clock().getTime());
    return expired;
  });
  for (const photo of stale) {
    if (await cleanupObject(storage, photo)) await releaseCleanedAttempt(database, initial, photo);
  }
}

export async function recoverChecklistUploadsBeforeSubmission(database, initial, options) {
  return reclaimExpired(database, initial, options, clockFor(options.now), options.storage || getStorage());
}

function synchronizeRequiredAlias(transaction, initial, state) {
  const required = state.photos.find(photo => photo.requirementId === pilotChecklistPhotoRequirementId);
  if (required) transaction.set(aliasRef(initial), required);
  else transaction.delete(aliasRef(initial));
}

export async function loadMultiPhotoEvidence(database, initial, options) {
  const clock = clockFor(options.now);
  return database.runTransaction(async transaction => {
    const { state } = await readContext(transaction, initial, options, clock, false);
    const evidence = projectChecklistEvidenceGallery(state.photos);
    return options.includeRevision ? { evidence, evidenceRevision: state.revision || 0 } : evidence;
  });
}

export async function uploadMultiPhotoEvidence(database, initial, options, image) {
  const { bytes, requirementId, storage = getStorage() } = options;
  const clock = clockFor(options.now);
  assertMetadataSafeChecklistImage(bytes, image.contentType);
  await reclaimExpired(database, initial, options, clock, storage);
  const attemptId = randomUUID();
  const newEvidenceId = randomUUID();
  const reservation = await database.runTransaction(async transaction => {
    const { state, run, capability } = await readContext(transaction, initial, options, clock);
    if (requirementId !== "additional" && !isPilotChecklistPhotoRequirement(run, requirementId)) {
      throw new HttpsError("invalid-argument", "Checklist photo requirement is invalid.");
    }
    const previous = await transaction.get(identityRef(initial, image.contentHash));
    const content = previous.data();
    if (content?.status === "REMOVED") throw new HttpsError("failed-precondition", "This photo was removed. Choose another image.");
    if (content?.status === "SAVED") {
      if (content.requirementId !== requirementId) throw new HttpsError("already-exists", "This photo is already saved for another purpose.");
      return { duplicate: true, evidenceId: content.evidenceId, evidenceRevision: state.revision || 0, evidence: projectChecklistEvidenceGallery(state.photos) };
    }
    if (state.pending.some(p => p.contentHash === image.contentHash && p.status === "RESERVED" && p.leaseExpiresAt > clock().getTime())) {
      throw new HttpsError("aborted", "This photo is still uploading. Retry shortly.");
    }
    if (!content && (state.contentCount || 0) >= maximumChecklistContentHistory) throw new HttpsError("resource-exhausted", "Checklist photo correction limit reached.");
    const active = [...state.photos, ...state.pending];
    if (active.length >= run.evidencePolicy.maxPhotos || active.reduce((sum, p) => sum + p.sizeBytes, 0) + bytes.length > run.evidencePolicy.maxTotalBytes) {
      throw new HttpsError("resource-exhausted", "Checklist photo limit reached.");
    }
    const eligible = [...state.photos, ...state.pending.filter(p => p.status === "RESERVED" && p.leaseExpiresAt > clock().getTime())];
    if (requirementId === pilotChecklistPhotoRequirementId && eligible.some(p => p.requirementId === requirementId)) {
      throw new HttpsError("already-exists", "The required photo is already saved or uploading. Add other photos as additional evidence.");
    }
    const photo = {
      status: "RESERVED", evidenceId: content?.evidenceId || newEvidenceId, attemptId, writerSettled: false,
      contentHash: image.contentHash, requirementId, contentType: image.contentType, sizeBytes: bytes.length,
      leaseExpiresAt: clock().getTime() + checklistUploadLeaseMilliseconds,
      capabilityRotation: capability.rotation || 0, contextRevision: capability.contextRevision,
      storagePath: `${initial.runRef.path}/evidence-v2/${attemptId}.${image.extension}`,
    };
    transaction.set(identityRef(initial, image.contentHash), photo);
    transaction.set(stateRef(initial), { ...state, contentCount: (state.contentCount || 0) + (content ? 0 : 1), pending: [...state.pending, photo] });
    return { photo };
  });
  if (reservation.duplicate) return reservation;
  const photo = reservation.photo;
  const attemptStorage = options.attemptStorage || getChecklistAttemptStorage(storage);
  const file = attemptStorage.bucket().file(photo.storagePath);
  let writerSettled = false;
  try {
    await file.save(bytes, { resumable: false, contentType: image.contentType, metadata: { cacheControl: "private, no-store" }, preconditionOpts: { ifGenerationMatch: 0 } });
    // The dedicated client sends this attempt once. A rejection remains unknown;
    // a successful completion has no earlier application retry left outstanding.
    writerSettled = true;
    const [metadata] = await file.getMetadata();
    if (!metadata.generation) throw new Error("Storage generation unavailable.");
    const result = await database.runTransaction(async transaction => {
      const { state, run, capability } = await readContext(transaction, initial, options, clock);
      const content = (await transaction.get(identityRef(initial, image.contentHash))).data();
      if (content?.status === "SAVED" && content.attemptId === attemptId) return { duplicate: true, evidenceId: photo.evidenceId, evidenceRevision: state.revision || 0, evidence: projectChecklistEvidenceGallery(state.photos) };
      const pending = state.pending.find(p => p.attemptId === attemptId);
      if (!pending || pending.leaseExpiresAt <= clock().getTime() || content?.attemptId !== attemptId
        || content.status !== "RESERVED" || capability.rotation !== photo.capabilityRotation
        || capability.contextRevision !== photo.contextRevision) unavailable();
      if (requirementId !== "additional" && !isPilotChecklistPhotoRequirement(run, requirementId)) unavailable();
      const saved = { ...photo, status: "SAVED", writerSettled, generation: metadata.generation, createdAt: Timestamp.fromDate(clock()) };
      const next = { ...state, revision: (state.revision || 0) + 1, photos: [...state.photos, saved], pending: state.pending.filter(p => p.attemptId !== attemptId) };
      transaction.set(identityRef(initial, image.contentHash), saved);
      transaction.set(stateRef(initial), next);
      synchronizeRequiredAlias(transaction, initial, next);
      return { duplicate: false, evidenceId: photo.evidenceId, evidenceRevision: next.revision, evidence: projectChecklistEvidenceGallery(next.photos) };
    });
    return result;
  } catch (error) {
    // A transaction response can be lost after a successful commit. Confirm
    // state transactionally before changing metadata or deleting any object.
    let recovery;
    try {
      recovery = await database.runTransaction(async transaction => {
        const [contentSnapshot, stateSnapshot] = await Promise.all([
          transaction.get(identityRef(initial, image.contentHash)), transaction.get(stateRef(initial)),
        ]);
        const content = contentSnapshot.data();
        const state = stateSnapshot.exists ? stateSnapshot.data() : emptyState();
        if (content?.status === "SAVED" && content.attemptId === attemptId) return { committed: true };
        if (content?.attemptId === attemptId && content.status === "RESERVED") {
          transaction.set(identityRef(initial, image.contentHash), { ...content, status: "FAILED" });
        }
        if (state.pending.some(p => p.attemptId === attemptId)) transaction.set(stateRef(initial), { ...state, pending: state.pending.map(p => p.attemptId === attemptId ? { ...p, status: "CLEANUP", writerSettled, leaseExpiresAt: 0 } : p) });
        return { committed: false };
      });
    } catch { throw error; } // Unknown commit outcome: retain object, fail closed.
    if (recovery.committed) return { duplicate: true, evidenceId: photo.evidenceId, ...await loadMultiPhotoEvidence(database, initial, { ...options, includeRevision: true }) };
    const cleanupPhoto = { ...photo, writerSettled };
    if (await cleanupObject(storage, cleanupPhoto)) await releaseCleanedAttempt(database, initial, cleanupPhoto);
    throw error;
  }
}

export async function removeMultiPhotoEvidence(database, initial, options) {
  const { evidenceId, mutationId, storage = getStorage() } = options;
  if (!uuid.test(evidenceId || "") || !mutationPattern.test(mutationId || "")) throw new HttpsError("invalid-argument", "Photo removal request is invalid.");
  const clock = clockFor(options.now);
  await reclaimExpired(database, initial, options, clock, storage);
  const receiptRef = initial.runRef.collection("evidenceRemovals").doc(mutationId);
  const result = await database.runTransaction(async transaction => {
    const { state, capability } = await readContext(transaction, initial, options, clock);
    const receipt = (await transaction.get(receiptRef)).data();
    if (receipt) {
      if (receipt.evidenceId !== evidenceId || receipt.capabilityRotation !== capability.rotation || receipt.contextRevision !== capability.contextRevision) throw new HttpsError("already-exists", "Photo mutation ID was already used.");
      return { duplicate: true, evidenceRevision: state.revision || 0, evidence: projectChecklistEvidenceGallery(state.photos), removed: receipt.removed };
    }
    const photo = state.photos.find(p => p.evidenceId === evidenceId);
    if (!photo) throw new HttpsError("not-found", "Checklist photo not found.");
    const next = { ...state, revision: (state.revision || 0) + 1, photos: state.photos.filter(p => p.evidenceId !== evidenceId), pending: [...state.pending, { ...photo, status: "CLEANUP", leaseExpiresAt: 0 }] };
    transaction.set(identityRef(initial, photo.contentHash), { ...photo, status: "REMOVED", removedAt: Timestamp.fromDate(clock()) });
    transaction.set(stateRef(initial), next);
    synchronizeRequiredAlias(transaction, initial, next);
    transaction.create(receiptRef, { evidenceId, removed: photo, capabilityRotation: capability.rotation, contextRevision: capability.contextRevision, createdAt: Timestamp.fromDate(clock()) });
    return { duplicate: false, evidenceRevision: next.revision, evidence: projectChecklistEvidenceGallery(next.photos), removed: photo };
  });
  if (await cleanupObject(storage, result.removed)) await releaseCleanedAttempt(database, initial, result.removed);
  return { duplicate: result.duplicate, removed: true, evidenceRevision: result.evidenceRevision, evidence: result.evidence };
}

// Kept in this module so callers cannot accidentally enable removal for V1.
export async function removePublicChecklistEvidence(database, options) {
  const { resolveActiveCapability } = await import("./checklistEvidenceService.js");
  const initial = await resolveActiveCapability(database, { ...options, now: options.now || new Date() });
  return removeMultiPhotoEvidence(database, initial, options);
}

export function selectMultiPhotoEvidence(state, { evidenceId, requirementId = pilotChecklistPhotoRequirementId } = {}) {
  if (evidenceId !== undefined && !uuid.test(evidenceId)) throw new HttpsError("invalid-argument", "Checklist photo selector is invalid.");
  return state?.photos?.find(photo => photo.status === "SAVED" && (evidenceId ? photo.evidenceId === evidenceId : photo.requirementId === requirementId)) || null;
}

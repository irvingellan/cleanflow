import { createHash } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { checklistCapabilityState } from "./checklistCapabilityService.js";
import {
  isPilotChecklistPhotoRequirement,
  maximumChecklistEvidenceSizeBytes,
  pilotChecklistPhotoRequirementId,
  projectChecklistEvidence,
  supportedChecklistEvidenceContentTypes,
} from "./checklistEvidenceDefinition.js";

const supportedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function capabilityLocation(document, organizationId) {
  const path = document.path.split("/");
  if (
    path.length !== 8 || path[0] !== "organizations" || path[1] !== organizationId
    || path[2] !== "jobs" || path[4] !== "checklistRuns" || path[6] !== "checklistCapabilities"
    || path[7] !== "active"
  ) return null;
  return { jobId: path[3], runId: path[5] };
}

function runReference(database, organizationId, jobId, runId) {
  return database.doc(`organizations/${organizationId}/jobs/${jobId}/checklistRuns/${runId}`);
}

function evidenceReference(database, organizationId, jobId, runId, requirementId) {
  return runReference(database, organizationId, jobId, runId)
    .collection("evidence")
    .doc(requirementId);
}

function detectImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: "image/png", extension: "png" };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

export function normalizeImageUpload({ contentType, bytes }) {
  if (!supportedImageTypes.has(contentType)) {
    throw new HttpsError("invalid-argument", "Choose a JPEG, PNG, or WebP image.");
  }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maximumChecklistEvidenceSizeBytes) {
    throw new HttpsError("invalid-argument", "Checklist photo is invalid or too large.");
  }
  const detected = detectImage(bytes);
  if (!detected || detected.contentType !== contentType) {
    throw new HttpsError("invalid-argument", "Checklist photo content does not match its image type.");
  }
  return { ...detected, contentHash: createHash("sha256").update(bytes).digest("hex") };
}

function evidenceStoragePath({ organizationId, jobId, runId, requirementId, contentHash, extension }) {
  return `organizations/${organizationId}/jobs/${jobId}/checklistRuns/${runId}/evidence/${requirementId}/${contentHash}.${extension}`;
}

async function resolveActiveCapability(database, { organizationId, tokenHash, now }) {
  const matches = await database.collectionGroup("checklistCapabilities")
    .where("tokenHash", "==", tokenHash).limit(2).get();
  if (matches.size !== 1) throw new HttpsError("not-found", "Checklist capability not found.");
  const capabilityRef = matches.docs[0].ref;
  const location = capabilityLocation(capabilityRef, organizationId);
  if (!location) throw new HttpsError("not-found", "Checklist capability not found.");

  const jobRef = database.doc(`organizations/${organizationId}/jobs/${location.jobId}`);
  const runRef = runReference(database, organizationId, location.jobId, location.runId);
  const evidenceRef = evidenceReference(
    database, organizationId, location.jobId, location.runId, pilotChecklistPhotoRequirementId,
  );
  const [capabilitySnapshot, jobSnapshot, runSnapshot, evidenceSnapshot] = await Promise.all([
    capabilityRef.get(), jobRef.get(), runRef.get(), evidenceRef.get(),
  ]);
  if (!capabilitySnapshot.exists || !jobSnapshot.exists || !runSnapshot.exists) {
    throw new HttpsError("not-found", "Checklist capability not found.");
  }
  const capability = capabilitySnapshot.data();
  const job = jobSnapshot.data();
  const run = runSnapshot.data();
  if (capability.tokenHash !== tokenHash || checklistCapabilityState(capability, job, run, now) !== "ACTIVE") {
    throw new HttpsError("failed-precondition", "Checklist capability is no longer available.");
  }
  return {
    capability,
    capabilityRef,
    location,
    job,
    jobRef,
    run,
    runRef,
    evidence: evidenceSnapshot.exists ? evidenceSnapshot.data() : null,
    evidenceRef,
  };
}

export async function loadPublicChecklistEvidence(database, { organizationId, tokenHash, now = new Date() }) {
  const resolved = await resolveActiveCapability(database, { organizationId, tokenHash, now });
  return projectChecklistEvidence(resolved.evidence);
}

/**
 * The deterministic content-hash path makes a lost response safe to retry: the
 * same bytes can finalize the same evidence document without a second photo.
 */
export async function uploadPublicChecklistEvidence(database, {
  organizationId,
  tokenHash,
  requirementId,
  contentType,
  bytes,
  now = new Date(),
  storage = getStorage(),
}) {
  const image = normalizeImageUpload({ contentType, bytes });
  const initial = await resolveActiveCapability(database, { organizationId, tokenHash, now });
  if (initial.run.status !== "DRAFT") {
    throw new HttpsError("failed-precondition", "Checklist Run is no longer editable.");
  }
  if (!isPilotChecklistPhotoRequirement(initial.run, requirementId)) {
    throw new HttpsError("invalid-argument", "Checklist photo requirement is invalid.");
  }
  if (initial.evidence) {
    if (initial.evidence.contentHash === image.contentHash && initial.evidence.status === "SAVED") {
      return { duplicate: true, evidence: projectChecklistEvidence(initial.evidence) };
    }
    throw new HttpsError("already-exists", "A checklist photo is already saved for this requirement.");
  }

  const storagePath = evidenceStoragePath({
    organizationId,
    jobId: initial.location.jobId,
    runId: initial.location.runId,
    requirementId,
    contentHash: image.contentHash,
    extension: image.extension,
  });
  const file = storage.bucket().file(storagePath);
  let createdObject = false;
  try {
    try {
      await file.save(bytes, {
        resumable: false,
        contentType: image.contentType,
        metadata: {
          cacheControl: "private, no-store",
          metadata: { contentHash: image.contentHash, requirementId },
        },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
      createdObject = true;
    } catch (error) {
      // A matching deterministic object can be the prior attempt whose HTTP
      // response was lost. Firestore remains the source of truth below.
      if (error?.code !== 412 && error?.code !== "412") throw error;
    }

    const finalized = await database.runTransaction(async (transaction) => {
      const [capabilitySnapshot, jobSnapshot, runSnapshot, evidenceSnapshot] = await Promise.all([
        transaction.get(initial.capabilityRef), transaction.get(initial.jobRef),
        transaction.get(initial.runRef), transaction.get(initial.evidenceRef),
      ]);
      if (!capabilitySnapshot.exists || !jobSnapshot.exists || !runSnapshot.exists) {
        throw new HttpsError("not-found", "Checklist capability not found.");
      }
      const capability = capabilitySnapshot.data();
      const job = jobSnapshot.data();
      const run = runSnapshot.data();
      if (capability.tokenHash !== tokenHash || checklistCapabilityState(capability, job, run, now) !== "ACTIVE") {
        throw new HttpsError("failed-precondition", "Checklist capability is no longer available.");
      }
      if (run.status !== "DRAFT") throw new HttpsError("failed-precondition", "Checklist Run is no longer editable.");
      if (!isPilotChecklistPhotoRequirement(run, requirementId)) {
        throw new HttpsError("invalid-argument", "Checklist photo requirement is invalid.");
      }
      if (evidenceSnapshot.exists) {
        const evidence = evidenceSnapshot.data();
        if (evidence.contentHash === image.contentHash && evidence.status === "SAVED") {
          return { duplicate: true, evidence: projectChecklistEvidence(evidence) };
        }
        throw new HttpsError("already-exists", "A checklist photo is already saved for this requirement.");
      }
      const evidence = {
        status: "SAVED",
        runId: initial.location.runId,
        requirementId,
        storagePath,
        contentHash: image.contentHash,
        contentType: image.contentType,
        sizeBytes: bytes.length,
        createdAt: FieldValue.serverTimestamp(),
      };
      transaction.create(initial.evidenceRef, evidence);
      return { duplicate: false, evidence: projectChecklistEvidence(evidence) };
    });
    return finalized;
  } catch (error) {
    // A failed final authorization/context check must not leave a newly-created
    // private object usable without its server-owned evidence record.
    if (createdObject) {
      try { await file.delete({ ignoreNotFound: true }); } catch { /* best-effort orphan cleanup */ }
    }
    throw error;
  }
}

function assertStoredEvidence(run, evidence, requirementId) {
  if (!isPilotChecklistPhotoRequirement(run, requirementId)
    || evidence?.status !== "SAVED"
    || evidence.requirementId !== requirementId
    || !supportedChecklistEvidenceContentTypes.has(evidence.contentType)
    || !Number.isInteger(evidence.sizeBytes)
    || evidence.sizeBytes <= 0
    || evidence.sizeBytes > maximumChecklistEvidenceSizeBytes
    || typeof evidence.storagePath !== "string") {
    throw new HttpsError("not-found", "Checklist photo not found.");
  }
}

/** Downloads bytes only after a server-side caller has resolved the exact saved evidence record. */
export async function downloadSavedChecklistEvidence(run, evidence, { storage = getStorage() } = {}) {
  assertStoredEvidence(run, evidence, pilotChecklistPhotoRequirementId);
  const [bytes] = await storage.bucket().file(evidence.storagePath).download();
  return { bytes, contentType: evidence.contentType };
}

export async function downloadPublicChecklistEvidence(database, {
  organizationId, tokenHash, requirementId, now = new Date(), storage = getStorage(),
}) {
  const resolved = await resolveActiveCapability(database, { organizationId, tokenHash, now });
  assertStoredEvidence(resolved.run, resolved.evidence, requirementId);
  return downloadSavedChecklistEvidence(resolved.run, resolved.evidence, { storage });
}

export async function downloadManagerChecklistEvidence(database, {
  organizationId, jobId, runId, requirementId, storage = getStorage(),
}) {
  const runRef = runReference(database, organizationId, jobId, runId);
  const evidenceRef = evidenceReference(database, organizationId, jobId, runId, requirementId);
  const [runSnapshot, evidenceSnapshot] = await Promise.all([runRef.get(), evidenceRef.get()]);
  if (!runSnapshot.exists || !evidenceSnapshot.exists) throw new HttpsError("not-found", "Checklist photo not found.");
  const run = runSnapshot.data();
  const evidence = evidenceSnapshot.data();
  assertStoredEvidence(run, evidence, requirementId);
  return downloadSavedChecklistEvidence(run, evidence, { storage });
}

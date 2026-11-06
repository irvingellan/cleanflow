export const pilotChecklistPhotoRequirementId = "living-belongings";
export const maximumChecklistEvidenceSizeBytes = 5 * 1024 * 1024;
export const additionalChecklistPhotoRequirementId = "additional";
// FB05/FB06: some cleanings need 40–50 photos. New Runs get room for 60
// optimized photos (about 0.5–1.5 MB each at 1920 px). Existing Runs keep the
// policy they were created with (20 photos / 50 MB).
export const defaultChecklistMaxPhotos = 60;
export const defaultChecklistMaxTotalBytes = 120 * 1024 * 1024;
export const maximumChecklistPolicyPhotos = 60;
export function createChecklistEvidencePolicy({ maxPhotos = defaultChecklistMaxPhotos, maxTotalBytes = defaultChecklistMaxTotalBytes } = {}) {
  if (!Number.isInteger(maxPhotos) || maxPhotos < 1 || maxPhotos > maximumChecklistPolicyPhotos
    || !Number.isInteger(maxTotalBytes) || maxTotalBytes < 1 || maxTotalBytes > 150 * 1024 * 1024) {
    throw new Error("Invalid server checklist evidence policy.");
  }
  return { version: 2, maxPhotos, maxTotalBytes };
}

export function projectChecklistEvidenceGallery(photos = []) {
  return photos.filter(photo => photo?.status === "SAVED").map(photo => ({
    evidenceId: photo.evidenceId,
    requirementId: photo.requirementId,
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes,
    createdAt: createdAtIso(photo.createdAt),
  }));
}
export const supportedChecklistEvidenceContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function createdAtIso(value) {
  return value?.toDate?.()?.toISOString() || null;
}

/** Phase 5D.1 intentionally supports only the validated frozen v1 requirement. */
export function isPilotChecklistPhotoRequirement(run, requirementId) {
  if (requirementId !== pilotChecklistPhotoRequirementId) return false;
  return (run?.resolvedDefinition?.sections || [])
    .flatMap((section) => Array.isArray(section?.items) ? section.items : [])
    .some((item) => item?.id === requirementId && item?.requiresPhoto === true);
}

/** Server projections retain safe display metadata, never an object path or URL. */
export function projectChecklistEvidence(evidence) {
  if (evidence?.status !== "SAVED" || evidence.requirementId !== pilotChecklistPhotoRequirementId) return [];
  return [{
    requirementId: evidence.requirementId,
    contentType: supportedChecklistEvidenceContentTypes.has(evidence.contentType) ? evidence.contentType : null,
    sizeBytes: Number.isInteger(evidence.sizeBytes) ? evidence.sizeBytes : null,
    createdAt: createdAtIso(evidence.createdAt),
  }];
}

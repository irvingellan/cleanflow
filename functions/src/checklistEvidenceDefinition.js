export const pilotChecklistPhotoRequirementId = "living-belongings";
export const maximumChecklistEvidenceSizeBytes = 5 * 1024 * 1024;
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

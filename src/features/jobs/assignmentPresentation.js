import { currentCleanerName } from "../cleaners/cleanerIdentity.js";
import { getAssignedCleanerIds, isAssignmentAwareJob } from "./jobCompatibility.js";

/** Uses the v2 Job projection outside Job Detail to avoid per-row Assignment reads. */
export function assignedCleanerSummary(job, cleanerNamesById, translate, fallback) {
  if (isAssignmentAwareJob(job)) {
    const cleanerIds = getAssignedCleanerIds(job);
    const cleanerNames = cleanerIds
      .map((cleanerId) => cleanerNamesById[cleanerId])
      .filter(Boolean);

    if (cleanerNames.length > 0) {
      return cleanerNames.join(" · ");
    }

    const count = cleanerIds.length;

    if (count === 1) {
      return translate("jobs.cleanerAssignedOne", { count });
    }

    if (count > 1) {
      return translate("jobs.cleanersAssignedMany", { count });
    }
  }

  return currentCleanerName(
    job?.assignedCleanerId,
    job?.assignedCleanerName,
    cleanerNamesById,
    fallback,
  );
}

/** Link-based acknowledgment is operational only and remains attached to its source Offer. */
export function getAssignmentAcknowledgmentState(assignment, offers = []) {
  if (assignment?.isActive !== true) return null;
  const sourceOfferId = assignment?.sourceOfferId;
  if (typeof sourceOfferId !== "string" || !sourceOfferId.trim()) return null;
  const sourceOffer = offers.find((offer) => offer.id === sourceOfferId
    && offer.cleanerId === assignment.cleanerId
    && offer.status === "INTERESTED");
  if (!sourceOffer) return null;

  const hasTimestamp = Boolean(assignment.cleanerAcknowledgedAt);
  const hasOfferId = typeof assignment.cleanerAcknowledgedOfferId === "string"
    && Boolean(assignment.cleanerAcknowledgedOfferId);
  if (hasTimestamp && hasOfferId) {
    return assignment.cleanerAcknowledgedOfferId === sourceOfferId ? "CONFIRMED" : null;
  }
  return !hasTimestamp && !hasOfferId ? "AWAITING_CONFIRMATION" : null;
}

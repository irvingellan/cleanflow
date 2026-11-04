export const FIRST_ACCEPT_WINS = "FIRST_ACCEPT_WINS";

export function isAutomaticOfferJob(job) {
  return job?.offerDistributionMode === FIRST_ACCEPT_WINS;
}

export function canOptIntoAutomaticOffers(job) {
  return job?.schemaVersion === 2 && job.operationalStatus === "UNASSIGNED" && !job.archivedAt
    && job.offerDistributionMode == null && !job.firstAcceptClaim && !job.offerDistributionClosedAt
    && !job.assignedCleanerId && Array.isArray(job.assignedCleanerIds) && job.assignedCleanerIds.length === 0
    && (job.requiredCleanerCount === undefined || job.requiredCleanerCount === 1);
}

export function automaticOfferDisplayStatus(job, offer, now = Date.now()) {
  if (!isAutomaticOfferJob(job)) return null;
  if (offer.status === "ACCEPTED" || offer.status === "DECLINED") return offer.status;
  if (offer.status !== "PENDING" || job.firstAcceptClaim || job.offerDistributionClosedAt
    || job.archivedAt || job.operationalStatus !== "OFFERED"
    || offer.offeredChecklistContextRevision !== (job.checklistContextRevision ?? 0)) return "UNAVAILABLE";
  const expiresAt = offer.publicOfferExpiresAt?.toMillis?.();
  return Number.isFinite(expiresAt) && expiresAt > now ? "AWAITING_ACCEPTANCE" : "EXPIRED";
}

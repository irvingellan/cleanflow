export const FIRST_ACCEPT_WINS = "FIRST_ACCEPT_WINS";

export function isAutomaticOfferJob(job) {
  return job?.offerDistributionMode === FIRST_ACCEPT_WINS;
}

export function isAutomaticOfferRecord(offer, job) {
  return isAutomaticOfferJob(offer) || isAutomaticOfferJob(job);
}

export function checklistContextRevision(job) {
  if (!Object.prototype.hasOwnProperty.call(job, "checklistContextRevision")) return 0;
  return Number.isSafeInteger(job.checklistContextRevision) && job.checklistContextRevision >= 0
    ? job.checklistContextRevision
    : null;
}

export function emptySingleOfferRoster(job) {
  return job.schemaVersion === 2
    && (!Object.prototype.hasOwnProperty.call(job, "requiredCleanerCount") || job.requiredCleanerCount === 1)
    && (job.assignedCleanerId == null || job.assignedCleanerId === "")
    && Array.isArray(job.assignedCleanerIds)
    && job.assignedCleanerIds.length === 0;
}

export function automaticOfferState(offer, job, now) {
  if (!isAutomaticOfferJob(job) || !isAutomaticOfferJob(offer)
    || job.archivedAt || job.schemaVersion !== 2
    || !["PENDING", "DECLINED", "ACCEPTED"].includes(offer.status) || offer.revokedAt) return "unavailable";

  const expiry = typeof offer.publicOfferExpiresAt?.toMillis === "function"
    ? offer.publicOfferExpiresAt.toMillis() : null;
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) return "expired";

  // The Job is the authoritative close marker. A manager removing or
  // replacing an Assignment does not make the original Offers actionable.
  if (job.offerDistributionClosedAt || job.firstAcceptClaim || job.operationalStatus === "ASSIGNED") {
    return "already-taken";
  }

  const revision = checklistContextRevision(job);
  return job.operationalStatus === "OFFERED" && emptySingleOfferRoster(job)
    && offer.status !== "ACCEPTED" && revision !== null && revision < Number.MAX_SAFE_INTEGER
    && offer.offeredChecklistContextRevision === revision
    ? "available" : "unavailable";
}

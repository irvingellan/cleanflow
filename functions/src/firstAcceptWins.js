import { maxCleanersPerJob } from "./offerSlots.js";

export const FIRST_ACCEPT_WINS = "FIRST_ACCEPT_WINS";
export const automaticOfferBatchVersion = 2;

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
  return emptyAutomaticOfferRoster(job) && automaticOfferCapacity(job) === 1;
}

export function automaticOfferCapacity(job) {
  if (!Object.hasOwn(job, "requiredCleanerCount")) return 1;
  const capacity = job.requiredCleanerCount;
  return Number.isInteger(capacity) && capacity >= 1 && capacity <= maxCleanersPerJob ? capacity : null;
}

export function emptyAutomaticOfferRoster(job) {
  return job.schemaVersion === 2 && (job.assignedCleanerId == null || job.assignedCleanerId === "")
    && Array.isArray(job.assignedCleanerIds) && job.assignedCleanerIds.length === 0;
}

export function automaticOfferBatch(job) {
  const batch = job?.automaticOfferBatch;
  if (batch?.version !== automaticOfferBatchVersion || batch.capacity !== automaticOfferCapacity(job)
    || batch.capacity === null || !Number.isSafeInteger(batch.openingContextRevision) || batch.openingContextRevision < 0
    || !Number.isSafeInteger(batch.currentContextRevision) || batch.currentContextRevision < batch.openingContextRevision) return null;
  return batch;
}

export function matchesAutomaticOfferBatch(offer, batch) {
  return batch !== null && offer.automaticOfferBatchVersion === automaticOfferBatchVersion
    && offer.offeredChecklistContextRevision === batch.openingContextRevision;
}

export function validRosterId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && value === value.trim()
    && value !== "." && value !== ".." && !value.includes("/");
}

export function isCanonicalRoster(job) {
  const ids = job.assignedCleanerIds;
  return Array.isArray(ids) && ids.every(validRosterId) && new Set(ids).size === ids.length
    && (ids.length > 0) === (job.operationalStatus === "ASSIGNED");
}

export function rosterMatchesActiveAssignments(job, activeAssignments, organizationId, jobId) {
  return isCanonicalRoster(job) && activeAssignments.length === job.assignedCleanerIds.length
    && activeAssignments.every(assignment => assignment.isActive === true && assignment.organizationId === organizationId
      && assignment.jobId === jobId && job.assignedCleanerIds.includes(assignment.cleanerId))
    && new Set(activeAssignments.map(assignment => assignment.cleanerId)).size === activeAssignments.length;
}

function versionedAutomaticOfferState(offer, job) {
  const batch = automaticOfferBatch(job);
  if (!matchesAutomaticOfferBatch(offer, batch)
    || (job.firstAcceptClaim && (!job.offerDistributionClosedAt || batch.capacity !== 1))) return "unavailable";
  if (job.offerDistributionClosedAt) return "already-taken";
  if (!["OFFERED", "ASSIGNED"].includes(job.operationalStatus) || !isCanonicalRoster(job)
    || (job.assignedCleanerId != null && job.assignedCleanerId !== "")
    || checklistContextRevision(job) !== batch.currentContextRevision
    || batch.currentContextRevision >= Number.MAX_SAFE_INTEGER) return "unavailable";
  if (job.assignedCleanerIds.length >= batch.capacity) return "already-taken";
  return offer.status !== "ACCEPTED" && !job.assignedCleanerIds.includes(offer.cleanerId) ? "available" : "unavailable";
}

export function automaticOfferState(offer, job, now) {
  if (!isAutomaticOfferJob(job) || !isAutomaticOfferJob(offer)
    || job.archivedAt || job.schemaVersion !== 2
    || !["PENDING", "DECLINED", "ACCEPTED"].includes(offer.status) || offer.revokedAt) return "unavailable";

  const expiry = typeof offer.publicOfferExpiresAt?.toMillis === "function"
    ? offer.publicOfferExpiresAt.toMillis() : null;
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) return "expired";

  if (Object.hasOwn(job, "automaticOfferBatch") || Object.hasOwn(offer, "automaticOfferBatchVersion")) {
    return versionedAutomaticOfferState(offer, job);
  }

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

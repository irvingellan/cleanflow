// Manual-offer spots (FB08/FB09). A Job needs `requiredCleanerCount` cleaners
// (missing means one). When every spot is filled, invitations to cleaners who
// are not on the roster stop being available. Their responses are never
// rewritten: availability is derived here, and a manager's explicit decision
// is stored beside the cleaner's response. Keep in sync with
// src/features/jobs/offerSlots.js.

export const maxCleanersPerJob = 10;

export const offerManagerDecisions = Object.freeze({
  notSelected: "NOT_SELECTED",
  withdrawn: "WITHDRAWN",
});

const decisions = new Set(Object.values(offerManagerDecisions));

export function requiredCleanerCount(job) {
  const value = job?.requiredCleanerCount;
  return Number.isInteger(value) && value >= 1 && value <= maxCleanersPerJob ? value : 1;
}

export function rosterCleanerIds(job) {
  if (Array.isArray(job?.assignedCleanerIds)) {
    return [...new Set(job.assignedCleanerIds.filter((id) => typeof id === "string" && id))];
  }
  return typeof job?.assignedCleanerId === "string" && job.assignedCleanerId ? [job.assignedCleanerId] : [];
}

export function openSpots(job) {
  return Math.max(0, requiredCleanerCount(job) - rosterCleanerIds(job).length);
}

export function isJobFilled(job) {
  return rosterCleanerIds(job).length > 0 && openSpots(job) === 0;
}

export function managerDecisionOf(offer) {
  return decisions.has(offer?.managerDecision) ? offer.managerDecision : null;
}

/**
 * Availability of a manual Offer for its own recipient:
 * "assigned" (on the roster), "closed" (manager decision), "filled" (no spot
 * left for her) or "open".
 */
export function manualOfferAvailability(job, offer) {
  if (typeof offer?.cleanerId === "string" && rosterCleanerIds(job).includes(offer.cleanerId)) return "assigned";
  if (managerDecisionOf(offer)) return "closed";
  if (isJobFilled(job)) return "filled";
  return "open";
}

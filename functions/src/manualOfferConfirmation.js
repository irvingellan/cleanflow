import { automaticOfferCapacity, isAutomaticOfferRecord, validRosterId } from "./firstAcceptWins.js";

export function manualConfirmationCandidate(job, offer) {
  return job?.schemaVersion === 2 && !job.offerDistributionMode && !job.automaticOfferBatch && !job.firstAcceptClaim
    && !offer?.offerKind && !isAutomaticOfferRecord(offer, job) && validRosterId(offer?.cleanerId);
}

export function confirmsManualSpot(job, offer, otherRecipient = false) {
  const capacity = automaticOfferCapacity(job);
  return manualConfirmationCandidate(job, offer) && capacity !== null
    && (capacity > 1 || otherRecipient || validRosterId(offer.acceptedAssignmentId));
}

export function canonicalManualRecipient(offer, offerId, jobId, organizationId) {
  return validRosterId(offer?.cleanerId) && offerId === offer.cleanerId && !offer.offerKind && !offer.offerDistributionMode
    && (offer.organizationId == null || offer.organizationId === organizationId) && (offer.jobId == null || offer.jobId === jobId);
}

/** Old manual invitations have no batch marker. Count other recipients, including an earlier interest or decline. */
export async function loadManualConfirmation(jobRef, job, offer, read) {
  if (!manualConfirmationCandidate(job, offer)) return false;
  if (confirmsManualSpot(job, offer)) return true;
  const siblings = jobRef.collection("offers").where("cleanerId", "!=", offer.cleanerId)
    .select("cleanerId", "offerKind", "offerDistributionMode", "organizationId", "jobId").limit(2);
  let query = siblings;
  for (;;) {
    const others = await read(query);
    if (others.docs.some(doc => canonicalManualRecipient(doc.data(), doc.id, jobRef.id, jobRef.parent.parent.id))) return true;
    if (others.size < 2) return false;
    query = siblings.startAfter(others.docs.at(-1));
  }
}

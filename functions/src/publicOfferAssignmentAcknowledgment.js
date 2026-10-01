import { FieldValue } from "firebase-admin/firestore";
import { createManagerOperationalNotification, managerOperationalNotificationTypes } from "./managerOperationalNotifications.js";

export const assignmentAcknowledgmentStates = Object.freeze({
  awaiting: "AWAITING_CONFIRMATION",
  confirmed: "CONFIRMED",
});

function isV2AssignedJob(job) {
  return Number.isInteger(job?.schemaVersion)
    && job.schemaVersion >= 2
    && job.operationalStatus === "ASSIGNED"
    && !job.archivedAt;
}

function isCurrentInterestedOffer(offer, tokenHash, now) {
  if (!offer || offer.publicOfferTokenHash !== tokenHash) return "not-found";
  if (!offer.publicOfferExpiresAt?.toMillis
    || offer.publicOfferExpiresAt.toMillis() <= now.getTime()) return "expired";
  return offer.status === "INTERESTED" ? "available" : "unavailable";
}

function hasCleanerOnAssignedJob(job, cleanerId) {
  return Array.isArray(job?.assignedCleanerIds)
    && job.assignedCleanerIds.includes(cleanerId);
}

function assignmentMatchesOffer(assignment, { organizationId, jobId, cleanerId, offerId }) {
  return assignment?.isActive === true
    && assignment.organizationId === organizationId
    && assignment.jobId === jobId
    && assignment.cleanerId === cleanerId
    && assignment.sourceOfferId === offerId;
}

function currentOfferAssignment(job, offer, assignmentSnapshot, identity) {
  if (!isV2AssignedJob(job) || !offer?.cleanerId
    || !hasCleanerOnAssignedJob(job, offer.cleanerId)) return null;

  const matching = (assignmentSnapshot?.docs || [])
    .map((document) => document.data())
    .filter((assignment) => assignmentMatchesOffer(assignment, {
      ...identity,
      cleanerId: offer.cleanerId,
      offerId: identity.offerId,
    }));

  return matching.length === 1 ? matching[0] : null;
}

/** Manager-side state is shown only when the acknowledgment still belongs to this exact Offer. */
export function assignmentAcknowledgmentState(assignment) {
  const sourceOfferId = assignment?.sourceOfferId;
  if (typeof sourceOfferId !== "string" || !sourceOfferId.trim()) return null;

  const hasTimestamp = Boolean(assignment.cleanerAcknowledgedAt);
  const hasOfferId = typeof assignment.cleanerAcknowledgedOfferId === "string"
    && Boolean(assignment.cleanerAcknowledgedOfferId);

  if (hasTimestamp && hasOfferId) {
    return assignment.cleanerAcknowledgedOfferId === sourceOfferId
      ? assignmentAcknowledgmentStates.confirmed
      : null;
  }
  return !hasTimestamp && !hasOfferId ? assignmentAcknowledgmentStates.awaiting : null;
}

/**
 * Public Offer reads expose only the acknowledgment state for the exact active
 * Assignment created from this Offer. No roster data is returned.
 */
export async function loadPublicOfferAssignmentAcknowledgment(database, {
  organizationId,
  jobId,
  job,
  offerId,
  offer,
  tokenHash,
  now = new Date(),
}) {
  if (isCurrentInterestedOffer(offer, tokenHash, now) !== "available"
    || !isV2AssignedJob(job)
    || !offer.cleanerId
    || !hasCleanerOnAssignedJob(job, offer.cleanerId)) return null;

  const assignments = await database
    .doc(`organizations/${organizationId}/jobs/${jobId}`)
    .collection("assignments")
    .get();
  const assignment = currentOfferAssignment(job, offer, assignments, {
    organizationId,
    jobId,
    offerId,
  });
  return assignment ? assignmentAcknowledgmentState(assignment) : null;
}

/**
 * A bearer Offer token can acknowledge only the active Assignment sourced from
 * that Offer. The transaction writes no Job or Offer lifecycle fields.
 */
export async function acknowledgePublicOfferAssignment(database, {
  organizationId,
  jobReference,
  offerReference,
  tokenHash,
  now = () => new Date(),
}) {
  const expectedJobPath = `organizations/${organizationId}/jobs/${jobReference?.id || ""}`;
  if (jobReference?.path !== expectedJobPath
    || offerReference?.path !== `${expectedJobPath}/offers/${offerReference?.id || ""}`) {
    return { state: "unavailable" };
  }

  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, offerSnapshot, assignmentsSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(offerReference),
      transaction.get(jobReference.collection("assignments")),
    ]);
    if (!jobSnapshot.exists || !offerSnapshot.exists) return { state: "not-found" };

    const job = jobSnapshot.data();
    const offer = offerSnapshot.data();
    const offerState = isCurrentInterestedOffer(offer, tokenHash, typeof now === "function" ? now() : now);
    if (offerState !== "available") return { state: offerState };
    if (!isV2AssignedJob(job) || !offer.cleanerId
      || !hasCleanerOnAssignedJob(job, offer.cleanerId)) return { state: "unavailable" };

    const assignment = currentOfferAssignment(job, offer, assignmentsSnapshot, {
      organizationId,
      jobId: jobReference.id,
      offerId: offerReference.id,
    });
    if (!assignment) return { state: "unavailable" };

    const acknowledgmentState = assignmentAcknowledgmentState(assignment);
    if (acknowledgmentState === assignmentAcknowledgmentStates.confirmed) {
      return { state: "confirmed", repeated: true };
    }
    if (acknowledgmentState !== assignmentAcknowledgmentStates.awaiting) {
      return { state: "unavailable" };
    }

    const assignmentDocument = assignmentsSnapshot.docs.find((document) =>
      assignmentMatchesOffer(document.data(), {
        organizationId,
        jobId: jobReference.id,
        cleanerId: offer.cleanerId,
        offerId: offerReference.id,
      }));
    transaction.update(assignmentDocument.ref, {
      cleanerAcknowledgedAt: FieldValue.serverTimestamp(),
      cleanerAcknowledgedOfferId: offerReference.id,
    });
    createManagerOperationalNotification(transaction, jobReference, {
      organizationId, offerId: offerReference.id, assignmentId: assignmentDocument.id,
      cleanerId: offer.cleanerId, eventType: managerOperationalNotificationTypes.acknowledgment,
      propertyName: job.propertyName,
    });
    return { state: "confirmed", repeated: false };
  });
}

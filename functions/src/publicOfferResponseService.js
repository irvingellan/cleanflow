import { FieldValue } from "firebase-admin/firestore";
import {
  automaticOfferState, checklistContextRevision, FIRST_ACCEPT_WINS, isAutomaticOfferJob, isAutomaticOfferRecord,
} from "./firstAcceptWins.js";
import { buildManagerDirectAssignmentData } from "./managerDirectAssignmentService.js";
import {
  createManagerOperationalNotification, managerOfferNotificationGeneration,
  managerOperationalNotificationCollection, managerOperationalNotificationEventId,
  managerOperationalNotificationTypes,
} from "./managerOperationalNotifications.js";

export function canUsePublicOffer(job) {
  if (job?.archivedAt) return false;
  return Number.isInteger(job?.schemaVersion) && job.schemaVersion >= 2
    ? ["OFFERED", "ASSIGNED"].includes(job.operationalStatus)
    : job?.operationalStatus === "OFFERED";
}

export function publicOfferState(offer, job, now) {
  if (isAutomaticOfferRecord(offer, job)) return automaticOfferState(offer, job, now);
  if (!offer.publicOfferExpiresAt?.toMillis || offer.publicOfferExpiresAt.toMillis() <= now.getTime()) return "expired";
  return canUsePublicOffer(job) && ["PENDING", "INTERESTED", "DECLINED"].includes(offer.status)
    ? "available" : "unavailable";
}

export function respondToPublicOffer(database, options) {
  return respondToOffer(database, options);
}

export function respondToAuthenticatedOffer(database, options, identity, authorizeResponse) {
  return respondToOffer(database, options, { ...identity, authorizeResponse });
}

async function respondToOffer(database, {
  organizationId, jobReference, offerReference, tokenHash, status, now = () => new Date(),
}, identity) {
  const jobPath = `organizations/${organizationId}/jobs/${jobReference?.id || ""}`;
  if (jobReference?.path !== jobPath
    || offerReference?.path !== `${jobPath}/offers/${offerReference?.id || ""}`
    || !(identity ? ["INTERESTED", "DECLINED", "ACCEPTED"] : ["INTERESTED", "DECLINED"]).includes(status)) {
    return { state: "unavailable" };
  }
  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, offerSnapshot] = await Promise.all([
      transaction.get(jobReference), transaction.get(offerReference),
    ]);
    if (!offerSnapshot.exists && identity) return { state: "unavailable" };
    if (!jobSnapshot.exists || !offerSnapshot.exists) return { state: "not-found" };
    const job = jobSnapshot.data();
    const offer = offerSnapshot.data();
    if (identity) {
      if (offer.cleanerId !== identity.cleanerId || offerReference.id !== identity.cleanerId) {
        return { state: "unavailable" };
      }
      await identity.authorizeResponse(transaction);
    } else if (typeof tokenHash !== "string" || offer.publicOfferTokenHash !== tokenHash) {
      return { state: "not-found" };
    }

    if (isAutomaticOfferRecord(offer, job)) {
      if (!isAutomaticOfferJob(job) || !isAutomaticOfferJob(offer) || offer.jobId !== jobReference.id
        || job.organizationId !== organizationId
        || (offer.organizationId != null && offer.organizationId !== organizationId)) {
        return { state: "unavailable" };
      }
      const state = automaticOfferState(offer, job, typeof now === "function" ? now() : now);
      if (!identity) return { state: state === "available" ? "hub-required" : state };
      return respondToAutomaticOffer(transaction, {
        organizationId, jobReference, job, offerReference, offer, status, state, identity,
        now,
      });
    }
    if (status === "ACCEPTED" || (identity && typeof offer.publicOfferTokenHash !== "string")) {
      return { state: "unavailable" };
    }
    const state = publicOfferState(offer, job, typeof now === "function" ? now() : now);
    if (state !== "available") return { state };
    if (offer.status !== "PENDING") return { state: "answered", status: offer.status };
    const notificationContext = {
      organizationId, offerId: offerReference.id, cleanerId: offer.cleanerId,
      eventType: managerOperationalNotificationTypes.interest,
      offerGeneration: managerOfferNotificationGeneration(offer), propertyName: job.propertyName,
    };
    // Normal re-invites reuse the document ID but set a fresh server createdAt.
    // Legacy records without that timestamp keep a conservative single receipt.
    const existingEvent = status === "INTERESTED" ? await transaction.get(
      jobReference.collection(managerOperationalNotificationCollection).doc(managerOperationalNotificationEventId({
        ...notificationContext, jobId: jobReference.id,
      })),
    ) : null;
    transaction.update(offerReference, { status, respondedAt: FieldValue.serverTimestamp() });
    if (status === "INTERESTED" && !existingEvent.exists) {
      createManagerOperationalNotification(transaction, jobReference, notificationContext);
    }
    return { state: "answered", status };
  });
}

async function respondToAutomaticOffer(transaction, {
  organizationId, jobReference, job, offerReference, offer, status, state, identity, now,
}) {
  const assignments = jobReference.collection("assignments");
  const claim = job.firstAcceptClaim;
  if (!job.archivedAt && status === "ACCEPTED" && offer.status === "ACCEPTED"
    && claim?.offerId === offerReference.id && claim.cleanerId === identity.cleanerId
    && Array.isArray(job.assignedCleanerIds) && job.assignedCleanerIds.includes(identity.cleanerId)
    && typeof claim.assignmentId === "string" && claim.assignmentId.length > 0 && !claim.assignmentId.includes("/")) {
    const assignment = (await transaction.get(assignments.doc(claim.assignmentId))).data();
    if (assignment?.isActive === true && assignment.cleanerId === identity.cleanerId
      && assignment.organizationId === organizationId && assignment.jobId === jobReference.id
      && assignment.assignmentMethod === FIRST_ACCEPT_WINS && assignment.sourceOfferId === offerReference.id) {
      return { state: "assigned", status: "ACCEPTED" };
    }
  }

  if (state !== "available") return { state };
  if (status === "INTERESTED") return { state: "unavailable" };
  if (offer.status !== "PENDING") return { state: "answered", status: offer.status };

  const acceptedAt = FieldValue.serverTimestamp();
  if (status === "DECLINED") {
    transaction.update(offerReference, { status, respondedAt: acceptedAt });
    return { state: "answered", status };
  }

  const activeAssignments = await transaction.get(assignments.where("isActive", "==", true));
  if (!activeAssignments.empty) return { state: "already-taken" };
  // A transaction can wait for another writer. Recheck the server clock after
  // its last read so an expired Offer cannot win because of a stale timestamp.
  const currentState = automaticOfferState(offer, job, typeof now === "function" ? now() : now);
  if (currentState !== "available") return { state: currentState };

  const assignment = assignments.doc();
  transaction.create(assignment, {
    ...buildManagerDirectAssignmentData(job, {
      organizationId, jobId: jobReference.id, cleanerId: identity.cleanerId,
      cleanerName: offer.cleanerName || "", actorUid: identity.uid,
    }),
    source: "OFFER",
    sourceOfferId: offerReference.id,
    assignmentMethod: FIRST_ACCEPT_WINS,
    cleanerAcknowledgedAt: acceptedAt,
    cleanerAcknowledgedOfferId: offerReference.id,
  });
  transaction.update(jobReference, {
    assignedCleanerIds: [identity.cleanerId],
    operationalStatus: "ASSIGNED",
    checklistContextRevision: checklistContextRevision(job) + 1,
    offerDistributionClosedAt: acceptedAt,
    firstAcceptClaim: {
      cleanerId: identity.cleanerId, offerId: offerReference.id, assignmentId: assignment.id, acceptedAt,
    },
  });
  transaction.update(offerReference, { status, respondedAt: acceptedAt });
  createManagerOperationalNotification(transaction, jobReference, {
    organizationId, offerId: offerReference.id, assignmentId: assignment.id,
    cleanerId: identity.cleanerId, eventType: managerOperationalNotificationTypes.acknowledgment,
    propertyName: job.propertyName,
  });
  return { state: "assigned", status: "ACCEPTED" };
}

import { FieldValue } from "firebase-admin/firestore";
import {
  automaticOfferBatch, automaticOfferState, checklistContextRevision, FIRST_ACCEPT_WINS, isAutomaticOfferJob,
  isAutomaticOfferRecord, matchesAutomaticOfferBatch, rosterMatchesActiveAssignments, validRosterId,
} from "./firstAcceptWins.js";
import { buildManagerDirectAssignmentData } from "./managerDirectAssignmentService.js";
import { currentManualReplacementOffer, manualReplacementOfferKind } from "./managerManualReplacementOfferService.js";
import { jobScheduleRevision } from "./rescheduleConfirmations.js";
import { manualOfferAvailability } from "./offerSlots.js";
import {
  createAutomaticOfferConfirmationNotices, createManagerOperationalNotification, managerOfferNotificationGeneration,
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
  if (!canUsePublicOffer(job) || !["PENDING", "INTERESTED", "DECLINED"].includes(offer.status)) return "unavailable";
  // FB08: once every spot is filled, other recipients see an unavailable
  // opportunity. A manager decision closes one invitation explicitly.
  const availability = manualOfferAvailability(job, offer);
  if (availability === "closed") return "unavailable";
  if (availability === "filled") return "already-taken";
  return "available";
}

export function respondToPublicOffer(database, options) {
  return respondToOffer(database, options);
}

export function respondToAuthenticatedOffer(database, options, identity, authorizeResponse) {
  return respondToOffer(database, options, { ...identity, authorizeResponse });
}

async function respondToOffer(database, {
  organizationId, jobReference, offerReference, tokenHash, status, scheduleRevision, now = () => new Date(),
}, identity) {
  const jobPath = `organizations/${organizationId}/jobs/${jobReference?.id || ""}`;
  if (jobReference?.path !== jobPath
    || offerReference?.path !== `${jobPath}/offers/${offerReference?.id || ""}`
    || !(identity ? ["INTERESTED", "DECLINED", "ACCEPTED"] : ["INTERESTED", "DECLINED"]).includes(status)) {
    return { state: "unavailable" };
  }
  const organizationReference = database.doc(`organizations/${organizationId}`);
  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, offerSnapshot] = await Promise.all([
      transaction.get(jobReference), transaction.get(offerReference),
    ]);
    if (!offerSnapshot.exists && identity) return { state: "unavailable" };
    if (!jobSnapshot.exists || !offerSnapshot.exists) return { state: "not-found" };
    const job = jobSnapshot.data();
    const offer = offerSnapshot.data();
    const replacement = offer.offerKind === manualReplacementOfferKind;
    if (identity) {
      if (offer.cleanerId !== identity.cleanerId || (!replacement && offerReference.id !== identity.cleanerId)) {
        return { state: "unavailable" };
      }
      await identity.authorizeResponse(transaction);
    } else if (replacement || typeof tokenHash !== "string" || offer.publicOfferTokenHash !== tokenHash) {
      return { state: "not-found" };
    }

    if (replacement) {
      if (!identity || status === "ACCEPTED" || offer.jobId !== jobReference.id
        || !currentManualReplacementOffer(job, offer, offerReference.id, typeof now === "function" ? now() : now)) {
        return { state: "unavailable" };
      }
      if (scheduleRevision !== jobScheduleRevision(job)) return { state: "stale-schedule" };
    } else if (isAutomaticOfferRecord(offer, job)) {
      if (!isAutomaticOfferJob(job) || !isAutomaticOfferJob(offer) || offer.jobId !== jobReference.id
        || job.organizationId !== organizationId
        || (offer.organizationId != null && offer.organizationId !== organizationId)) {
        return { state: "unavailable" };
      }
      const state = automaticOfferState(offer, job, typeof now === "function" ? now() : now);
      if (!identity) return { state: state === "available" ? "hub-required" : state };
      return respondToAutomaticOffer(transaction, {
        organizationId, organizationReference, jobReference, job, offerReference, offer, status, state, identity,
        now, scheduleRevision,
      });
    }
    if (status === "ACCEPTED" || (identity && !replacement && typeof offer.publicOfferTokenHash !== "string")) {
      return { state: "unavailable" };
    }
    const state = replacement ? "available" : publicOfferState(offer, job, typeof now === "function" ? now() : now);
    if (state !== "available") return { state };
    if (identity && !replacement && scheduleRevision !== undefined && scheduleRevision !== jobScheduleRevision(job)) {
      return { state: "stale-schedule" };
    }
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
      createManagerOperationalNotification(transaction, organizationReference, jobReference, notificationContext);
    }
    return { state: "answered", status };
  });
}

async function respondToAutomaticOffer(transaction, {
  organizationId, organizationReference, jobReference, job, offerReference, offer, status, state, identity, now, scheduleRevision,
}) {
  const assignments = jobReference.collection("assignments");
  const claim = job.firstAcceptClaim;
  const batch = automaticOfferBatch(job);
  const isVersioned = Object.hasOwn(job, "automaticOfferBatch") || Object.hasOwn(offer, "automaticOfferBatchVersion");
  if (isVersioned && !matchesAutomaticOfferBatch(offer, batch)) return { state: "unavailable" };
  const claimedAssignmentId = isVersioned ? offer.acceptedAssignmentId
    : claim?.offerId === offerReference.id && claim.cleanerId === identity.cleanerId ? claim.assignmentId : null;
  if (!job.archivedAt && status === "ACCEPTED" && offer.status === "ACCEPTED"
    && Array.isArray(job.assignedCleanerIds) && job.assignedCleanerIds.includes(identity.cleanerId)
    && (isVersioned ? validRosterId(claimedAssignmentId)
      : typeof claimedAssignmentId === "string" && claimedAssignmentId.length > 0 && !claimedAssignmentId.includes("/"))) {
    const assignment = (await transaction.get(assignments.doc(claimedAssignmentId))).data();
    if (assignment?.isActive === true && assignment.cleanerId === identity.cleanerId
      && assignment.organizationId === organizationId && assignment.jobId === jobReference.id
      && assignment.assignmentMethod === FIRST_ACCEPT_WINS && assignment.sourceOfferId === offerReference.id) {
      return { state: "assigned", status: "ACCEPTED" };
    }
  }

  if (state !== "available") return { state };
  const currentScheduleRevision = jobScheduleRevision(job);
  if (isVersioned && (currentScheduleRevision === null
    || (scheduleRevision ?? 0) !== currentScheduleRevision)) return { state: "stale-schedule" };
  if (status === "INTERESTED") return { state: "unavailable" };
  if (offer.status !== "PENDING") return { state: "answered", status: offer.status };

  const acceptedAt = FieldValue.serverTimestamp();
  if (status === "DECLINED") {
    transaction.update(offerReference, { status, respondedAt: acceptedAt });
    return { state: "answered", status };
  }

  const activeQuery = assignments.where("isActive", "==", true);
  const activeAssignments = await transaction.get(isVersioned ? activeQuery.limit(batch.capacity + 1) : activeQuery);
  if (isVersioned) {
    const activeRoster = activeAssignments.docs.map(snapshot => snapshot.data());
    if (!rosterMatchesActiveAssignments(job, activeRoster, organizationId, jobReference.id)
      || activeRoster.some(assignment => assignment.assignmentMethod !== FIRST_ACCEPT_WINS)) {
      return { state: "unavailable" };
    }
  } else if (!activeAssignments.empty) {
    return { state: "already-taken" };
  }
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
  const assignedCleanerIds = [...job.assignedCleanerIds, identity.cleanerId];
  const checklistRevision = checklistContextRevision(job) + 1;
  const filled = !isVersioned || assignedCleanerIds.length === batch.capacity;
  const firstAcceptClaim = {
    cleanerId: identity.cleanerId, offerId: offerReference.id, assignmentId: assignment.id, acceptedAt,
  };
  transaction.update(jobReference, {
    assignedCleanerIds,
    operationalStatus: "ASSIGNED",
    checklistContextRevision: checklistRevision,
    ...(filled ? { offerDistributionClosedAt: acceptedAt } : {}),
    ...((!isVersioned || batch.capacity === 1) ? { firstAcceptClaim } : {}),
    ...(isVersioned ? {
      automaticOfferBatch: { ...batch, currentContextRevision: checklistRevision },
      lastAutomaticOfferAcceptance: { cleanerId: identity.cleanerId, assignmentId: assignment.id },
    } : {}),
  });
  transaction.update(offerReference, {
    status, respondedAt: acceptedAt, ...(isVersioned ? { acceptedAssignmentId: assignment.id } : {}),
  });
  const notice = {
    organizationId, automatic: true, offerId: offerReference.id, assignmentId: assignment.id,
    cleanerId: identity.cleanerId, eventType: managerOperationalNotificationTypes.acknowledgment,
    propertyName: job.propertyName,
  };
  if (isVersioned) {
    createAutomaticOfferConfirmationNotices(transaction, organizationReference, jobReference, {
      ...notice, batchId: String(batch.openingContextRevision), filled,
      cleanerName: offer.cleanerName, scheduledDate: job.scheduledDate, scheduledStart: job.scheduledStart,
    });
  } else {
    createManagerOperationalNotification(transaction, organizationReference, jobReference, notice);
  }
  return { state: "assigned", status: "ACCEPTED" };
}

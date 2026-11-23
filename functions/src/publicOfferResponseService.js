import { clearApprovedAssignmentBilling } from "./approvedAssignmentBilling.js";
import { FieldValue } from "firebase-admin/firestore";
import { hasMission2JobState, requireMission2Writes } from "./mission2WriteControl.js";
import {
  assignmentAllowsAutomaticAcceptance, automaticOfferBatch, automaticOfferState, checklistContextRevision, FIRST_ACCEPT_WINS, isAutomaticOfferJob,
  isAutomaticOfferRecord, matchesAutomaticOfferBatch, rosterMatchesActiveAssignments, validRosterId,
} from "./firstAcceptWins.js";
import { buildManagerDirectAssignmentData } from "./managerDirectAssignmentService.js";
import { currentManualReplacementOffer, manualReplacementOfferKind } from "./managerManualReplacementOfferService.js";
import { jobScheduleRevision } from "./rescheduleConfirmations.js";
import { canonicalManualRecipient, loadManualConfirmation } from "./manualOfferConfirmation.js";
import { manualOfferAvailability, requiredCleanerCount } from "./offerSlots.js";
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
  if (offer.archivedAt) return "unavailable";
  if (isAutomaticOfferRecord(offer, job)) return automaticOfferState(offer, job, now);
  if (!Number.isFinite(offer.publicOfferExpiresAt?.toMillis?.()) || offer.publicOfferExpiresAt.toMillis() <= now.getTime()) return "expired";
  if (offer.revokedAt || !canUsePublicOffer(job) || !["PENDING", "INTERESTED", "DECLINED"].includes(offer.status)) return "unavailable";
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
    || !["INTERESTED", "DECLINED", "ACCEPTED"].includes(status)) {
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

    if (offer.archivedAt || (job.organizationId != null && job.organizationId !== organizationId)
      || (offer.organizationId != null && offer.organizationId !== organizationId)
      || (offer.jobId != null && offer.jobId !== jobReference.id)) return { state: "unavailable" };
    const clock = () => typeof now === "function" ? now() : now;
    if (!identity && (status === "ACCEPTED" || (status === "DECLINED" && isAutomaticOfferRecord(offer, job)))) {
      if (!validRosterId(offer.cleanerId) || offerReference.id !== offer.cleanerId) return { state: "unavailable" };
      const profile = (await transaction.get(organizationReference.collection("cleaners").doc(offer.cleanerId))).data();
      if (profile?.active !== true || profile.archivedAt || (profile.organizationId != null && profile.organizationId !== organizationId)) {
        return { state: "unavailable" };
      }
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
      if (!identity && status === "INTERESTED") return { state: state === "available" ? "hub-required" : state };
      return respondToAutomaticOffer(transaction, {
        organizationId, organizationReference, jobReference, job, offerReference, offer, status, state, identity,
        now, scheduleRevision, database,
      });
    }
    if (!replacement && status === "ACCEPTED") {
      if (!canonicalManualRecipient(offer, offerReference.id, jobReference.id, organizationId)
        || !(await loadManualConfirmation(jobReference, job, offer, query => transaction.get(query)))) return { state: "unavailable" };
      if (!job.archivedAt && !offer.revokedAt && offer.publicOfferExpiresAt?.toMillis?.() > clock().getTime()
        && await hasConfirmedAssignment(transaction, jobReference, job, offerReference.id, offer, organizationId)) {
        return { state: "assigned", status };
      }
      const currentState = () => publicOfferState(offer, job, clock());
      const state = currentState();
      if (state !== "available") return { state };
      if (!["PENDING", "INTERESTED"].includes(offer.status) || manualOfferAvailability(job, offer) !== "open"
        || (job.assignedCleanerId != null && job.assignedCleanerId !== "") || job.offerDistributionClosedAt) {
        return { state: "unavailable" };
      }
      const currentSchedule = jobScheduleRevision(job);
      if (currentSchedule == null || (scheduleRevision ?? 0) !== currentSchedule) return { state: "stale-schedule" };
      const revision = checklistContextRevision(job);
      if (revision === null || revision >= Number.MAX_SAFE_INTEGER) return { state: "unavailable" };
      if (hasMission2JobState(job)) await requireMission2Writes(transaction, database);
      const capacity = requiredCleanerCount(job);
      const active = await transaction.get(jobReference.collection("assignments").where("isActive", "==", true).limit(capacity + 1));
      if (!rosterMatchesActiveAssignments(job, active.docs.map(doc => doc.data()), organizationId, jobReference.id)) {
        return { state: "unavailable" };
      }
      const finalState = currentState();
      if (finalState !== "available") return { state: finalState };
      const { assignment, notice, acceptedAt } = createConfirmedAssignment(transaction, { organizationId, jobReference, job, offerReference, offer, identity });
      transaction.update(jobReference, { ...clearApprovedAssignmentBilling(job), assignedCleanerIds: [...job.assignedCleanerIds, offer.cleanerId],
        operationalStatus: "ASSIGNED", checklistContextRevision: revision + 1 });
      transaction.update(offerReference, { status, respondedAt: acceptedAt, acceptedAssignmentId: assignment.id });
      createManagerOperationalNotification(transaction, organizationReference, jobReference, notice);
      return { state: "assigned", status };
    }
    // A cleaner can always say no to her own open invitation from the Hub,
    // even after its public link expired or before one was issued. Saying no
    // claims nothing, so it needs no spot, link or schedule check.
    if (identity && !replacement && status === "DECLINED" && offer.status === "PENDING"
      && !job.archivedAt && !offer.revokedAt) {
      transaction.update(offerReference, { status, respondedAt: FieldValue.serverTimestamp() });
      return { state: "answered", status };
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
    if (replacement) await requireMission2Writes(transaction, database);
    transaction.update(offerReference, { status, respondedAt: FieldValue.serverTimestamp() });
    if (status === "INTERESTED" && !existingEvent.exists) {
      createManagerOperationalNotification(transaction, organizationReference, jobReference, notificationContext);
    }
    return { state: "answered", status };
  });
}

export async function hasConfirmedAssignment(reader, jobRef, job, offerId, offer, organizationId) {
  if (offer.status !== "ACCEPTED" || !Array.isArray(job.assignedCleanerIds) || !job.assignedCleanerIds.includes(offer.cleanerId)) return false;
  const claim = job.firstAcceptClaim;
  const assignmentId = offer.acceptedAssignmentId
    ?? (claim?.offerId === offerId && claim.cleanerId === offer.cleanerId ? claim.assignmentId : null);
  if (!validRosterId(assignmentId)) return false;
  const assignment = (await reader.get(jobRef.collection("assignments").doc(assignmentId))).data();
  return assignment?.isActive === true && assignment.cleanerId === offer.cleanerId && assignment.organizationId === organizationId
    && assignment.jobId === jobRef.id && assignment.sourceOfferId === offerId && assignment.assignmentMethod === FIRST_ACCEPT_WINS;
}

function createConfirmedAssignment(transaction, { organizationId, jobReference, job, offerReference, offer, identity }) {
  const assignment = jobReference.collection("assignments").doc();
  const acceptedAt = FieldValue.serverTimestamp();
  const confirmationChannel = identity ? "CLEANER_HUB" : "WHATSAPP_LINK";
  transaction.create(assignment, {
    ...buildManagerDirectAssignmentData(job, { organizationId, jobId: jobReference.id, cleanerId: offer.cleanerId,
      cleanerName: offer.cleanerName || "", actorUid: identity?.uid ?? null }),
    source: "OFFER", sourceOfferId: offerReference.id, assignmentMethod: FIRST_ACCEPT_WINS, confirmationChannel,
    cleanerAcknowledgedAt: acceptedAt, cleanerAcknowledgedOfferId: offerReference.id,
  });
  return { assignment, acceptedAt, notice: { organizationId, offerId: offerReference.id, assignmentId: assignment.id,
    cleanerId: offer.cleanerId, cleanerName: offer.cleanerName || "", propertyName: job.propertyName, confirmationChannel,
    eventType: managerOperationalNotificationTypes.acknowledgment } };
}

async function respondToAutomaticOffer(transaction, {
  organizationId, organizationReference, jobReference, job, offerReference, offer, status, state, identity, now, scheduleRevision, database,
}) {
  const assignments = jobReference.collection("assignments");
  const batch = automaticOfferBatch(job);
  const isVersioned = Object.hasOwn(job, "automaticOfferBatch") || Object.hasOwn(offer, "automaticOfferBatchVersion");
  if (isVersioned && !matchesAutomaticOfferBatch(offer, batch)) return { state: "unavailable" };
  if (!job.archivedAt && !offer.revokedAt && status === "ACCEPTED"
    && (identity || offer.publicOfferExpiresAt?.toMillis?.() > (typeof now === "function" ? now() : now).getTime())
    && await hasConfirmedAssignment(transaction, jobReference, job, offerReference.id, offer, organizationId)) {
    return { state: "assigned", status: "ACCEPTED" };
  }

  if (state !== "available") return { state };
  const currentScheduleRevision = jobScheduleRevision(job);
  if (isVersioned && (currentScheduleRevision === null
    || (scheduleRevision ?? 0) !== currentScheduleRevision)) return { state: "stale-schedule" };
  if (status === "INTERESTED") return { state: "unavailable" };
  if (offer.status !== "PENDING") return { state: "answered", status: offer.status };

  if (isVersioned) await requireMission2Writes(transaction, database);
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
      || activeRoster.some(assignment => !assignmentAllowsAutomaticAcceptance(assignment, batch))) {
      return { state: "unavailable" };
    }
  } else if (!activeAssignments.empty) {
    return { state: "already-taken" };
  }
  // A transaction can wait for another writer. Recheck the server clock after
  // its last read so an expired Offer cannot win because of a stale timestamp.
  const currentState = automaticOfferState(offer, job, typeof now === "function" ? now() : now);
  if (currentState !== "available") return { state: currentState };

  const { assignment, notice } = createConfirmedAssignment(transaction, { organizationId, jobReference, job, offerReference, offer, identity });
  const assignedCleanerIds = [...job.assignedCleanerIds, offer.cleanerId];
  const checklistRevision = checklistContextRevision(job) + 1;
  const filled = !isVersioned || assignedCleanerIds.length === batch.capacity;
  const firstAcceptClaim = {
    cleanerId: offer.cleanerId, offerId: offerReference.id, assignmentId: assignment.id, acceptedAt,
  };
  transaction.update(jobReference, {
    ...clearApprovedAssignmentBilling(job),
    assignedCleanerIds,
    operationalStatus: "ASSIGNED",
    checklistContextRevision: checklistRevision,
    ...(filled ? { offerDistributionClosedAt: acceptedAt } : {}),
    ...((!isVersioned || batch.capacity === 1) ? { firstAcceptClaim } : {}),
    ...(isVersioned ? {
      automaticOfferBatch: { ...batch, currentContextRevision: checklistRevision },
      lastAutomaticOfferAcceptance: { cleanerId: offer.cleanerId, assignmentId: assignment.id },
    } : {}),
  });
  transaction.update(offerReference, {
    status, respondedAt: acceptedAt, ...(isVersioned ? { acceptedAssignmentId: assignment.id } : {}),
  });
  if (isVersioned) {
    createAutomaticOfferConfirmationNotices(transaction, organizationReference, jobReference, {
      ...notice, batchId: String(batch.reopenedAtContextRevision ?? batch.openingContextRevision), filled,
      cleanerName: offer.cleanerName, scheduledDate: job.scheduledDate, scheduledStart: job.scheduledStart,
    });
  } else {
    createManagerOperationalNotification(transaction, organizationReference, jobReference, { ...notice, automatic: true });
  }
  return { state: "assigned", status: "ACCEPTED" };
}

import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { pilotChecklistPhotoRequirementId } from "./checklistEvidenceDefinition.js";
import { assertSessionForMutation } from "./cleanerHubAccess.js";
import {
  automaticOfferBatch, automaticOfferState, checklistContextRevision, FIRST_ACCEPT_WINS, isAutomaticOfferJob, validRosterId,
} from "./firstAcceptWins.js";
import { createRescheduleDeclineNotice } from "./managerOperationalNotifications.js";
import {
  cleanerInbox, cleanerInboxTypes, inboxEventVersion, isInboxId,
} from "./notificationInboxEvents.js";
import { manualOfferAvailability } from "./offerSlots.js";
import { currentScheduleConfirmation, jobScheduleRevision, readScheduleRoster } from "./rescheduleConfirmations.js";

const decisions = new Set(["CONFIRMED", "DECLINED"]);
const maxOfferReads = 51;

function staleSchedule() {
  return new HttpsError("failed-precondition", "This schedule is no longer available to answer.", { reason: "stale-schedule" });
}

function assertNoChecklistWork(run, draft, evidence, legacyPhoto) {
  if ((run.exists && run.data().status !== "DRAFT")
    || (draft.data()?.revision ?? 0) > 0 || (evidence.data()?.revision ?? 0) > 0
    || evidence.data()?.photos?.length > 0 || legacyPhoto.exists) {
    throw new HttpsError("failed-precondition", "Checklist work has already started.", { reason: "work-started" });
  }
}

async function declinePatch(transaction, { jobRef, job, organizationId, cleanerId, roster, now }) {
  const versionedRoster = job.schemaVersion === 2;
  const batch = isAutomaticOfferJob(job) ? automaticOfferBatch(job) : null;
  const contextRevision = checklistContextRevision(job);
  if (contextRevision === null || contextRevision >= Number.MAX_SAFE_INTEGER) throw staleSchedule();
  const remaining = roster.filter(([id]) => id !== cleanerId).map(([id]) => id);
  const automatic = isAutomaticOfferJob(job);
  const keepOpenCandidate = batch && !job.offerDistributionClosedAt && !job.firstAcceptClaim
    && roster.every(([, assignment]) => assignment.assignmentMethod === FIRST_ACCEPT_WINS)
    && batch.currentContextRevision === contextRevision;
  const needsOfferRead = keepOpenCandidate || (!automatic && remaining.length === 0);
  const currentOffers = needsOfferRead ? (await transaction.get(jobRef.collection("offers")
    .where("status", "in", ["PENDING", "INTERESTED"]).limit(maxOfferReads))).docs : [];
  const nextContextRevision = contextRevision + 1;
  const tentative = {
    ...job, assignedCleanerIds: remaining, operationalStatus: remaining.length ? "ASSIGNED" : "OFFERED",
    checklistContextRevision: nextContextRevision,
    ...(keepOpenCandidate ? { automaticOfferBatch: { ...batch, currentContextRevision: nextContextRevision } } : {}),
  };
  if (keepOpenCandidate && currentOffers.length >= maxOfferReads) {
    throw new HttpsError("failed-precondition", "The roster needs manager review.", { reason: "invalid-roster" });
  }
  const hasAuto = keepOpenCandidate && currentOffers.some((snapshot) => {
    const offer = snapshot.data();
    return snapshot.id === offer.cleanerId && offer.jobId === jobRef.id && offer.organizationId === organizationId
      && offer.status === "PENDING" && validRosterId(offer.cleanerId) && automaticOfferState(offer, tentative, now) === "available";
  });
  const hasManual = !automatic && currentOffers.some((snapshot) => {
    const offer = snapshot.data();
    return !isAutomaticOfferJob(offer) && !offer.revokedAt && validRosterId(offer.cleanerId)
      && (offer.jobId == null || offer.jobId === jobRef.id)
      && (offer.organizationId == null || offer.organizationId === organizationId)
      && typeof offer.publicOfferTokenHash === "string" && offer.publicOfferExpiresAt?.toMillis?.() > now.getTime()
      && manualOfferAvailability({ ...tentative, assignedCleanerId: null }, offer) === "open";
  });
  return {
    operationalStatus: remaining.length ? "ASSIGNED" : hasAuto || hasManual ? "OFFERED" : "UNASSIGNED",
    checklistContextRevision: nextContextRevision,
    ...(versionedRoster ? { assignedCleanerIds: remaining } : {
      assignedCleanerId: FieldValue.delete(), assignedCleanerName: FieldValue.delete(),
      ...(Array.isArray(job.assignedCleanerIds) ? { assignedCleanerIds: [] } : {}),
    }),
    ...(hasAuto ? { automaticOfferBatch: tentative.automaticOfferBatch } : {}),
    ...(automatic && !job.offerDistributionClosedAt && !hasAuto ? { offerDistributionClosedAt: FieldValue.serverTimestamp() } : {}),
  };
}

export function respondToRescheduleForCleaner(database, {
  organizationId, cleanerId, uid, sessionId, eventId, scheduleRevision, decision, now = () => new Date(),
}) {
  if (![organizationId, cleanerId, uid].every(validRosterId) || !isInboxId(eventId)
    || !Number.isSafeInteger(scheduleRevision) || scheduleRevision < 1 || !decisions.has(decision)) {
    throw new HttpsError("invalid-argument", "Schedule response is invalid.");
  }
  const organization = database.collection("organizations").doc(organizationId);
  const eventRef = cleanerInbox(organization, cleanerId).doc(eventId);
  return database.runTransaction(async (transaction) => {
    const [, eventSnapshot] = await Promise.all([
      assertSessionForMutation(transaction, database, { organizationId, cleanerId, uid, sessionId }),
      transaction.get(eventRef),
    ]);
    const event = eventSnapshot.data();
    if (event?.eventId !== eventId || event.organizationId !== organizationId || event.cleanerId !== cleanerId
      || event.type !== cleanerInboxTypes.rescheduled || event.eventVersion !== inboxEventVersion
      || event.processingState !== "STORED" || !validRosterId(event.jobId)) {
      throw new HttpsError("permission-denied", "This Inbox item is unavailable.");
    }
    if (event.scheduleRevision !== scheduleRevision) throw staleSchedule();

    const jobRef = organization.collection("jobs").doc(event.jobId);
    const historyRef = jobRef.collection("scheduleHistory").doc(String(scheduleRevision));
    const receiptRef = historyRef.collection("responses").doc(cleanerId);
    const [jobSnapshot, historySnapshot, receiptSnapshot] = await Promise.all([
      transaction.get(jobRef), transaction.get(historyRef), transaction.get(receiptRef),
    ]);
    const job = jobSnapshot.data();
    const history = historySnapshot.data();
    const entry = currentScheduleConfirmation(job, cleanerId, scheduleRevision);
    if (!entry || job.archivedAt || (job.organizationId != null && job.organizationId !== organizationId)
      || history?.scheduleRevision !== scheduleRevision || history.newScheduledDate !== job.scheduledDate
      || history.newScheduledStart !== (job.scheduledStart || null)) throw staleSchedule();

    if (entry.state !== "PENDING") {
      const receipt = receiptSnapshot.data();
      if (receipt?.cleanerId === cleanerId && receipt.assignmentId === entry.assignmentId
        && receipt.scheduleRevision === scheduleRevision && receipt.state === entry.state) {
        return { state: receipt.state, scheduleRevision };
      }
      throw staleSchedule();
    }
    if (receiptSnapshot.exists || job.operationalStatus !== "ASSIGNED" || job.startedAt != null) throw staleSchedule();
    const roster = await readScheduleRoster(transaction, jobRef, job, organizationId);
    const assignment = roster?.find(([id]) => id === cleanerId)?.[1];
    if (!assignment || entry.assignmentId !== assignment.assignmentId) throw staleSchedule();

    let removal = null;
    if (decision === "DECLINED") {
      const runRef = jobRef.collection("checklistRuns").doc("initial");
      const refs = [
        runRef, runRef.collection("drafts").doc("current"),
        runRef.collection("evidenceState").doc("current"), runRef.collection("evidence").doc(pilotChecklistPhotoRequirementId),
      ];
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
      assertNoChecklistWork(...snapshots);
      removal = await declinePatch(transaction, {
        jobRef, job, organizationId, cleanerId, roster, now: now(),
      });
    }

    const respondedAt = FieldValue.serverTimestamp();
    transaction.create(receiptRef, {
      organizationId, jobId: jobRef.id, cleanerId, actorUid: uid, assignmentId: entry.assignmentId,
      state: decision, scheduleRevision, respondedAt,
    });
    transaction.update(jobRef, {
      scheduleConfirmation: {
        revision: scheduleRevision,
        byCleaner: { ...job.scheduleConfirmation.byCleaner, [cleanerId]: { ...entry, state: decision } },
      },
      ...removal,
    });
    if (removal) {
      if (entry.assignmentId) {
        transaction.update(jobRef.collection("assignments").doc(entry.assignmentId), {
          isActive: false, removedAt: respondedAt, removedByUid: uid,
          removalReason: "RESCHEDULE_DECLINED", removalScheduleRevision: scheduleRevision,
        });
      }
      createRescheduleDeclineNotice(transaction, organization, jobRef, {
        organizationId, cleanerId, assignmentId: entry.assignmentId, scheduleRevision,
        cleanerName: assignment.cleanerNameSnapshot ?? job.assignedCleanerName,
        propertyName: job.propertyName, scheduledDate: job.scheduledDate, scheduledStart: job.scheduledStart,
      });
    }
    return { state: decision, scheduleRevision };
  });
}

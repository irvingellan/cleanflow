import { rosterCleanerIds } from "./cleanerAgenda.js";
import { automaticOfferBatch, isAutomaticOfferJob } from "./firstAcceptWins.js";
import {
  cleanerInbox, cleanerInboxTypes as types, inboxEventId, inboxEventRecord,
  offerInboxGeneration, validInboxSegment,
} from "./notificationInboxEvents.js";
import { publicOfferState } from "./publicOfferResponseService.js";
import { currentManualReplacementOffer } from "./managerManualReplacementOfferService.js";

const assignmentStates = new Set(["ASSIGNED", "IN_PROGRESS", "COMPLETED"]);

export function notificationRoster(job) {
  return assignmentStates.has(job?.operationalStatus)
    ? rosterCleanerIds(job).filter(validInboxSegment)
    : [];
}

export function notificationRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function planCleanerJobInboxEvents(before, after) {
  const previous = new Set(notificationRoster(before));
  const next = new Set(notificationRoster(after));
  const changes = [];
  for (const cleanerId of previous) {
    if (!next.has(cleanerId)) {
      if (before.operationalStatus === "COMPLETED") continue;
      changes.push({ cleanerId, type: after && !after.archivedAt ? types.unassigned : types.cancelled });
    } else if (after.operationalStatus !== "COMPLETED"
      && (before.scheduledDate !== after.scheduledDate || (before.scheduledStart || null) !== (after.scheduledStart || null))) {
      changes.push({ cleanerId, type: types.rescheduled });
    }
  }
  for (const cleanerId of next) {
    if (previous.has(cleanerId) || after.operationalStatus !== "ASSIGNED") continue;
    const batch = automaticOfferBatch(after);
    const claim = batch ? after.lastAutomaticOfferAcceptance : after.firstAcceptClaim;
    const previousClaim = batch ? before?.lastAutomaticOfferAcceptance : before?.firstAcceptClaim;
    const automatic = isAutomaticOfferJob(after) && claim?.cleanerId === cleanerId
      && validInboxSegment(claim.assignmentId) && claim.assignmentId !== previousClaim?.assignmentId;
    changes.push({
      cleanerId, type: automatic ? types.automatic : types.assigned,
      ...(automatic && batch ? { automaticAssignmentId: claim.assignmentId } : {}),
    });
  }
  return changes;
}

async function storeCleanerEvents(database, organization, records) {
  if (records.length === 0) return 0;
  // Manager-entered rosters are small in practice. Bounded chunks also keep
  // duplicate/replayed source transitions safe under the transaction write limit.
  let created = 0;
  for (let offset = 0; offset < records.length; offset += 100) {
    const chunk = records.slice(offset, offset + 100);
    created += await database.runTransaction(async (transaction) => {
      const references = chunk.map((record) => cleanerInbox(organization, record.cleanerId).doc(record.eventId));
      const existing = await transaction.getAll(...references);
      let written = 0;
      for (let index = 0; index < chunk.length; index += 1) {
        if (existing[index].exists) continue;
        transaction.create(references[index], inboxEventRecord(chunk[index]));
        written += 1;
      }
      return written;
    });
  }
  return created;
}

/** The committed source write, not the order of trigger deliveries, defines the event. */
export function recordCleanerJobInboxEvents(database, { organizationId, jobId, before, after, eventId }) {
  if (![organizationId, jobId].every(validInboxSegment) || typeof eventId !== "string" || !eventId) return 0;
  const previous = before?.data();
  const current = after?.data();
  const organization = database.collection("organizations").doc(organizationId);
  const records = planCleanerJobInboxEvents(previous, current).map(({ cleanerId, type, automaticAssignmentId }) => ({
    organizationId,
    jobId,
    cleanerId,
    type,
    eventId: inboxEventId("cleaner-job", organizationId, jobId, cleanerId, type, eventId),
    transitionKey: inboxEventId(eventId),
    contextRevision: notificationRevision(current?.checklistContextRevision),
    scheduleRevision: notificationRevision(current?.scheduleRevision),
    ...(automaticAssignmentId ? { automaticAssignmentId } : {}),
    createdAt: after?.updateTime || before?.readTime,
  }));
  return storeCleanerEvents(database, organization, records);
}

function issuedPendingOffer(offer, replacement) {
  return offer?.status === "PENDING" && !offer.revokedAt
    && (replacement || isAutomaticOfferJob(offer) || typeof offer.publicOfferTokenHash === "string")
    && typeof offer.publicOfferExpiresAt?.toMillis === "function";
}

/** Offers acquire a logical generation when issued, not when a bearer link rotates. */
export async function recordCleanerOfferInboxEvent(database, { organizationId, jobId, offerId, before, after }) {
  if (![organizationId, jobId, offerId].every(validInboxSegment)) return 0;
  const offer = after?.data();
  const replacement = offer?.offerKind === "MANUAL_REPLACEMENT";
  if (!issuedPendingOffer(offer, replacement) || !validInboxSegment(offer.cleanerId)
    || (!replacement && offer.cleanerId !== offerId)
    || (offer.organizationId != null && offer.organizationId !== organizationId)
    || (offer.jobId != null && offer.jobId !== jobId)) return 0;
  const previous = before?.data();
  const generation = offerInboxGeneration(offer);
  if (issuedPendingOffer(previous, replacement) && previous.cleanerId === offer.cleanerId
    && offerInboxGeneration(previous) === generation) return 0;

  const issuedAt = after.updateTime?.toDate() || new Date();
  const expiresAt = offer.publicOfferExpiresAt.toMillis();
  if (!Number.isFinite(expiresAt) || expiresAt <= issuedAt.getTime()) return 0;

  const organization = database.collection("organizations").doc(organizationId);
  const jobRef = organization.collection("jobs").doc(jobId);
  const cleanerRef = organization.collection("cleaners").doc(offer.cleanerId);
  const record = {
    organizationId, jobId, offerId, cleanerId: offer.cleanerId, type: types.offer,
    offerGeneration: generation,
    eventId: inboxEventId("cleaner-offer", organizationId, jobId, offerId, offer.cleanerId, generation),
    transitionKey: generation,
    createdAt: after.updateTime,
  };
  const eventRef = cleanerInbox(organization, record.cleanerId).doc(record.eventId);
  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, cleanerSnapshot, existing] = await transaction.getAll(jobRef, cleanerRef, eventRef);
    const job = jobSnapshot.data();
    const cleaner = cleanerSnapshot.data();
    if (existing.exists || !job || (job.organizationId != null && job.organizationId !== organizationId)
      || (replacement ? !currentManualReplacementOffer(job, offer, offerId, issuedAt)
        : isAutomaticOfferJob(job) !== isAutomaticOfferJob(offer))
      || cleaner?.active !== true || cleaner.archivedAt
      || (cleaner.organizationId != null && cleaner.organizationId !== organizationId)) return 0;
    // Old deliveries remain useful in the inbox when the offer is closed by a
    // later assignment or archive. A trigger must still prove it was issued.
    const currentState = replacement ? "available" : publicOfferState(offer, job, issuedAt);
    if (currentState !== "available" && !["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus)
      && !job.archivedAt && !job.offerDistributionClosedAt) return 0;
    transaction.create(eventRef, inboxEventRecord(record));
    return 1;
  });
}

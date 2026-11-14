import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { assertSessionForMutation } from "./cleanerHubAccess.js";
import { notificationRevision, notificationRoster } from "./cleanerNotificationEvents.js";
import { FIRST_ACCEPT_WINS, isAutomaticOfferJob } from "./firstAcceptWins.js";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import {
  automaticOfferNotice, cleanerInbox, cleanerInboxTypes as cleanerTypes, inboxEventVersion, inboxReceipt, isInboxId,
  managerInboxCollection, managerInboxTypes as managerTypes, offerInboxGeneration, validInboxSegment,
} from "./notificationInboxEvents.js";
import { publicOfferState } from "./publicOfferResponseService.js";
import { currentScheduleConfirmation } from "./rescheduleConfirmations.js";
import { currentManualReplacementOffer } from "./managerManualReplacementOfferService.js";

const inboxWindow = 100;
const managerRole = "MANAGER";
const cleanerRole = "CLEANER";
const cleanerEventTypes = new Set(Object.values(cleanerTypes));
const managerEventTypes = new Set(Object.values(managerTypes));

function requestIdentity(request, organizationId) {
  const { auth } = request;
  if (!validInboxSegment(auth?.uid) || auth.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "A signed-in account is required.");
  }
  const role = request.data?.role;
  if (role === managerRole) return { role, organizationId, uid: auth.uid };
  if (role !== cleanerRole) throw new HttpsError("invalid-argument", "Inbox role is invalid.");

  const claims = auth.token?.cleanerHub;
  if (claims?.organizationId !== organizationId || !validInboxSegment(claims.cleanerId) || !claims.sessionId) {
    throw new HttpsError("permission-denied", "Active cleaner access is required.");
  }
  return { role, organizationId, uid: auth.uid, cleanerId: claims.cleanerId, sessionId: claims.sessionId };
}

async function assertInboxAccess(transaction, database, organization, identity) {
  if (identity.role === cleanerRole) {
    await assertSessionForMutation(transaction, database, identity);
    return;
  }
  const member = (await transaction.get(organization.collection("members").doc(identity.uid))).data();
  if (!isActiveManagerMembership(member) || (member.organizationId != null && member.organizationId !== organization.id)) {
    throw new HttpsError("permission-denied", "Active organization manager access is required.");
  }
}

function inboxCollection(organization, identity) {
  return identity.role === managerRole
    ? organization.collection(managerInboxCollection)
    : cleanerInbox(organization, identity.cleanerId);
}

function validInboxEvent(event, id, identity) {
  const cleaner = identity.role === cleanerRole;
  return event?.eventId === id && isInboxId(id) && event.organizationId === identity.organizationId
    && event.eventVersion === inboxEventVersion && event.processingState === "STORED"
    && (cleaner ? cleanerEventTypes.has(event.type) && event.cleanerId === identity.cleanerId
      : managerEventTypes.has(event.type));
}

function safeServiceLabel(job) {
  return typeof job?.propertyName === "string"
    ? job.propertyName.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) || null
    : null;
}

function targetJobReference(organization, event, forPush) {
  if (!validInboxSegment(event.jobId) || event.type === managerTypes.today || event.type === managerTypes.tomorrow) return null;
  if (!forPush && (event.type === cleanerTypes.cancelled || event.type === cleanerTypes.unassigned)) return null;
  if (event.type === cleanerTypes.offer && !validInboxSegment(event.offerId)) return null;
  return organization.collection("jobs").doc(event.jobId);
}

function targetOfferReference(jobRef, job, event, organizationId) {
  return event.type === cleanerTypes.offer && jobRef && job && !job.archivedAt
    && (job.organizationId == null || job.organizationId === organizationId)
    ? jobRef.collection("offers").doc(event.offerId) : null;
}

function projectAuthorizedTarget(organization, event, identity, job, offer, { forPush = false, now = new Date() } = {}) {
  // A pilot test names no Job. It may reach an approved device and then stays
  // in the cleaner's Inbox as a read-only record.
  if (event.type === cleanerTypes.pilotTest) {
    return forPush && identity.role === cleanerRole ? { destination: { kind: "INBOX" }, serviceLabel: null } : null;
  }
  if (event.type === managerTypes.today || event.type === managerTypes.tomorrow) {
    return { destination: { kind: "DASHBOARD" }, serviceLabel: null };
  }
  if (job?.organizationId != null && job.organizationId !== organization.id) return null;
  const rosterIncludesCleaner = notificationRoster(job).includes(identity.cleanerId);

  if (event.type === cleanerTypes.cancelled || event.type === cleanerTypes.unassigned) {
    if (!forPush || rosterIncludesCleaner
      || (job && notificationRevision(job.checklistContextRevision) !== event.contextRevision)) return null;
    const cancelled = !job || Boolean(job.archivedAt);
    if (cancelled !== (event.type === cleanerTypes.cancelled)) return null;
    return { destination: { kind: "INBOX" }, serviceLabel: null };
  }
  if (!job || job.archivedAt) return null;
  if (identity.role === managerRole) {
    return { destination: { kind: "JOB", jobId: event.jobId }, serviceLabel: safeServiceLabel(job) };
  }
  if (event.type === cleanerTypes.offer) {
    const replacement = currentManualReplacementOffer(job, offer, event.offerId, now);
    const visibleStatuses = forPush ? ["PENDING"] : ["PENDING", "INTERESTED"];
    if (!offer || offer.cleanerId !== identity.cleanerId || !visibleStatuses.includes(offer.status)
      || (offer.organizationId != null && offer.organizationId !== organization.id)
      || (offer.jobId != null && offer.jobId !== event.jobId)
      || offerInboxGeneration(offer) !== event.offerGeneration
      || (!replacement && ((!isAutomaticOfferJob(offer) && typeof offer.publicOfferTokenHash !== "string")
        || publicOfferState(offer, job, now) !== "available"))) return null;
    return { destination: { kind: "OFFER", jobId: event.jobId }, serviceLabel: safeServiceLabel(job) };
  }
  if (!rosterIncludesCleaner) return null;
  if (forPush && (job.operationalStatus === "COMPLETED" || !currentCleanerPushEvent(job, event))) return null;
  return { destination: { kind: "JOB", jobId: event.jobId }, serviceLabel: safeServiceLabel(job) };
}

function currentCleanerPushEvent(job, event) {
  if (event.type === cleanerTypes.rescheduled) return notificationRevision(job.scheduleRevision) === event.scheduleRevision;
  // Later winners advance the checklist context revision but do not invalidate a
  // teammate's still-active acceptance on the same schedule.
  if (event.type === cleanerTypes.automatic && validInboxSegment(event.automaticAssignmentId)) {
    return notificationRevision(job.scheduleRevision) === event.scheduleRevision;
  }
  return notificationRevision(job.checklistContextRevision) === event.contextRevision;
}

async function authorizedTarget(transaction, organization, event, identity, options = {}) {
  const normalized = { ...identity, role: options.forPush ? cleanerRole : identity.role };
  if (!validInboxEvent(event, event?.eventId, normalized) || organization.id !== identity.organizationId) return null;

  const jobRef = targetJobReference(organization, event, options.forPush);
  // A deleted Job has no reference data, but may still have a valid cancellation.
  if (options.forPush && !jobRef && event.type !== cleanerTypes.pilotTest) return null;
  const job = jobRef ? (await transaction.get(jobRef)).data() : null;
  const offerRef = targetOfferReference(jobRef, job, event, organization.id);
  const offer = offerRef ? (await transaction.get(offerRef)).data() : null;
  const target = projectAuthorizedTarget(organization, event, normalized, job, offer, options);
  if (!target || !options.forPush) return target;
  if (event.type === cleanerTypes.rescheduled && job.operationalStatus === "ASSIGNED") {
    const decision = currentScheduleConfirmation(job, identity.cleanerId, event.scheduleRevision);
    if (!decision) return target;
    const assignment = decision.assignmentId
      ? (await transaction.get(jobRef.collection("assignments").doc(decision.assignmentId))).data() : null;
    const currentAssignment = decision.assignmentId === null ? job.schemaVersion !== 2
      : assignment?.isActive === true && assignment.cleanerId === identity.cleanerId
        && assignment.jobId === event.jobId && assignment.organizationId === organization.id;
    if (!currentAssignment || decision.state !== "PENDING") return null;
    if (typeof job.scheduledDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(job.scheduledDate)) return target;
    return {
      ...target,
      reschedule: {
        scheduledDate: job.scheduledDate,
        scheduledStart: typeof job.scheduledStart === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(job.scheduledStart)
          ? job.scheduledStart : null,
      },
    };
  }
  if (event.type !== cleanerTypes.automatic || !validInboxSegment(event.automaticAssignmentId)) return target;
  const assignment = (await transaction.get(jobRef.collection("assignments").doc(event.automaticAssignmentId))).data();
  return assignment?.isActive === true && assignment.assignmentMethod === FIRST_ACCEPT_WINS
    && assignment.organizationId === organization.id && assignment.jobId === event.jobId
    && assignment.cleanerId === identity.cleanerId ? target : null;
}

/** Rechecks the current source before a device attempt. Device authorization is separate. */
export async function cleanerNotificationTarget(transaction, organization, event, identity) {
  return authorizedTarget(transaction, organization, event, identity, { forPush: true });
}

export async function notificationDestination(transaction, organization, event, identity, options) {
  return (await authorizedTarget(transaction, organization, event, identity, options))?.destination ?? null;
}

function readInboxPageRequest(data) {
  const pageSize = data?.pageSize === undefined ? inboxWindow : data.pageSize;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > inboxWindow) {
    throw new HttpsError("invalid-argument", "Inbox page size is invalid.");
  }
  if (data?.cursor == null) return { pageSize, cursor: null };
  try {
    if (typeof data.cursor !== "string" || data.cursor.length > 480 || !/^[A-Za-z0-9_-]+$/.test(data.cursor)) throw new Error();
    const decoded = Buffer.from(data.cursor, "base64url");
    if (decoded.toString("base64url") !== data.cursor) throw new Error();
    const parts = JSON.parse(decoded.toString("utf8"));
    if (!Array.isArray(parts) || parts.length !== 3) throw new Error();
    const [seconds, nanoseconds, id] = parts;
    if (!Number.isSafeInteger(seconds) || seconds < 0 || !Number.isInteger(nanoseconds) || !validInboxSegment(id)) throw new Error();
    return { pageSize, cursor: [new Timestamp(seconds, nanoseconds), id] };
  } catch {
    throw new HttpsError("invalid-argument", "Inbox cursor is invalid.");
  }
}

function encodeInboxCursor(document) {
  const timestamp = document.data().createdAt;
  return Buffer.from(JSON.stringify([timestamp.seconds, timestamp.nanoseconds, document.id])).toString("base64url");
}

async function readInboxDocuments(transaction, references) {
  const unique = new Map();
  for (const reference of references) {
    if (reference) unique.set(reference.path, reference);
  }
  if (unique.size === 0) return new Map();
  const snapshots = await transaction.getAll(...unique.values());
  return new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot.data()]));
}

export async function listNotificationInboxForRequest(database, { organizationId, request }) {
  const identity = requestIdentity(request, organizationId);
  const { pageSize, cursor } = readInboxPageRequest(request.data);
  const organization = database.collection("organizations").doc(organizationId);
  return database.runTransaction(async (transaction) => {
    await assertInboxAccess(transaction, database, organization, identity);
    const feed = inboxCollection(organization, identity);
    let query = feed.where("createdAt", ">=", Timestamp.fromMillis(0))
      .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(pageSize + 1);
    if (cursor) query = query.startAfter(...cursor);
    const snapshot = await transaction.get(query);
    const page = snapshot.docs.slice(0, pageSize);
    const hasOlder = snapshot.size > pageSize;
    const nextCursor = hasOlder ? encodeInboxCursor(page.at(-1)) : null;
    const entries = page.map((document) => ({ id: document.id, event: document.data() }))
      .filter(({ id, event }) => validInboxEvent(event, id, identity)
        && typeof event.createdAt?.toMillis === "function");

    const receiptRefs = entries.map(({ id }) => inboxReceipt(organization, identity.uid, id));
    const jobRefs = entries.map(({ event }) => targetJobReference(organization, event, false));
    const records = await readInboxDocuments(transaction, [...receiptRefs, ...jobRefs]);
    const jobs = jobRefs.map((reference) => records.get(reference?.path));
    const offerRefs = entries.map(({ event }, index) => (
      targetOfferReference(jobRefs[index], jobs[index], event, organizationId)
    ));
    const offers = await readInboxDocuments(transaction, offerRefs);
    const confirmations = entries.map(({ event }, index) => identity.role === cleanerRole
      && event.type === cleanerTypes.rescheduled && jobs[index]?.operationalStatus === "ASSIGNED"
      && notificationRoster(jobs[index]).includes(identity.cleanerId)
      ? currentScheduleConfirmation(jobs[index], identity.cleanerId, event.scheduleRevision) : null);
    const assignmentRefs = confirmations.map((confirmation, index) => confirmation?.assignmentId
      ? jobRefs[index].collection("assignments").doc(confirmation.assignmentId) : null);
    const assignments = await readInboxDocuments(transaction, assignmentRefs);
    const now = new Date();
    const items = entries.map(({ id, event }, index) => {
      const target = projectAuthorizedTarget(organization, event, identity, jobs[index],
        offers.get(offerRefs[index]?.path), { now });
      const notice = target && identity.role === managerRole ? automaticOfferNotice(event.type, event.automaticOffer) : null;
      const job = jobs[index];
      const decision = confirmations[index];
      const assignment = assignments.get(assignmentRefs[index]?.path);
      const currentAssignment = decision?.assignmentId === null ? job?.schemaVersion !== 2
        : assignment?.isActive === true && assignment.cleanerId === identity.cleanerId
          && assignment.jobId === event.jobId && assignment.organizationId === organizationId;
      const reschedule = target && decision && currentAssignment && typeof job.scheduledDate === "string"
        ? {
          state: decision.state,
          scheduleRevision: event.scheduleRevision,
          scheduledDate: job.scheduledDate,
          scheduledStart: job.scheduledStart || null,
        } : null;
      return {
        id,
        type: event.type,
        createdAtMs: event.createdAt.toMillis(),
        priority: event.priority,
        read: Boolean(records.get(receiptRefs[index].path)?.readAt),
        openable: Boolean(target),
        serviceLabel: target?.serviceLabel ?? null,
        ...(notice ? { automaticOffer: notice } : {}),
        ...(reschedule ? { reschedule } : {}),
      };
    });
    return { items, unreadCount: items.filter((item) => !item.read).length, hasOlder, nextCursor };
  }, { readOnly: true });
}

export async function changeNotificationInboxItemForRequest(database, { organizationId, request, open = false }) {
  const identity = requestIdentity(request, organizationId);
  const id = request.data?.id;
  if (!isInboxId(id)) throw new HttpsError("invalid-argument", "Notification ID is invalid.");
  const organization = database.collection("organizations").doc(organizationId);
  const eventRef = inboxCollection(organization, identity).doc(id);
  const receiptRef = inboxReceipt(organization, identity.uid, id);

  return database.runTransaction(async (transaction) => {
    await assertInboxAccess(transaction, database, organization, identity);
    const [eventSnapshot, receiptSnapshot] = await transaction.getAll(eventRef, receiptRef);
    const event = eventSnapshot.data();
    if (!validInboxEvent(event, id, identity)) {
      if (open) return { state: "unavailable", destination: null };
      throw new HttpsError("not-found", "Notification is unavailable.");
    }
    const target = open ? await authorizedTarget(transaction, organization, event, identity) : null;
    if (open && !target) return { state: "unavailable", destination: null };

    const receipt = receiptSnapshot.data();
    if (!receipt?.readAt || (open && !receipt?.openedAt)) {
      const at = FieldValue.serverTimestamp();
      transaction.set(receiptRef, {
        ...(!receipt?.readAt ? { readAt: at } : {}),
        ...(open && !receipt?.openedAt ? { openedAt: at } : {}),
      }, { merge: true });
    }
    return open ? { state: "opened", destination: target.destination } : { state: "read" };
  });
}

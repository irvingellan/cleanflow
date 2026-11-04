import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { assertSessionForMutation } from "./cleanerHubAccess.js";
import { notificationRevision, notificationRoster } from "./cleanerNotificationEvents.js";
import { isAutomaticOfferJob } from "./firstAcceptWins.js";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import {
  cleanerInbox, cleanerInboxTypes as cleanerTypes, inboxEventVersion, inboxReceipt, isInboxId,
  managerInboxCollection, managerInboxTypes as managerTypes, offerInboxGeneration, validInboxSegment,
} from "./notificationInboxEvents.js";
import { publicOfferState } from "./publicOfferResponseService.js";

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

async function authorizedTarget(transaction, organization, event, identity, { forPush = false, now = new Date() } = {}) {
  const normalized = { ...identity, role: forPush ? cleanerRole : identity.role };
  if (!validInboxEvent(event, event?.eventId, normalized) || organization.id !== identity.organizationId) return null;

  if (event.type === managerTypes.today || event.type === managerTypes.tomorrow) {
    return { destination: { kind: "DASHBOARD" }, serviceLabel: null };
  }
  if (!validInboxSegment(event.jobId)) return null;
  const jobRef = organization.collection("jobs").doc(event.jobId);
  const job = (await transaction.get(jobRef)).data();
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
  if (normalized.role === managerRole) {
    return { destination: { kind: "JOB", jobId: event.jobId }, serviceLabel: safeServiceLabel(job) };
  }
  if (event.type === cleanerTypes.offer) {
    if (!validInboxSegment(event.offerId)) return null;
    const offer = (await transaction.get(jobRef.collection("offers").doc(event.offerId))).data();
    const visibleStatuses = forPush ? ["PENDING"] : ["PENDING", "INTERESTED"];
    if (!offer || offer.cleanerId !== identity.cleanerId || !visibleStatuses.includes(offer.status)
      || (offer.organizationId != null && offer.organizationId !== organization.id)
      || (offer.jobId != null && offer.jobId !== event.jobId)
      || offerInboxGeneration(offer) !== event.offerGeneration
      || (!isAutomaticOfferJob(offer) && typeof offer.publicOfferTokenHash !== "string")
      || publicOfferState(offer, job, now) !== "available") return null;
    return { destination: { kind: "OFFER", jobId: event.jobId }, serviceLabel: safeServiceLabel(job) };
  }
  if (!rosterIncludesCleaner) return null;
  if (forPush && (job.operationalStatus === "COMPLETED"
    || (event.type === cleanerTypes.rescheduled
      ? notificationRevision(job.scheduleRevision) !== event.scheduleRevision
      : notificationRevision(job.checklistContextRevision) !== event.contextRevision))) return null;
  return { destination: { kind: "JOB", jobId: event.jobId }, serviceLabel: safeServiceLabel(job) };
}

/** Rechecks the current source before a device attempt. Device authorization is separate. */
export async function notificationDestination(transaction, organization, event, identity, options) {
  return (await authorizedTarget(transaction, organization, event, identity, options))?.destination ?? null;
}

export async function listNotificationInboxForRequest(database, { organizationId, request }) {
  const identity = requestIdentity(request, organizationId);
  const organization = database.collection("organizations").doc(organizationId);
  return database.runTransaction(async (transaction) => {
    await assertInboxAccess(transaction, database, organization, identity);
    const snapshot = await transaction.get(inboxCollection(organization, identity)
      .orderBy("createdAt", "desc").limit(inboxWindow + 1));
    const entries = snapshot.docs.slice(0, inboxWindow)
      .filter((document) => validInboxEvent(document.data(), document.id, identity)
        && typeof document.data().createdAt?.toMillis === "function");
    if (entries.length === 0) return { items: [], unreadCount: 0, hasOlder: snapshot.size > inboxWindow };

    const receipts = await transaction.getAll(...entries.map((entry) => inboxReceipt(organization, identity.uid, entry.id)));
    const items = await Promise.all(entries.map(async (entry, index) => {
      const event = entry.data();
      const target = await authorizedTarget(transaction, organization, event, identity);
      return {
        id: entry.id,
        type: event.type,
        createdAtMs: event.createdAt.toMillis(),
        priority: event.priority,
        read: Boolean(receipts[index].data()?.readAt),
        openable: Boolean(target),
        serviceLabel: target?.serviceLabel ?? null,
      };
    }));
    return { items, unreadCount: items.filter((item) => !item.read).length, hasOlder: snapshot.size > inboxWindow };
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

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

export const cleanerInboxCollection = "cleanerNotificationInboxes";
export const managerInboxCollection = "managerNotificationInbox";
export const inboxItemsCollection = "items";
export const inboxReadCollection = "notificationInboxReadStates";

export const cleanerInboxTypes = Object.freeze({
  offer: "NEW_OFFER",
  automatic: "AUTO_ASSIGNED",
  assigned: "ASSIGNED",
  rescheduled: "RESCHEDULED",
  cancelled: "CANCELLED",
  unassigned: "UNASSIGNED",
  // Operator-approved transport check for an already authorized pilot device.
  pilotTest: "PUSH_TEST",
});

export const managerInboxTypes = Object.freeze({
  interest: "CLEANER_INTERESTED",
  automatic: "AUTO_ASSIGNMENT_CONFIRMED",
  automaticBatchFilled: "AUTO_OFFER_BATCH_FILLED",
  rescheduleDeclined: "RESCHEDULE_DECLINED",
  confirmed: "ASSIGNMENT_CONFIRMED",
  checklist: "CHECKLIST_READY_FOR_REVIEW",
  tomorrow: "TOMORROW_19",
  today: "TODAY_07",
});

export const inboxEventVersion = 1;

export function isInboxId(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function validInboxSegment(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    && value !== "." && value !== ".." && !value.includes("/");
}

export function inboxEventId(...parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function cleanerInbox(organization, cleanerId) {
  return organization.collection(cleanerInboxCollection).doc(cleanerId).collection(inboxItemsCollection);
}

export function inboxReceipt(organization, uid, id) {
  return organization.collection(inboxReadCollection).doc(uid).collection(inboxItemsCollection).doc(id);
}

export function inboxEventRecord({ eventId, organizationId, type, jobId, createdAt, ...fields }) {
  return {
    ...fields,
    eventId,
    organizationId,
    type,
    ...(jobId ? { jobId } : {}),
    eventVersion: inboxEventVersion,
    createdAt: createdAt || FieldValue.serverTimestamp(),
    priority: type === cleanerInboxTypes.offer || type === managerInboxTypes.interest ? "NORMAL" : "HIGH",
    processingState: "STORED",
  };
}

export function automaticOfferNotice(type, value) {
  if (![managerInboxTypes.automatic, managerInboxTypes.automaticBatchFilled, managerInboxTypes.rescheduleDeclined].includes(type)) return null;
  const cleanerLabel = type !== managerInboxTypes.automaticBatchFilled && typeof value?.cleanerLabel === "string"
    ? value.cleanerLabel.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) : "";
  const scheduledDate = typeof value?.scheduledDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.scheduledDate)
    && new Date(value.scheduledDate).toJSON()?.slice(0, 10) === value.scheduledDate ? value.scheduledDate : "";
  const scheduledStart = scheduledDate && typeof value?.scheduledStart === "string"
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.scheduledStart) ? value.scheduledStart : "";
  if (!cleanerLabel && !scheduledDate) return null;
  return {
    ...(cleanerLabel ? { cleanerLabel } : {}),
    ...(scheduledDate ? { scheduledDate } : {}),
    ...(scheduledStart ? { scheduledStart } : {}),
  };
}

/** Manager event metadata and push outbox are committed by the same source operation. */
export function createManagerInboxItem(transaction, organization, { eventId, type, jobId, runId, targetDate, automaticOffer }) {
  if (!isInboxId(eventId) || !Object.values(managerInboxTypes).includes(type)) {
    throw new Error("Invalid manager inbox event.");
  }
  const notice = automaticOfferNotice(type, automaticOffer);
  transaction.create(organization.collection(managerInboxCollection).doc(eventId), inboxEventRecord({
    eventId, organizationId: organization.id, type, jobId,
    ...(runId ? { runId } : {}),
    ...(targetDate ? { targetDate } : {}),
    ...(notice ? { automaticOffer: notice } : {}),
  }));
}

export function createManagerReminderInboxItem(transaction, organization, reminder, eventId) {
  createManagerInboxItem(transaction, organization, { eventId, type: reminder.type, targetDate: reminder.targetDate });
}

export function offerInboxGeneration(offer) {
  const timestamp = offer?.createdAt;
  return Number.isSafeInteger(timestamp?.seconds) && Number.isInteger(timestamp?.nanoseconds)
    ? `${timestamp.seconds}:${timestamp.nanoseconds}`
    : "legacy";
}

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import {
  boundedManagerFcmSend, deactivateInvalidManagerDevices, loadEligibleManagerPushDevices,
  managerFcmFailureCode, normalizeManagerFcmResult,
} from "./managerFcmDelivery.js";

export const managerOperationalNotificationCollection = "managerNotificationDeliveries";
export const managerOperationalNotificationTypes = Object.freeze({
  interest: "CLEANER_INTERESTED", acknowledgment: "ASSIGNMENT_CONFIRMED",
});
const copies = {
  en: {
    CLEANER_INTERESTED: ["👤 Cleaner interested", (cleaner, property) => `${cleaner} is interested in ${property}.`],
    ASSIGNMENT_CONFIRMED: ["✅ Cleaner confirmed", (cleaner, property) => `${cleaner} confirmed ${property}.`],
    cleaner: "A cleaner", property: "a property",
  },
  pt: {
    CLEANER_INTERESTED: ["👤 Cleaner interessado", (cleaner, property) => `${cleaner} tem interesse em ${property}.`],
    ASSIGNMENT_CONFIRMED: ["✅ Cleaner confirmou", (cleaner, property) => `${cleaner} confirmou ${property}.`],
    cleaner: "Um cleaner", property: "uma propriedade",
  },
  es: {
    CLEANER_INTERESTED: ["👤 Cleaner interesado", (cleaner, property) => `${cleaner} está interesado en ${property}.`],
    ASSIGNMENT_CONFIRMED: ["✅ Cleaner confirmó", (cleaner, property) => `${cleaner} confirmó ${property}.`],
    cleaner: "Un cleaner", property: "una propiedad",
  },
};

function validSegment(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && !value.includes("/");
}

export function managerOfferNotificationGeneration(offer) {
  const timestamp = offer?.createdAt;
  return Number.isInteger(timestamp?.seconds) && timestamp.seconds >= 0
    && Number.isInteger(timestamp.nanoseconds) && timestamp.nanoseconds >= 0 && timestamp.nanoseconds < 1_000_000_000
    ? `${timestamp.seconds}:${timestamp.nanoseconds}` : "legacy";
}

export function managerOperationalNotificationEventId({
  organizationId, jobId, eventType, offerId, assignmentId, offerGeneration = "legacy",
}) {
  if (![organizationId, jobId, offerId].every(validSegment)
    || !Object.values(managerOperationalNotificationTypes).includes(eventType)
    || (eventType === managerOperationalNotificationTypes.acknowledgment && !validSegment(assignmentId))
    || (eventType === managerOperationalNotificationTypes.interest
      && !/^(legacy|[0-9]{1,16}:[0-9]{1,9})$/.test(offerGeneration))) {
    throw new Error("Manager notification event context is invalid.");
  }
  return createHash("sha256").update(JSON.stringify([
    organizationId, jobId, eventType, offerId,
    eventType === managerOperationalNotificationTypes.acknowledgment ? assignmentId : null,
    eventType === managerOperationalNotificationTypes.interest ? offerGeneration : null,
  ])).digest("hex");
}

export function createManagerOperationalNotification(transaction, jobReference, context) {
  const identity = { ...context, jobId: jobReference.id };
  const eventId = managerOperationalNotificationEventId(identity);
  if (jobReference.path !== `organizations/${context.organizationId}/jobs/${jobReference.id}`
    || (context.eventType === managerOperationalNotificationTypes.acknowledgment
      && !validSegment(context.cleanerId))) throw new Error("Manager notification event scope is invalid.");
  transaction.create(jobReference.collection(managerOperationalNotificationCollection).doc(eventId), {
    eventId, eventType: context.eventType, offerId: context.offerId,
    cleanerId: validSegment(context.cleanerId) ? context.cleanerId : null,
    propertyName: safeName(context.propertyName, null),
    ...(context.eventType === managerOperationalNotificationTypes.interest
      ? { offerGeneration: context.offerGeneration || "legacy" } : {}),
    ...(context.assignmentId ? { assignmentId: context.assignmentId } : {}),
    deliveryProvider: "fcm", deliveryStatus: "PENDING", createdAt: FieldValue.serverTimestamp(),
  });
}

function safeName(value, fallback) {
  return typeof value === "string" && value.trim()
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) : fallback;
}

export function managerOperationalFcmMessages(devices, eventId, eventType, context) {
  return devices.map((snapshot) => {
    const device = snapshot.data();
    const language = typeof device.language === "string" ? device.language.toLowerCase().split("-")[0] : "en";
    const copy = copies[language] || copies.en;
    const [title, body] = copy[eventType];
    return {
      token: device.token,
      data: {
        title, body: body(safeName(context.cleanerName, copy.cleaner), safeName(context.propertyName, copy.property)),
        eventId, eventType, link: "/",
      },
      webpush: { headers: { Urgency: "high" } },
    };
  });
}

async function recordOutcome(reference, outcome, logger) {
  try {
    await reference.update({ ...outcome, completedAt: FieldValue.serverTimestamp() });
  } catch {
    logger?.error?.("Manager operational notification outcome could not be recorded.");
  }
  return outcome;
}

/** Only the two committed Offer transitions enter this claimed, non-retrying FCM path. */
export async function processManagerOperationalNotification({
  database, deliveryReference, organizationId, jobId, eventId, sendFcm, logger,
  loadManagerDevices = (org) => loadEligibleManagerPushDevices(database, org),
}) {
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  if (deliveryReference.path !== `${jobReference.path}/${managerOperationalNotificationCollection}/${eventId}`) {
    return { skipped: "invalid-event" };
  }
  const event = await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(deliveryReference);
    if (!snapshot.exists || snapshot.data().deliveryStatus !== "PENDING") return null;
    const data = snapshot.data();
    let expected;
    try { expected = managerOperationalNotificationEventId({ ...data, organizationId, jobId }); } catch { return null; }
    if (eventId !== expected || data.eventId !== eventId || data.deliveryProvider !== "fcm"
      || (data.eventType === managerOperationalNotificationTypes.acknowledgment
        && !validSegment(data.cleanerId))
      || (data.cleanerId !== null && !validSegment(data.cleanerId))) return null;
    transaction.update(deliveryReference, { deliveryStatus: "SENDING", attemptedAt: FieldValue.serverTimestamp() });
    return data;
  });
  if (!event) return { skipped: "already-claimed-or-invalid" };
  let targetDeviceCount = null;
  try {
    const devices = await loadManagerDevices(organizationId);
    if (!Array.isArray(devices)) throw new Error("Manager devices could not be loaded.");
    targetDeviceCount = devices.length;
    if (!devices.length) return recordOutcome(deliveryReference, {
      deliveryStatus: "NO_ACTIVE_DEVICES", targetDeviceCount: 0,
      acceptedByFcmDevices: 0, failedDevices: 0, unknownDevices: 0,
    }, logger);
    const [cleaner] = event.cleanerId ? await database.getAll(database.doc(
      `organizations/${organizationId}/cleaners/${event.cleanerId}`,
    )) : [];
    const messages = managerOperationalFcmMessages(devices, eventId, event.eventType, {
      propertyName: event.propertyName, cleanerName: cleaner?.data()?.name,
    });
    const response = await boundedManagerFcmSend(sendFcm, messages);
    const outcome = normalizeManagerFcmResult(response, devices.length);
    const cleanup = await deactivateInvalidManagerDevices(database, devices, response);
    return recordOutcome(deliveryReference, {
      ...outcome, ...cleanup, targetDeviceCount,
      ...(outcome.acceptedByFcmDevices > 0 ? { acceptedAt: FieldValue.serverTimestamp() } : {}),
      ...(outcome.failedDevices > 0 ? { failureSummary: "Some FCM sends were not confirmed accepted." } : {}),
    }, logger);
  } catch (error) {
    return recordOutcome(deliveryReference, {
      deliveryStatus: "UNKNOWN", targetDeviceCount, acceptedByFcmDevices: null,
      failedDevices: null, unknownDevices: targetDeviceCount,
      failureCode: managerFcmFailureCode(error), failureSummary: "FCM acceptance could not be confirmed.",
    }, logger);
  }
}

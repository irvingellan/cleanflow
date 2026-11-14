import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { automaticOfferNotice, createManagerInboxItem, inboxEventId, managerInboxTypes, validInboxSegment } from "./notificationInboxEvents.js";
import {
  boundedManagerFcmSend, deactivateInvalidManagerDevices, loadEligibleManagerPushDevices,
  managerFcmFailureCode, normalizeManagerFcmResult,
} from "./managerFcmDelivery.js";

export const managerOperationalNotificationCollection = "managerNotificationDeliveries";
export const managerOperationalNotificationTypes = Object.freeze({
  interest: "CLEANER_INTERESTED", acknowledgment: "ASSIGNMENT_CONFIRMED",
  automatic: managerInboxTypes.automatic, automaticBatchFilled: managerInboxTypes.automaticBatchFilled,
  rescheduleDeclined: managerInboxTypes.rescheduleDeclined,
});
const copies = {
  en: {
    CLEANER_INTERESTED: ["👤 Cleaner interested", (cleaner, property) => `${cleaner} is interested in ${property}.`],
    ASSIGNMENT_CONFIRMED: ["✅ Cleaner confirmed", (cleaner, property) => `${cleaner} confirmed ${property}.`],
    AUTO_ASSIGNMENT_CONFIRMED: ["Cleaner assigned automatically", (cleaner, property, when) => `${cleaner} accepted ${property}${when ? ` for ${when}` : ""}.`],
    AUTO_OFFER_BATCH_FILLED: ["All spots filled", (_cleaner, property, when) => `All spots for ${property}${when ? ` on ${when}` : ""} are filled.`],
    RESCHEDULE_DECLINED: ["Replacement needed", (cleaner, property) => cleaner + " cannot work the new time for " + property + "."],
    cleaner: "A cleaner", property: "a property",
  },
  pt: {
    CLEANER_INTERESTED: ["👤 Cleaner interessado", (cleaner, property) => `${cleaner} tem interesse em ${property}.`],
    ASSIGNMENT_CONFIRMED: ["✅ Cleaner confirmou", (cleaner, property) => `${cleaner} confirmou ${property}.`],
    AUTO_ASSIGNMENT_CONFIRMED: ["Cleaner atribuída automaticamente", (cleaner, property, when) => `${cleaner} aceitou ${property}${when ? ` para ${when}` : ""}.`],
    AUTO_OFFER_BATCH_FILLED: ["Todas as vagas preenchidas", (_cleaner, property, when) => `Todas as vagas de ${property}${when ? ` em ${when}` : ""} foram preenchidas.`],
    RESCHEDULE_DECLINED: ["Vaga a preencher", (cleaner, property) => cleaner + " não pode fazer o serviço de " + property + " na nova data."],
    cleaner: "Um cleaner", property: "uma propriedade",
  },
  es: {
    CLEANER_INTERESTED: ["👤 Cleaner interesado", (cleaner, property) => `${cleaner} está interesado en ${property}.`],
    ASSIGNMENT_CONFIRMED: ["✅ Cleaner confirmó", (cleaner, property) => `${cleaner} confirmó ${property}.`],
    AUTO_ASSIGNMENT_CONFIRMED: ["Cleaner asignada automáticamente", (cleaner, property, when) => `${cleaner} aceptó ${property}${when ? ` para ${when}` : ""}.`],
    AUTO_OFFER_BATCH_FILLED: ["Todas las plazas cubiertas", (_cleaner, property, when) => `Todas las plazas de ${property}${when ? ` del ${when}` : ""} están cubiertas.`],
    RESCHEDULE_DECLINED: ["Vacante por cubrir", (cleaner, property) => cleaner + " no puede trabajar en " + property + " en el nuevo horario."],
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
  organizationId, jobId, eventType, offerId, assignmentId, offerGeneration = "legacy", batchId,
  cleanerId, scheduleRevision,
}) {
  const automatic = eventType === managerOperationalNotificationTypes.automatic;
  const filled = eventType === managerOperationalNotificationTypes.automaticBatchFilled;
  if (eventType === managerOperationalNotificationTypes.rescheduleDeclined) {
    if (![organizationId, jobId, cleanerId].every(validInboxSegment)
      || !(assignmentId == null || validInboxSegment(assignmentId))
      || !Number.isSafeInteger(scheduleRevision) || scheduleRevision < 1) {
      throw new Error("Manager schedule notification context is invalid.");
    }
    return inboxEventId(organizationId, jobId, eventType, scheduleRevision, cleanerId, assignmentId ?? null);
  }
  if (automatic || filled) {
    if (![organizationId, jobId].every(validInboxSegment) || typeof batchId !== "string"
      || !/^(0|[1-9]\d{0,15})$/.test(batchId) || !Number.isSafeInteger(Number(batchId))
      || (automatic ? !validInboxSegment(offerId) || !validInboxSegment(assignmentId) : offerId != null || assignmentId != null)) {
      throw new Error("Manager notification event context is invalid.");
    }
    return inboxEventId(organizationId, jobId, eventType, batchId, ...(automatic ? [offerId, assignmentId] : []));
  }
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

export function createManagerOperationalNotification(transaction, organizationReference, jobReference, context) {
  const identity = { ...context, jobId: jobReference.id };
  const eventId = managerOperationalNotificationEventId(identity);
  if (organizationReference.path !== `organizations/${context.organizationId}`
    || jobReference.path !== `organizations/${context.organizationId}/jobs/${jobReference.id}`
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
  createManagerInboxItem(transaction, organizationReference, {
    eventId, jobId: jobReference.id,
    type: context.automatic ? managerInboxTypes.automatic : context.eventType,
  });
}

/** A successful V2 acceptance writes both streams atomically with the Assignment. */
export function createAutomaticOfferConfirmationNotices(transaction, organization, job, {
  organizationId, cleanerId, cleanerName, offerId, assignmentId, batchId, filled, propertyName, scheduledDate, scheduledStart,
}) {
  if (organization.path !== `organizations/${organizationId}`
    || job.path !== `${organization.path}/jobs/${job.id}` || !validInboxSegment(cleanerId) || typeof filled !== "boolean") {
    throw new Error("Manager notification event scope is invalid.");
  }
  const publish = (eventType, identity, recipient) => {
    const eventId = managerOperationalNotificationEventId({ organizationId, jobId: job.id, eventType, batchId, ...identity });
    const notice = automaticOfferNotice(eventType, { cleanerLabel: cleanerName, scheduledDate, scheduledStart });
    transaction.create(job.collection(managerOperationalNotificationCollection).doc(eventId), {
      eventId, eventType, batchId, ...identity, cleanerId: recipient, propertyName: safeName(propertyName, null),
      ...(notice ? { automaticOffer: notice } : {}),
      deliveryProvider: "fcm", deliveryStatus: "PENDING", createdAt: FieldValue.serverTimestamp(),
    });
    createManagerInboxItem(transaction, organization, { eventId, jobId: job.id, type: eventType, automaticOffer: notice });
  };
  publish(managerOperationalNotificationTypes.automatic, { offerId, assignmentId }, cleanerId);
  if (filled) publish(managerOperationalNotificationTypes.automaticBatchFilled, {}, null);
}

export function createRescheduleDeclineNotice(transaction, organization, job, {
  organizationId, cleanerId, scheduleRevision, assignmentId, cleanerName, propertyName, scheduledDate, scheduledStart,
}) {
  if (organization.path !== "organizations/" + organizationId || job.path !== organization.path + "/jobs/" + job.id) {
    throw new Error("Manager schedule notification scope is invalid.");
  }
  const eventType = managerOperationalNotificationTypes.rescheduleDeclined;
  const eventId = managerOperationalNotificationEventId({
    organizationId, jobId: job.id, eventType, cleanerId, scheduleRevision, assignmentId,
  });
  const notice = automaticOfferNotice(eventType, { cleanerLabel: cleanerName, scheduledDate, scheduledStart });
  transaction.create(job.collection(managerOperationalNotificationCollection).doc(eventId), {
    eventId, eventType, cleanerId, scheduleRevision, assignmentId: assignmentId ?? null,
    propertyName: safeName(propertyName, null), ...(notice ? { automaticOffer: notice } : {}),
    deliveryProvider: "fcm", deliveryStatus: "PENDING", createdAt: FieldValue.serverTimestamp(),
  });
  createManagerInboxItem(transaction, organization, { eventId, jobId: job.id, type: eventType, automaticOffer: notice });
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
    const notice = automaticOfferNotice(eventType, context.automaticOffer);
    const when = notice?.scheduledDate
      ? [new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : language === "es" ? "es-US" : "en-US",
        { dateStyle: "medium", timeZone: "UTC" }).format(new Date(notice.scheduledDate)), notice.scheduledStart].filter(Boolean).join(" · ")
      : "";
    return {
      token: device.token,
      data: {
        title, body: body(safeName(notice?.cleanerLabel || context.cleanerName, copy.cleaner), safeName(context.propertyName, copy.property), when),
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

/** Only committed operational events enter this claimed, non-retrying FCM path. */
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
    const validCleanerId = [managerOperationalNotificationTypes.automatic, managerOperationalNotificationTypes.rescheduleDeclined]
      .includes(data.eventType) ? validInboxSegment : validSegment;
    if (eventId !== expected || data.eventId !== eventId || data.deliveryProvider !== "fcm"
      || ([managerOperationalNotificationTypes.acknowledgment, managerOperationalNotificationTypes.automatic].includes(data.eventType)
        && !validCleanerId(data.cleanerId))
      || (data.eventType === managerOperationalNotificationTypes.automaticBatchFilled && data.cleanerId !== null)
      || (data.cleanerId !== null && !validCleanerId(data.cleanerId))) return null;
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
    const notice = automaticOfferNotice(event.eventType, event.automaticOffer);
    const [cleaner] = event.cleanerId && !notice?.cleanerLabel ? await database.getAll(database.doc(
      `organizations/${organizationId}/cleaners/${event.cleanerId}`,
    )) : [];
    const messages = managerOperationalFcmMessages(devices, eventId, event.eventType, {
      propertyName: event.propertyName, cleanerName: cleaner?.data()?.name, automaticOffer: notice,
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

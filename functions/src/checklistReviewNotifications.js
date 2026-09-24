import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

export const checklistReviewNotificationCollection = "managerNotificationDeliveries";
export const checklistReviewNotificationType = "CHECKLIST_READY_FOR_REVIEW";

const notificationCopy = {
  en: {
    title: "Checklist received",
    body: "A service is waiting for your review. Open CleanFlow.",
  },
  pt: {
    title: "Checklist recebido",
    body: "Há um serviço aguardando sua revisão. Abra o CleanFlow.",
  },
  es: {
    title: "Lista de limpieza recibida",
    body: "Hay un servicio esperando tu revisión. Abre CleanFlow.",
  },
};

function failureCode(error) {
  const code = typeof error?.code === "string" ? error.code : "unknown";
  return /^[A-Za-z0-9/_-]{1,80}$/.test(code) ? code : "unknown";
}

function deviceData(device) {
  return typeof device?.data === "function" ? device.data() : device;
}

function languageCopy(language) {
  const normalizedLanguage = typeof language === "string" ? language.toLowerCase().split("-")[0] : "";
  return notificationCopy[normalizedLanguage] || notificationCopy.pt;
}

export function checklistReviewNotificationEventId(organizationId, jobId, runId) {
  if (![organizationId, jobId, runId].every((value) => typeof value === "string" && value && !value.includes("/"))) {
    throw new Error("Checklist review notification context is invalid.");
  }

  return createHash("sha256")
    .update(`${organizationId}:${jobId}:${runId}:${checklistReviewNotificationType}`)
    .digest("hex");
}

export function checklistReviewFcmMessages(devices, eventId) {
  return devices.map((device) => {
    const data = deviceData(device);
    const copy = languageCopy(data?.language);

    return {
      token: data?.token,
      data: {
        title: copy.title,
        body: copy.body,
        eventId,
        eventType: checklistReviewNotificationType,
        link: "/",
      },
      webpush: { headers: { Urgency: "high" } },
    };
  });
}

async function claimChecklistReviewNotification(database, deliveryReference) {
  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(deliveryReference);
    if (!snapshot.exists || snapshot.data()?.deliveryStatus !== "PENDING") return false;

    transaction.update(deliveryReference, {
      deliveryStatus: "SENDING",
      attemptedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function recordOutcome(deliveryReference, update, eventId, logger) {
  try {
    await deliveryReference.update({
      ...update,
      completedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    logger?.error?.("Checklist review notification outcome could not be recorded.", {
      eventId,
      failureCode: failureCode(error),
    });
    return false;
  }
}

/**
 * Processes a committed outbox record once. The transactional SENDING claim
 * prevents trigger redelivery from repeating an FCM attempt. FCM acceptance
 * means provider acceptance, not display on a manager's device.
 */
export async function processChecklistReviewNotification({
  database,
  deliveryReference,
  deliveryData,
  organizationId,
  jobId,
  runId,
  eventId,
  loadManagerDevices,
  sendFcm,
  logger,
}) {
  const expectedEventId = checklistReviewNotificationEventId(organizationId, jobId, runId);
  if (eventId !== expectedEventId
    || deliveryData?.eventId !== eventId
    || deliveryData?.eventType !== checklistReviewNotificationType
    || deliveryData?.deliveryProvider !== "fcm") {
    logger?.warn?.("Checklist review notification event was ignored.", { eventId });
    return { skipped: "invalid-event" };
  }

  const claimed = await claimChecklistReviewNotification(database, deliveryReference);
  if (!claimed) return { skipped: "already-claimed" };

  let targetDeviceCount = null;
  try {
    const devices = await loadManagerDevices(organizationId);
    if (!Array.isArray(devices)) throw new Error("Manager notification devices could not be loaded.");
    targetDeviceCount = devices.length;
    if (devices.length === 0) {
      const update = {
        deliveryStatus: "NO_ACTIVE_DEVICES",
        targetDeviceCount: 0,
        acceptedByFcmDevices: 0,
        failedDevices: 0,
      };
      await recordOutcome(deliveryReference, update, eventId, logger);
      logger?.info?.("Checklist review notification had no eligible manager devices.", { eventId });
      return update;
    }

    const messages = checklistReviewFcmMessages(devices, eventId);
    const response = await sendFcm(messages);
    const acceptedByFcmDevices = response?.successCount;
    const failedDevices = response?.failureCount;
    if (!Number.isInteger(acceptedByFcmDevices)
      || !Number.isInteger(failedDevices)
      || acceptedByFcmDevices < 0
      || failedDevices < 0
      || acceptedByFcmDevices + failedDevices !== devices.length) {
      throw new Error("FCM returned an unreadable batch result.");
    }

    const deliveryStatus = acceptedByFcmDevices === devices.length
      ? "FCM_ACCEPTED"
      : acceptedByFcmDevices > 0 ? "PARTIAL" : "FAILED";
    const update = {
      deliveryStatus,
      targetDeviceCount,
      acceptedByFcmDevices,
      failedDevices,
      ...(acceptedByFcmDevices > 0 ? { acceptedAt: FieldValue.serverTimestamp() } : {}),
      ...(failedDevices > 0 ? { failureSummary: "Some FCM sends were not accepted." } : {}),
    };
    await recordOutcome(deliveryReference, update, eventId, logger);
    logger?.info?.("Checklist review notification attempt completed.", {
      eventId,
      deliveryStatus,
      targetDeviceCount: devices.length,
      acceptedByFcmDevices,
      failedDevices,
    });
    return update;
  } catch (error) {
    const update = {
      deliveryStatus: "UNKNOWN",
      targetDeviceCount,
      acceptedByFcmDevices: null,
      failedDevices: null,
      failureCode: failureCode(error),
      failureSummary: "FCM did not confirm whether the notification was accepted.",
    };
    await recordOutcome(deliveryReference, update, eventId, logger);
    logger?.warn?.("Checklist review notification outcome is unknown.", {
      eventId,
      failureCode: update.failureCode,
    });
    return update;
  }
}

import { FieldValue } from "firebase-admin/firestore";
import { boundedManagerFcmSend, deactivateInvalidManagerDevices, managerFcmFailureCode, normalizeManagerFcmResult } from "./managerFcmDelivery.js";
import { managerReminderPayload, summarizeManagerReminderDelivery } from "./managerReminders.js";
import { managerReminderDeliveryAuditFields, unknownManagerReminderDeliveryAuditFields } from "./managerReminderTransport.js";

export async function sendFcmManagerReminder({ database, reminder, loadManagerDevices, sendFcm }) {
  const devices = await loadManagerDevices();
  if (devices.length === 0) return { provider: "fcm", attempted: 0, delivered: 0, failed: 0, unknownDevices: 0, invalidated: 0, invalidDeviceCleanupFailed: false };
  let response;
  let outcome;
  try {
    response = await boundedManagerFcmSend(sendFcm, devices.map((device) => ({
      token: device.data().token,
      data: { ...managerReminderPayload(reminder, device.data().language), eventId: `manager-reminder-${reminder.targetDate}-${reminder.type}` },
      webpush: { headers: { Urgency: "high" } },
    })));
    outcome = normalizeManagerFcmResult(response, devices.length);
  } catch (error) {
    return { provider: "fcm", attempted: devices.length, delivered: null, failed: null,
      unknownDevices: devices.length, invalidated: 0, invalidDeviceCleanupFailed: false,
      deliveryStatus: "UNKNOWN", failureCode: managerFcmFailureCode(error) };
  }
  const cleanup = await deactivateInvalidManagerDevices(database, devices, response);
  return { provider: "fcm", attempted: devices.length, delivered: outcome.acceptedByFcmDevices,
    failed: outcome.failedDevices, unknownDevices: outcome.unknownDevices, deliveryStatus: outcome.deliveryStatus,
    ...cleanup };
}

/** The claim remains durable even when the audit write fails. Never resend. */
export async function processClaimedManagerReminder({ claimed, reminder, dispatch, deliveryReference, logger }) {
  if (!claimed) return { ...reminder, skipped: "already-claimed" };
  let result;
  let update;
  try {
    const delivery = await dispatch();
    const outcome = summarizeManagerReminderDelivery(delivery);
    result = { ...reminder, ...delivery, ...outcome };
    update = { deliveryStatus: outcome.deliveryStatus, ...managerReminderDeliveryAuditFields(delivery, outcome),
      ...(outcome.hasConfirmedDelivery ? { sentAt: FieldValue.serverTimestamp() } : {}),
      ...(outcome.deliveryStatus === "FAILED" ? { failedAt: FieldValue.serverTimestamp() } : {}),
    };
  } catch (error) {
    const fields = unknownManagerReminderDeliveryAuditFields(error);
    result = { ...reminder, ...fields, deliveryStatus: "UNKNOWN", hasConfirmedDelivery: false };
    update = { ...fields, deliveryStatus: "UNKNOWN", failedAt: FieldValue.serverTimestamp() };
  }
  let auditRecorded = false;
  try {
    await deliveryReference.update(update);
    auditRecorded = true;
  } catch {
    logger?.error?.("Manager reminder outcome audit persistence failed.", {
      deliveryStatus: result.deliveryStatus, deliveryProvider: update.deliveryProvider,
      deliveredDevices: update.deliveredDevices ?? null,
    });
  }
  return { ...result, auditRecorded };
}

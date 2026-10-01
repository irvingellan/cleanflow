import { FieldValue } from "firebase-admin/firestore";
import { authorizedManagerDevices } from "./managerAuthorization.js";

export const managerFcmTimeoutMs = 15_000;
export const managerFcmCleanupTimeoutMs = 5_000;
const invalidTokenCodes = new Set([
  "messaging/invalid-registration-token", "messaging/registration-token-not-registered",
]);
const rejectedCodes = new Set([
  ...invalidTokenCodes, "messaging/invalid-argument", "messaging/invalid-payload",
  "messaging/payload-size-limit-exceeded", "messaging/mismatched-credential",
]);
const safeCodes = new Set([
  ...rejectedCodes, "messaging/server-unavailable", "messaging/internal-error",
  "messaging/unknown-error", "messaging/network-error", "messaging/quota-exceeded",
  "deadline-exceeded", "unreadable-provider-response",
]);

export function managerFcmFailureCode(error) {
  return safeCodes.has(error?.code) ? error.code : "provider-error";
}

export function invalidManagerFcmToken(error) {
  return invalidTokenCodes.has(error?.code);
}

export async function loadEligibleManagerPushDevices(database, organizationId) {
  const snapshots = await database.collection("managerPushDevices")
    .where("organizationId", "==", organizationId).get();
  const active = snapshots.docs.filter((snapshot) => {
    const device = snapshot.data();
    return device.active === true && typeof device.token === "string"
      && device.token.length >= 32 && device.token.length <= 4096
      && !/[\s\u0000-\u001f\u007f]/.test(device.token);
  });
  return authorizedManagerDevices(database, organizationId, active);
}

export async function boundedManagerFcmSend(sendFcm, messages) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => sendFcm(messages)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("FCM outcome is unknown."), {
          code: "deadline-exceeded",
        })), managerFcmTimeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Ordered SDK results are required before associating failures with registrations. */
export function normalizeManagerFcmResult(response, deviceCount) {
  const results = response?.responses;
  if (!Array.isArray(results) || results.length !== deviceCount
    || !results.every((item) => item?.success === true
      ? typeof item.messageId === "string" && item.messageId.length > 0
      : item?.success === false && typeof item.error?.code === "string")
    || response.successCount !== results.filter((item) => item.success).length
    || response.failureCount !== results.filter((item) => !item.success).length) {
    throw Object.assign(new Error("FCM returned an unreadable batch result."), {
      code: "unreadable-provider-response",
    });
  }
  const acceptedByFcmDevices = response.successCount;
  const failedDevices = response.failureCount;
  const unknownDevices = results.filter((item) => !item.success && !rejectedCodes.has(item.error?.code)).length;
  const deliveryStatus = acceptedByFcmDevices === deviceCount ? "FCM_ACCEPTED"
    : acceptedByFcmDevices > 0 ? "PARTIAL" : unknownDevices > 0 ? "UNKNOWN" : "FAILED";
  return { deliveryStatus, acceptedByFcmDevices, failedDevices, unknownDevices };
}

/** Only the exact token/owner/org that was sent can be invalidated. */
export async function deactivateInvalidManagerDevices(database, devices, response) {
  let invalidated = 0;
  let invalidDeviceCleanupFailed = false;
  let timer;
  const cleanup = Promise.all(response.responses.map(async (result, index) => {
    if (result.success || !invalidManagerFcmToken(result.error)) return;
    const sent = devices[index];
    const original = sent.data();
    try {
      const changed = await database.runTransaction(async (transaction) => {
        const latest = await transaction.get(sent.ref);
        const current = latest.data();
        if (!latest.exists || current?.active !== true || current.token !== original.token
          || current.organizationId !== original.organizationId || current.userId !== original.userId) return false;
        transaction.update(sent.ref, {
          active: false, invalidatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (changed) invalidated += 1;
    } catch {
      // A cleanup failure never changes the already-known provider result.
      invalidDeviceCleanupFailed = true;
    }
  }));
  try {
    await Promise.race([
      cleanup,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Device cleanup deadline exceeded.")), managerFcmCleanupTimeoutMs);
      }),
    ]);
  } catch {
    invalidDeviceCleanupFailed = true;
  } finally {
    clearTimeout(timer);
  }
  return { invalidated, invalidDeviceCleanupFailed };
}

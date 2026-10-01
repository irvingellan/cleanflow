import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { isActiveManagerMembership, requireOrganizationManager } from "./managerAuthorization.js";
import { registrationDocumentId } from "./notificationLab.js";

export const currentDeviceTestCooldownMs = 60_000;
export const currentDeviceTestTimeoutMs = 15_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const segmentPattern = /^[A-Za-z0-9_-]{1,128}$/;
const invalidTokenCodes = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);
const safeProviderCodes = new Set([
  ...invalidTokenCodes,
  "messaging/server-unavailable", "messaging/internal-error", "messaging/unknown-error",
  "deadline-exceeded", "unreadable-provider-response", "unavailable",
]);

function safeFailureCode(error) {
  return safeProviderCodes.has(error?.code) ? error.code : "provider-error";
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).sort().join(",") !== "confirm,deviceId"
    || typeof input.deviceId !== "string" || !uuidPattern.test(input.deviceId)
    || input.confirm !== true) {
    throw new HttpsError("invalid-argument", "Current-device notification test request is invalid.");
  }
}

function fixedMessage(token) {
  const title = "CleanFlow Test";
  const body = "Notifications are working on this device.";
  return {
    token,
    notification: { title, body },
    data: { title, body, eventType: "CURRENT_DEVICE_TEST", link: "/" },
    webpush: {
      headers: { Urgency: "normal" },
      notification: {
        title, body, icon: "/icon-192.png", badge: "/icon-192.png",
        tag: "cleanflow-current-device-test", data: { link: "/" },
      },
    },
  };
}

async function boundedSend(sendFcm, message) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => sendFcm(message)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Provider outcome unknown."), {
          code: "deadline-exceeded",
        })), currentDeviceTestTimeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function recordOutcome(reference, outcome, logger) {
  try {
    await reference.update({ ...outcome, completedAt: FieldValue.serverTimestamp() });
    return true;
  } catch {
    logger?.error?.("Current-device notification test audit update failed.");
    return false;
  }
}

/** Current-browser targeting is derived only from the authenticated UID and its local UUID. */
export async function sendCurrentManagerTestNotification({
  database, organizationId, request, sendFcm, logger, now = Date.now,
}) {
  await requireOrganizationManager(database, request, organizationId);
  validateInput(request.data);
  const userId = request.auth.uid;
  if (!segmentPattern.test(userId) || !segmentPattern.test(organizationId)
    || typeof sendFcm !== "function") {
    throw new HttpsError("invalid-argument", "Current-device notification test context is invalid.");
  }
  const attemptedAtMs = typeof now === "function" ? now() : now;
  if (!Number.isFinite(attemptedAtMs) || attemptedAtMs < 0) throw new Error("Server clock is invalid.");

  const registrationId = registrationDocumentId(userId, request.data.deviceId);
  const targetReference = database.doc(`managerPushDevices/${registrationId}`);
  const membershipReference = database.doc(`organizations/${organizationId}/members/${userId}`);
  const cooldownReference = database.doc(
    `organizations/${organizationId}/currentDeviceNotificationTestCooldowns/${userId}`,
  );
  const auditReference = database.doc(
    `organizations/${organizationId}/currentDeviceNotificationTests/${randomUUID()}`,
  );

  // All reads precede writes. The manager-wide claim also bounds multiple device/browser calls.
  const { token, recoveryAttempt } = await database.runTransaction(async (transaction) => {
    const [membership, registration, cooldown] = await Promise.all([
      transaction.get(membershipReference), transaction.get(targetReference),
      transaction.get(cooldownReference),
    ]);
    if (!isActiveManagerMembership(membership.data())) {
      throw new HttpsError("permission-denied", "Active manager access is required.");
    }
    const device = registration.data();
    if (registration.exists && (device?.userId !== userId || device?.organizationId !== organizationId)) {
      throw new HttpsError("permission-denied", "Current device does not belong to this manager.");
    }
    if (!registration.exists || device?.active !== true || typeof device?.token !== "string"
      || device.token.length < 32 || device.token.length > 4096) {
      throw new HttpsError("failed-precondition", "Current device registration is not active.");
    }

    const tokenFingerprint = createHash("sha256").update(device.token).digest("hex");
    const previous = cooldown.data();
    const coolingDown = cooldown.exists
      && attemptedAtMs - previous.lastAttemptAtMs < currentDeviceTestCooldownMs;
    let isRecovery = false;
    if (coolingDown) {
      // Only a conclusive rejection + changed refreshed token can bypass this claim once.
      if (previous.registrationId === registrationId && previous.recoveryUsed === false
        && previous.tokenFingerprint !== tokenFingerprint
        && typeof previous.lastAuditId === "string" && uuidPattern.test(previous.lastAuditId)) {
        const priorAudit = await transaction.get(database.doc(
          `organizations/${organizationId}/currentDeviceNotificationTests/${previous.lastAuditId}`,
        ));
        const prior = priorAudit.data();
        isRecovery = prior?.status === "FAILED" && prior?.providerAccepted === false
          && invalidTokenCodes.has(prior?.failureCode)
          && prior?.registrationId === registrationId && prior?.userId === userId;
      }
      if (!isRecovery) {
        throw new HttpsError("resource-exhausted", "Please wait before testing notifications again.");
      }
    }

    transaction.set(cooldownReference, {
      lastAttemptAtMs: attemptedAtMs,
      lastAuditId: auditReference.id,
      registrationId,
      tokenFingerprint,
      recoveryUsed: isRecovery,
    });
    transaction.create(auditReference, {
      userId, registrationId, provider: "fcm", testType: "CURRENT_DEVICE",
      status: "SENDING", providerAccepted: null, tokenInvalidated: false,
      recoveryAttempt: isRecovery,
      attemptedAt: FieldValue.serverTimestamp(), attemptedAtMs,
    });
    return { token: device.token, recoveryAttempt: isRecovery };
  });

  try {
    const messageId = await boundedSend(sendFcm, fixedMessage(token));
    if (typeof messageId !== "string" || messageId.length === 0) {
      throw Object.assign(new Error("Provider did not confirm acceptance."), {
        code: "unreadable-provider-response",
      });
    }
    const auditRecorded = await recordOutcome(auditReference, {
      status: "FCM_ACCEPTED", providerAccepted: true, tokenInvalidated: false,
    }, logger);
    return {
      provider: "fcm", attempted: 1, status: "FCM_ACCEPTED", providerAccepted: true,
      invalidated: false, recoveryAllowed: false, auditRecorded,
    };
  } catch (error) {
    const failureCode = safeFailureCode(error);
    const invalidToken = invalidTokenCodes.has(failureCode);
    let invalidated = false;
    if (invalidToken) {
      try {
        invalidated = await database.runTransaction(async (transaction) => {
          const latest = await transaction.get(targetReference);
          const latestDevice = latest.data();
          if (!latest.exists || latestDevice?.token !== token
            || latestDevice.userId !== userId || latestDevice.organizationId !== organizationId) return false;
          transaction.update(targetReference, {
            active: false, invalidatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          });
          return true;
        });
      } catch {
        logger?.error?.("Current-device notification test invalidation failed.");
      }
    }
    const status = invalidToken ? "FAILED" : "UNKNOWN";
    const auditRecorded = await recordOutcome(auditReference, {
      status, failureCode, providerAccepted: invalidToken ? false : null, tokenInvalidated: invalidated,
    }, logger);
    return {
      provider: "fcm", attempted: 1, status, failureCode,
      providerAccepted: invalidToken ? false : null,
      invalidated, recoveryAllowed: invalidToken && !recoveryAttempt && auditRecorded, auditRecorded,
    };
  }
}

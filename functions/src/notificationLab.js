import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { isActiveManagerMembership } from "./managerAuthorization.js";

const deviceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const registrationIdPattern = /^[0-9a-f]{64}$/;
const pathSegmentPattern = /^[A-Za-z0-9_-]{1,128}$/;
const appVersionPattern = /^[A-Za-z0-9._-]{1,64}$/;
const healthFields = new Set([
  "deviceId", "notificationPermission", "serviceWorker", "fcmRegistration",
  "platform", "browserClass", "standalone", "appVersion",
]);
const healthValues = {
  notificationPermission: new Set(["granted", "denied", "default", "unsupported"]),
  serviceWorker: new Set(["ready", "unavailable", "error", "unsupported"]),
  fcmRegistration: new Set(["registered", "missing", "error", "unsupported", "unknown"]),
  platform: new Set(["ios", "android", "macos", "windows", "linux", "other"]),
  browserClass: new Set(["safari", "chrome", "firefox", "edge", "other"]),
};
const healthComparisonFields = [
  "notificationPermission", "serviceWorker", "fcmRegistration",
  "platform", "browserClass", "standalone", "appVersion",
];
const unchangedHealthIntervalMs = 6 * 60 * 60 * 1000;
export const developerTestCooldownMs = 60 * 1000;
export const developerTestTimeoutMs = 15 * 1000;

function validSegment(value) {
  return typeof value === "string" && pathSegmentPattern.test(value);
}

function safeFailureCode(error) {
  const code = error?.code;
  return typeof code === "string" && /^[A-Za-z0-9/_-]{1,80}$/.test(code)
    ? code : "unknown";
}

function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number.isFinite(value) ? value : 0;
}

function nowMillis(now) {
  const value = typeof now === "function" ? now() : now;
  if (!Number.isFinite(value) || value < 0) throw new Error("Server clock is invalid.");
  return value;
}

function registrationDocumentId(userId, deviceId) {
  return createHash("sha256").update(`${userId}:${deviceId}`).digest("hex");
}

function validateHealthInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !healthFields.has(key))
    || !deviceIdPattern.test(input.deviceId || "")
    || Object.entries(healthValues).some(([key, values]) => !values.has(input[key]))
    || typeof input.standalone !== "boolean"
    || (input.appVersion != null && !appVersionPattern.test(input.appVersion))) {
    throw new HttpsError("invalid-argument", "Notification health snapshot is invalid.");
  }

  return {
    notificationPermission: input.notificationPermission,
    serviceWorker: input.serviceWorker,
    fcmRegistration: input.fcmRegistration,
    platform: input.platform,
    browserClass: input.browserClass,
    standalone: input.standalone,
    appVersion: input.appVersion || null,
  };
}

/**
 * The caller supplies the authenticated UID, never a UID from request.data.
 * A denied/unregistered browser can still report its state. No token or raw
 * browser device ID is copied into the health document.
 */
export async function reportManagerDeviceHealth({
  database, organizationId, userId, input, now = Date.now,
}) {
  if (!validSegment(organizationId) || !validSegment(userId)) {
    throw new HttpsError("invalid-argument", "Notification health context is invalid.");
  }
  const health = validateHealthInput(input);
  const checkedAtMs = nowMillis(now);
  const documentId = registrationDocumentId(userId, input.deviceId);
  const membershipReference = database.doc(`organizations/${organizationId}/members/${userId}`);
  const registrationReference = database.doc(`managerPushDevices/${documentId}`);
  const healthReference = database.doc(
    `organizations/${organizationId}/managerNotificationDeviceHealth/${documentId}`,
  );

  const recorded = await database.runTransaction(async (transaction) => {
    const [membership, registration, previous] = await Promise.all([
      transaction.get(membershipReference),
      transaction.get(registrationReference),
      transaction.get(healthReference),
    ]);
    if (!isActiveManagerMembership(membership.data())) {
      throw new HttpsError("permission-denied", "Active manager access is required.");
    }
    if (registration.exists && (registration.data()?.userId !== userId
      || registration.data()?.organizationId !== organizationId)) {
      throw new HttpsError("permission-denied", "Notification device does not belong to this manager.");
    }

    const previousData = previous.data();
    const changed = !previous.exists || healthComparisonFields.some(
      (field) => previousData?.[field] !== health[field],
    );
    const elapsed = checkedAtMs - timestampMillis(previousData?.checkedAtMs);
    // Report real permission/registration changes immediately; only identical
    // observations are throttled. Otherwise an enable tap could leave a stale
    // denied snapshot until a future page visit.
    if (previous.exists && !changed && elapsed >= 0 && elapsed < unchangedHealthIntervalMs) {
      return false;
    }

    transaction.set(healthReference, {
      userId,
      ...health,
      checkedAt: FieldValue.serverTimestamp(),
      checkedAtMs,
    });
    return true;
  });

  return { recorded };
}

function fixedDeveloperTestMessage(token) {
  return {
    token,
    data: {
      title: "CleanFlow Test",
      body: "Developer notification test.",
      eventType: "DEV_TEST",
      link: "/",
    },
    webpush: { headers: { Urgency: "normal" } },
  };
}

async function boundedSend(sendFcm, message) {
  let timeoutId;
  try {
    return await Promise.race([
      Promise.resolve().then(() => sendFcm(message)),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error("FCM test notification outcome is unknown.");
          error.code = "deadline-exceeded";
          reject(error);
        }, developerTestTimeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function recordTestOutcome(auditReference, outcome, logger) {
  try {
    await auditReference.update({
      ...outcome,
      completedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    logger?.error?.("Developer notification test audit update failed.", {
      failureCode: safeFailureCode(error),
    });
    return false;
  }
}

/**
 * One explicit, developer-authorized, single-device FCM attempt. The caller
 * enforces the existing developer UID gate; this function additionally checks
 * both manager memberships and claims a cooldown before provider dispatch.
 * Unknown provider outcomes are never retried automatically.
 */
export async function sendDeveloperTestNotification({
  database, organizationId, developerUid, targetRegistrationId, confirm,
  sendFcm, logger, now = Date.now,
}) {
  if (!validSegment(organizationId) || !validSegment(developerUid)
    || !registrationIdPattern.test(targetRegistrationId || "")
    || confirm !== true || typeof sendFcm !== "function") {
    throw new HttpsError("invalid-argument", "Developer notification test request is invalid.");
  }

  const attemptedAtMs = nowMillis(now);
  const developerMembershipReference = database.doc(
    `organizations/${organizationId}/members/${developerUid}`,
  );
  const targetReference = database.doc(`managerPushDevices/${targetRegistrationId}`);
  const cooldownReference = database.doc(
    `organizations/${organizationId}/developerNotificationTestCooldowns/${developerUid}`,
  );
  const auditReference = database.doc(
    `organizations/${organizationId}/developerNotificationTests/${randomUUID()}`,
  );

  // Claim before sending: concurrent calls cannot both dispatch. A failed or
  // ambiguous FCM attempt still consumes the cooldown to avoid duplicate pushes.
  const targetToken = await database.runTransaction(async (transaction) => {
    const [developerMembership, target, cooldown] = await Promise.all([
      transaction.get(developerMembershipReference),
      transaction.get(targetReference),
      transaction.get(cooldownReference),
    ]);
    if (!isActiveManagerMembership(developerMembership.data())) {
      throw new HttpsError("permission-denied", "Active manager access is required.");
    }
    const targetData = target.data();
    if (!target.exists || targetData?.organizationId !== organizationId
      || targetData?.active !== true || !validSegment(targetData?.userId)
      || typeof targetData?.token !== "string"
      || targetData.token.length < 32 || targetData.token.length > 4096) {
      throw new HttpsError("failed-precondition", "The selected manager device is not active.");
    }
    const targetMembership = await transaction.get(database.doc(
      `organizations/${organizationId}/members/${targetData.userId}`,
    ));
    if (!isActiveManagerMembership(targetMembership.data())) {
      throw new HttpsError("failed-precondition", "The selected manager device is not eligible.");
    }
    const lastAttemptAtMs = timestampMillis(cooldown.data()?.lastAttemptAtMs);
    if (cooldown.exists && attemptedAtMs - lastAttemptAtMs < developerTestCooldownMs) {
      throw new HttpsError("resource-exhausted", "Please wait before sending another test notification.");
    }

    transaction.set(cooldownReference, {
      lastAttemptAtMs: attemptedAtMs,
      lastAuditId: auditReference.id,
    });
    transaction.create(auditReference, {
      developerUid,
      targetRegistrationId,
      provider: "fcm",
      testType: "BASIC",
      status: "SENDING",
      attemptedAt: FieldValue.serverTimestamp(),
      providerAccepted: null,
      tokenInvalidated: false,
    });
    return targetData.token;
  });

  try {
    const messageId = await boundedSend(sendFcm, fixedDeveloperTestMessage(targetToken));
    if (typeof messageId !== "string" || !messageId) {
      const error = new Error("FCM did not confirm test notification acceptance.");
      error.code = "unreadable-provider-response";
      throw error;
    }
    const result = {
      attempted: 1,
      provider: "fcm",
      providerAccepted: true,
      invalidated: false,
      status: "FCM_ACCEPTED",
    };
    const auditRecorded = await recordTestOutcome(auditReference, {
      status: result.status,
      providerAccepted: true,
      tokenInvalidated: false,
    }, logger);
    return { ...result, auditRecorded };
  } catch (error) {
    const code = safeFailureCode(error);
    const invalidToken = [
      "messaging/invalid-registration-token",
      "messaging/registration-token-not-registered",
    ].includes(code);
    let invalidated = false;
    if (invalidToken) {
      try {
        invalidated = await database.runTransaction(async (transaction) => {
          const latest = await transaction.get(targetReference);
          // Do not disable a token that was refreshed while the test was in flight.
          if (!latest.exists || latest.data()?.token !== targetToken) return false;
          transaction.update(targetReference, {
            active: false,
            invalidatedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return true;
        });
      } catch (invalidationError) {
        logger?.error?.("Developer notification test device invalidation failed.", {
          failureCode: safeFailureCode(invalidationError),
        });
      }
    }
    const result = {
      attempted: 1,
      provider: "fcm",
      providerAccepted: invalidToken ? false : null,
      invalidated,
      status: invalidToken ? "FAILED" : "UNKNOWN",
      failureCode: code,
    };
    const auditRecorded = await recordTestOutcome(auditReference, {
      status: result.status,
      providerAccepted: result.providerAccepted,
      tokenInvalidated: invalidated,
      failureCode: code,
    }, logger);
    return { ...result, auditRecorded };
  }
}

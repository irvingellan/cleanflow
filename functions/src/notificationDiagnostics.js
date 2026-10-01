const deliveryStatuses = new Set([
  "SENDING",
  "SENT",
  "PARTIAL",
  "FAILED",
  "NO_ACTIVE_DEVICES",
  "NO_ACTIVE_RECIPIENTS",
  "UNKNOWN",
]);

const deliveryProviders = new Set(["fcm", "onesignal"]);

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function safeCount(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeNullableCount(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function safeText(value, maximumLength = 240) {
  return typeof value === "string" ? value.slice(0, maximumLength) : null;
}

/**
 * Public diagnostics projection. It intentionally omits push tokens and only
 * exposes aggregate delivery outcomes, which cannot prove device display.
 */
export function buildNotificationDiagnostics({
  devices,
  deliveries,
  healthReports = [],
  reviewDeliveries = [],
  developerTests = [],
  emailsByUserId = new Map(),
}) {
  return {
    devices: devices.map(({ id, data }) => ({
      deviceId: id.slice(-8),
      // A server-owned registration handle for targeting one explicit test.
      // It is not an FCM token and cannot authorize a send by itself.
      registrationId: id,
      userEmail: emailsByUserId.get(data.userId) || null,
      platform: safeText(data.platform, 40) || "web",
      language: ["en", "pt", "es"].includes(data.language) ? data.language : null,
      active: data.active === true,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
      lastSeenAt: timestampToIso(data.lastSeenAt),
    })),
    healthReports: healthReports.map(({ id, data }) => ({
      deviceId: id.slice(-8),
      registrationId: id,
      userEmail: emailsByUserId.get(data.userId) || null,
      notificationPermission: ["granted", "denied", "default", "unsupported"].includes(data.notificationPermission)
        ? data.notificationPermission : "unsupported",
      serviceWorker: ["ready", "unavailable", "error"].includes(data.serviceWorker)
        ? data.serviceWorker : "error",
      fcmRegistration: ["registered", "missing", "error", "unsupported", "unknown"].includes(data.fcmRegistration)
        ? data.fcmRegistration : "unknown",
      platform: safeText(data.platform, 30),
      browserClass: safeText(data.browserClass, 30),
      appVersion: safeText(data.appVersion, 40),
      checkedAt: timestampToIso(data.checkedAt),
    })),
    reviewDeliveries: reviewDeliveries.map(({ data }) => ({
      eventType: ["CHECKLIST_READY_FOR_REVIEW", "CLEANER_INTERESTED", "ASSIGNMENT_CONFIRMED"].includes(data.eventType)
        ? data.eventType : "UNKNOWN",
      deliveryStatus: ["PENDING", "SENDING", "NO_ACTIVE_DEVICES", "FCM_ACCEPTED", "PARTIAL", "FAILED", "UNKNOWN"]
        .includes(data.deliveryStatus) ? data.deliveryStatus : "UNKNOWN",
      createdAt: timestampToIso(data.createdAt),
      attemptedAt: timestampToIso(data.attemptedAt),
      completedAt: timestampToIso(data.completedAt),
      targetDeviceCount: safeNullableCount(data.targetDeviceCount),
      acceptedByFcmDevices: safeNullableCount(data.acceptedByFcmDevices),
      failedDevices: safeNullableCount(data.failedDevices),
      failureCode: safeText(data.failureCode, 80),
    })),
    developerTests: developerTests.map(({ data }) => ({
      testType: data.testType === "BASIC" ? "BASIC" : "UNKNOWN",
      targetDeviceId: safeText(data.targetRegistrationId, 64)?.slice(-8) || null,
      status: ["SENDING", "FCM_ACCEPTED", "FAILED", "UNKNOWN"].includes(data.status) ? data.status : "UNKNOWN",
      attemptedAt: timestampToIso(data.attemptedAt),
      completedAt: timestampToIso(data.completedAt),
      providerAccepted: typeof data.providerAccepted === "boolean" ? data.providerAccepted : null,
      tokenInvalidated: data.tokenInvalidated === true,
      failureCode: safeText(data.failureCode, 80),
    })),
    deliveries: deliveries.map(({ data }) => ({
      reminderType: safeText(data.reminderType, 40) || "UNKNOWN",
      targetDate: safeText(data.targetDate, 20),
      timezone: safeText(data.timezone, 80),
      jobCount: safeCount(data.jobCount),
      attentionCount: safeCount(data.attentionCount),
      // Legacy FCM records predate an explicit provider field.
      deliveryProvider: deliveryProviders.has(data.deliveryProvider) ? data.deliveryProvider : "fcm",
      deliveryStatus: deliveryStatuses.has(data.deliveryStatus) ? data.deliveryStatus : "UNKNOWN",
      attemptedAt: timestampToIso(data.attemptedAt),
      sentAt: timestampToIso(data.sentAt),
      failedAt: timestampToIso(data.failedAt),
      attemptedDevices: safeCount(data.attemptedDevices),
      deliveredDevices: safeCount(data.deliveredDevices),
      failedDevices: safeCount(data.failedDevices),
      invalidatedDevices: safeCount(data.invalidatedDevices),
      attemptedRecipients: safeCount(data.attemptedRecipients),
      acceptedRecipients: safeCount(data.acceptedRecipients),
      failedRecipients: safeCount(data.failedRecipients),
      noActiveRecipients: safeCount(data.noActiveRecipients),
      failureCode: safeText(data.failureCode, 80),
      failureSummary: safeText(data.failureSummary),
    })),
  };
}

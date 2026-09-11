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

function safeText(value, maximumLength = 240) {
  return typeof value === "string" ? value.slice(0, maximumLength) : null;
}

/**
 * Public diagnostics projection. It intentionally omits push tokens and only
 * exposes aggregate delivery outcomes, which cannot prove device display.
 */
export function buildNotificationDiagnostics({ devices, deliveries, emailsByUserId = new Map() }) {
  return {
    devices: devices.map(({ id, data }) => ({
      deviceId: id.slice(-8),
      userEmail: emailsByUserId.get(data.userId) || null,
      platform: safeText(data.platform, 40) || "web",
      language: ["en", "pt", "es"].includes(data.language) ? data.language : null,
      active: data.active === true,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
      lastSeenAt: timestampToIso(data.lastSeenAt),
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

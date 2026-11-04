import { cleanerInboxTypes } from "./notificationInboxEvents.js";
import { notificationHealthErrorStages, notificationHealthErrorCodes } from "./notificationLab.js";

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

function testProjection({ data }) {
  return {
    testType: ["BASIC", "CURRENT_DEVICE"].includes(data.testType) ? data.testType : "UNKNOWN",
    targetDeviceId: safeText(data.targetRegistrationId || data.registrationId, 64)?.slice(-8) || null,
    status: ["SENDING", "FCM_ACCEPTED", "FAILED", "UNKNOWN"].includes(data.status) ? data.status : "UNKNOWN",
    attemptedAt: timestampToIso(data.attemptedAt), completedAt: timestampToIso(data.completedAt),
    providerAccepted: typeof data.providerAccepted === "boolean" ? data.providerAccepted : null,
    tokenInvalidated: data.tokenInvalidated === true, failureCode: safeText(data.failureCode, 80),
  };
}

function cleanerDeliveryProjection({ data }) {
  const stages = ["EVENT_CREATED", "RECIPIENT_SELECTED", "INBOX_STORED", "DEVICE_SELECTED",
    "PUSH_ATTEMPTED", "PROVIDER_ACCEPTED", "REJECTED", "UNKNOWN"];
  const outcomes = ["PROVIDER_ACCEPTED", "REJECTED", "UNKNOWN"];
  return {
    type: Object.values(cleanerInboxTypes).includes(data.type) ? data.type : "UNKNOWN",
    deliveryStatus: deliveryStatuses.has(data.deliveryStatus)
      || ["FCM_ACCEPTED", "STALE_EVENT", "RECIPIENT_INELIGIBLE"].includes(data.deliveryStatus)
      ? data.deliveryStatus : "UNKNOWN",
    recordedAt: timestampToIso(data.recordedAt),
    targetDeviceCount: safeNullableCount(data.targetDeviceCount),
    acceptedByFcmDevices: safeNullableCount(data.acceptedByFcmDevices),
    rejectedDevices: safeNullableCount(data.rejectedDevices),
    unknownDevices: safeNullableCount(data.unknownDevices),
    stages: Array.isArray(data.stages) ? stages.filter((stage) => data.stages.includes(stage)) : [],
    devices: Array.isArray(data.devices) ? data.devices.slice(0, 8)
      .filter((device) => typeof device?.installationKey === "string" && /^[a-f0-9]{64}$/.test(device.installationKey))
      .map((device) => ({
        installation: device.installationKey.slice(0, 12),
        registrationRevision: safeNullableCount(device.registrationRevision),
        outcome: outcomes.includes(device.outcome) ? device.outcome : "UNKNOWN",
      })) : [],
  };
}

function boundedReads(metadata) {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => ["devices", "healthReports", "deliveries", "reviewDeliveries", "developerTests", "currentDeviceTests"].includes(key)).map(([key, value]) => {
    const unordered = value.ordering === "unordered-global-sample" || value.ordering === "unordered";
    const readCap = safeNullableCount(value.readCap);
    const readCount = safeNullableCount(value.readCount);
    const capReached = readCap !== null && readCount !== null && readCount >= readCap;
    return [key, { readCap, readCount, returnedCount: safeNullableCount(value.returnedCount), capReached,
      ordering: ["unordered-global-sample", "unordered", "attemptedAt-desc"].includes(value.ordering) ? value.ordering : "unknown",
      completeness: unordered || capReached || readCap === null ? "unknown" : "complete-at-read",
      recentHistoryComplete: !unordered && !capReached && readCap !== null,
    }];
  }));
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
  currentDeviceTests = [],
  cleanerDeliveries = [],
  readMetadata = {},
  now = Date.now(),
  emailsByUserId = new Map(),
}) {
  return {
    generatedAt: new Date(now).toISOString(),
    cleanerDeliveries: cleanerDeliveries.slice(0, 20).map(cleanerDeliveryProjection),
    readMetadata: boundedReads(readMetadata),
    limitations: { providerAcceptanceProvesDisplay: false, perDeviceDeliveryHistoryAvailable: false,
      operationalHistory: "bounded-unordered-global-sample", staleSendingOutcome: "unknown-no-resend" },
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
      serviceWorker: ["ready", "unavailable", "error", "unsupported"].includes(data.serviceWorker)
        ? data.serviceWorker : "error",
      fcmRegistration: ["registered", "missing", "error", "unsupported", "unknown"].includes(data.fcmRegistration)
        ? data.fcmRegistration : "unknown",
      platform: safeText(data.platform, 30),
      browserClass: safeText(data.browserClass, 30),
      appVersion: safeText(data.appVersion, 40),
      standalone: typeof data.standalone === "boolean" ? data.standalone : null,
      fcmErrorStage: notificationHealthErrorStages.has(data.fcmErrorStage) ? data.fcmErrorStage : null,
      fcmErrorCode: notificationHealthErrorCodes.has(data.fcmErrorCode) ? data.fcmErrorCode : null,
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
      unknownDevices: safeNullableCount(data.unknownDevices),
      invalidatedDevices: safeNullableCount(data.invalidatedDevices ?? data.invalidated),
      invalidDeviceCleanupFailed: data.invalidDeviceCleanupFailed === true,
      staleSending: data.deliveryStatus === "SENDING" && Boolean(timestampToIso(data.attemptedAt))
        && now - Date.parse(timestampToIso(data.attemptedAt)) >= 5 * 60 * 1000,
      failureCode: safeText(data.failureCode, 80),
    })),
    developerTests: developerTests.map(testProjection),
    currentDeviceTests: currentDeviceTests.map(testProjection),
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
      attemptedDevices: safeNullableCount(data.attemptedDevices),
      deliveredDevices: safeNullableCount(data.deliveredDevices),
      failedDevices: safeNullableCount(data.failedDevices),
      unknownDevices: safeNullableCount(data.unknownDevices),
      invalidatedDevices: safeNullableCount(data.invalidatedDevices),
      invalidDeviceCleanupFailed: data.invalidDeviceCleanupFailed === true,
      staleSending: data.deliveryStatus === "SENDING" && Boolean(timestampToIso(data.attemptedAt))
        && now - Date.parse(timestampToIso(data.attemptedAt)) >= 5 * 60 * 1000,
      attemptedRecipients: safeNullableCount(data.attemptedRecipients),
      acceptedRecipients: safeNullableCount(data.acceptedRecipients),
      failedRecipients: safeNullableCount(data.failedRecipients),
      noActiveRecipients: safeNullableCount(data.noActiveRecipients),
      failureCode: safeText(data.failureCode, 80),
      failureSummary: safeText(data.failureSummary),
    })),
  };
}

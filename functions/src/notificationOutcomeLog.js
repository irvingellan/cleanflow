import { managerFcmFailureCode } from "./managerFcmDelivery.js";

/**
 * What a notification attempt ended as, for the Function log: counts and
 * status codes only. Never a name, a message text, a device token or an id of
 * a person, so the log can answer "was it sent?" without holding private data.
 */
const fields = [
  "deliveryStatus", "skipped", "type", "targetDate", "jobCount", "attentionCount",
  "targetDeviceCount", "attempted", "delivered", "failed", "invalidated",
  "deliveredDevices", "failedDevices", "unknownDevices", "failureCode", "auditRecorded",
  "acceptedByFcmDevices", "rejectedDevices", "invalidDeviceCleanupFailed",
];
const counters = new Set(["jobCount", "attentionCount", "targetDeviceCount", "attempted", "delivered", "failed",
  "invalidated", "deliveredDevices", "failedDevices", "unknownDevices", "acceptedByFcmDevices", "rejectedDevices"]);

export function notificationOutcomeLog(outcome) {
  const entry = {};
  for (const field of fields) {
    const value = outcome?.[field];
    if (counters.has(field)) {
      if (value === null || (Number.isSafeInteger(value) && value >= 0)) entry[field] = value;
      continue;
    }
    if (field === "failureCode" && typeof value === "string" && value.startsWith("messaging/")) {
      if (managerFcmFailureCode({ code: value }) === value) entry[field] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean"
      || (typeof value === "string" && /^[A-Za-z0-9_:.-]{1,60}$/.test(value))) entry[field] = value;
  }
  return entry;
}

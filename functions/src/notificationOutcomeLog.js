/**
 * What a notification attempt ended as, for the Function log: counts and
 * status codes only. Never a name, a message text, a device token or an id of
 * a person, so the log can answer "was it sent?" without holding private data.
 */
const fields = [
  "deliveryStatus", "skipped", "type", "targetDate", "jobCount", "attentionCount",
  "targetDeviceCount", "attempted", "delivered", "failed", "invalidated",
  "deliveredDevices", "failedDevices", "unknownDevices", "failureCode", "auditRecorded",
];

export function notificationOutcomeLog(outcome) {
  const entry = {};
  for (const field of fields) {
    const value = outcome?.[field];
    if (typeof value === "number" || typeof value === "boolean"
      || (typeof value === "string" && /^[A-Za-z0-9_:.-]{1,60}$/.test(value))) entry[field] = value;
  }
  return entry;
}

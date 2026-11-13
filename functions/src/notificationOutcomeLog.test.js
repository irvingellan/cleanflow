import { describe, expect, it } from "vitest";
import { notificationOutcomeLog } from "./notificationOutcomeLog.js";

describe("notification outcome log entry", () => {
  it("keeps counts and status codes and drops everything else", () => {
    expect(notificationOutcomeLog({
      deliveryStatus: "PARTIAL", targetDeviceCount: 3, failedDevices: 1, type: "TODAY_07", targetDate: "2026-11-11",
      auditRecorded: true, cleanerName: "Private Name", token: "device-token-value", body: "Free text with spaces",
      failureCode: "messaging/registration-token-not-registered with extra words", nested: { deliveryStatus: "X" },
    })).toEqual({
      deliveryStatus: "PARTIAL", targetDeviceCount: 3, failedDevices: 1, type: "TODAY_07", targetDate: "2026-11-11", auditRecorded: true,
    });
  });
  it("is an empty entry for a missing outcome", () => {
    expect(notificationOutcomeLog(undefined)).toEqual({});
    expect(notificationOutcomeLog({ skipped: "already-claimed-or-invalid" })).toEqual({ skipped: "already-claimed-or-invalid" });
  });
});

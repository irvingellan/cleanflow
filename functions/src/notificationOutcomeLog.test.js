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
  it("preserves actual provider acceptance, rejection and unknown counts", () => {
    expect(notificationOutcomeLog({ deliveryStatus: "PARTIAL", acceptedByFcmDevices: 2,
      rejectedDevices: 1, unknownDevices: 1, invalidDeviceCleanupFailed: true,
      devices: [{ token: "never-log-this" }], stages: ["private-untrusted-text"],
    })).toEqual({ deliveryStatus: "PARTIAL", acceptedByFcmDevices: 2,
      rejectedDevices: 1, unknownDevices: 1, invalidDeviceCleanupFailed: true });
  });
  it("keeps allowlisted FCM codes while excluding arbitrary slash strings", () => {
    expect(notificationOutcomeLog({ failureCode: "messaging/quota-exceeded" }))
      .toEqual({ failureCode: "messaging/quota-exceeded" });
    expect(notificationOutcomeLog({ failureCode: "messaging/private-device-token" })).toEqual({});
  });
  it("represents unknown counters as null and rejects invalid counters", () => {
    expect(notificationOutcomeLog({ acceptedByFcmDevices: null, failedDevices: null,
      unknownDevices: 2, attempted: Infinity, delivered: NaN, failed: -1, invalidated: 0.5 }))
      .toEqual({ acceptedByFcmDevices: null, failedDevices: null, unknownDevices: 2 });
  });
});

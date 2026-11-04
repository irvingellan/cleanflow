import { describe, expect, it } from "vitest";
import { buildNotificationDiagnostics } from "./notificationDiagnostics.js";

const timestamp = (iso) => ({ toDate: () => new Date(iso) });

describe("notification diagnostics projection", () => {
  it("separates active from eligible, joins attempts by full installation and omits Inbox details", () => {
    const first = "a".repeat(56) + "11111111";
    const second = "b".repeat(56) + "11111111";
    const result = buildNotificationDiagnostics({
      viewerUserId: "manager",
      emailsByUserId: new Map([["manager", "synthetic@example.test"]]),
      devices: [first, second].map((id) => ({ id, data: { userId: "manager", active: true, token: "private-token" } })),
      eligibleRegistrationIds: new Set([first]),
      deliveries: [],
      currentDeviceTests: [
        { data: { registrationId: first, status: "UNKNOWN", attemptedAt: timestamp("2026-11-03T10:00:00Z") } },
        { data: { registrationId: second, status: "FCM_ACCEPTED", attemptedAt: timestamp("2026-11-03T09:00:00Z") } },
      ],
      latestInbox: { state: "available", item: { type: "TODAY_07", createdAtMs: 10, read: false, openable: true,
        serviceLabel: "private-property", id: "private-event" } },
    });
    expect(result.viewerAccount).toBe("synthetic@example.test");
    expect(result.devices).toEqual([
      expect.objectContaining({ active: true, eligible: true, isCurrentAccount: true, latestTest: expect.objectContaining({ status: "UNKNOWN" }) }),
      expect.objectContaining({ active: true, eligible: false, isCurrentAccount: true, latestTest: expect.objectContaining({ status: "FCM_ACCEPTED" }) }),
    ]);
    expect(result.latestInbox).toEqual({ state: "available", type: "TODAY_07", createdAtMs: 10, read: false, openable: true });
    expect(JSON.stringify(result)).not.toMatch(/private-token|private-property|private-event/);
  });

  it("shows bounded cleaner delivery evidence without identity, token, or display claims", () => {
    const { cleanerDeliveries } = buildNotificationDiagnostics({
      devices: [], deliveries: [],
      cleanerDeliveries: [{ data: {
        type: "NEW_OFFER", deliveryStatus: "PARTIAL", acceptedByFcmDevices: 1, unknownDevices: 1,
        stages: ["EVENT_CREATED", "PROVIDER_ACCEPTED", "DISPLAYED", "untrusted"],
        cleanerId: "private-cleaner", token: "private-token",
        devices: [{ installationKey: "a".repeat(64), outcome: "UNKNOWN", token: "private-token" }],
      } }],
    });
    expect(cleanerDeliveries).toEqual([expect.objectContaining({
      type: "NEW_OFFER", deliveryStatus: "PARTIAL", acceptedByFcmDevices: 1, unknownDevices: 1,
      stages: ["EVENT_CREATED", "PROVIDER_ACCEPTED"],
      devices: [expect.objectContaining({ installation: "aaaaaaaaaaaa", outcome: "UNKNOWN" })],
    })]);
    expect(JSON.stringify(cleanerDeliveries)).not.toMatch(/private-|DISPLAYED|untrusted/);
  });
  it("reads the existing operational invalidated field and marks stale SENDING as indeterminate", () => {
    const result = buildNotificationDiagnostics({ devices: [], deliveries: [], now: Date.parse("2026-11-03T10:00:00Z"),
      reviewDeliveries: [{ data: { deliveryStatus: "SENDING", invalidated: 2, attemptedAt: timestamp("2026-11-03T09:00:00Z") } }],
    });
    expect(result.reviewDeliveries[0]).toMatchObject({ invalidatedDevices: 2, staleSending: true, acceptedByFcmDevices: null });
  });
  it("preserves unknown counts, failure enums, standalone, current-device tests and bounded-read caveats", () => {
    const diagnostics = buildNotificationDiagnostics({ devices: [], deliveries: [{ data: { deliveryStatus: "UNKNOWN" } }],
      healthReports: [{ id: "a".repeat(64), data: { standalone: true, serviceWorker: "unsupported", fcmErrorStage: "worker", fcmErrorCode: "timeout" } }],
      currentDeviceTests: [{ data: { status: "UNKNOWN", providerAccepted: null, token: "private-token" } }],
      reviewDeliveries: [{ data: { deliveryStatus: "PARTIAL", unknownDevices: 1, invalidDeviceCleanupFailed: true } }],
      readMetadata: { reviewDeliveries: { readCount: 100, readCap: 100, returnedCount: 1, ordering: "unordered-global-sample" } },
    });
    expect(diagnostics.deliveries[0]).toMatchObject({ deliveredDevices: null, failedDevices: null, unknownDevices: null });
    expect(diagnostics.healthReports[0]).toMatchObject({ standalone: true, serviceWorker: "unsupported", fcmErrorStage: "worker", fcmErrorCode: "timeout" });
    expect(diagnostics.currentDeviceTests[0]).toMatchObject({ status: "UNKNOWN", providerAccepted: null });
    expect(diagnostics.reviewDeliveries[0]).toMatchObject({ unknownDevices: 1, invalidDeviceCleanupFailed: true });
    expect(diagnostics.readMetadata.reviewDeliveries).toMatchObject({ readCap: 100, capReached: true, completeness: "unknown", recentHistoryComplete: false });
    expect(JSON.stringify(diagnostics)).not.toContain("private-token");
  });
  it("allowlists all three operational event types without exposing event context or tokens", () => {
    const eventTypes = ["CHECKLIST_READY_FOR_REVIEW", "CLEANER_INTERESTED", "ASSIGNMENT_CONFIRMED", "PRIVATE_EVENT"];
    const projection = buildNotificationDiagnostics({ devices: [], deliveries: [],
      reviewDeliveries: eventTypes.map((eventType) => ({ data: {
        eventType, deliveryStatus: "PARTIAL", targetDeviceCount: 2, acceptedByFcmDevices: 1,
        failedDevices: 1, cleanerId: "private-cleaner", offerId: "private-offer", token: "private-token",
      } })),
    });
    expect(projection.reviewDeliveries.map((item) => item.eventType)).toEqual([...eventTypes.slice(0, 3), "UNKNOWN"]);
    expect(JSON.stringify(projection)).not.toMatch(/private-cleaner|private-offer|private-token/);
  });
  it("returns safe active and legacy device metadata without FCM tokens", () => {
    const diagnostics = buildNotificationDiagnostics({
      devices: [
        {
          id: "stable-document-hash-12345678",
          data: {
            userId: "manager-uid",
            token: "must-never-reach-the-browser",
            platform: "web",
            language: "pt",
            active: true,
            createdAt: timestamp("2026-09-10T14:00:00.000Z"),
          },
        },
        { id: "legacy-device-abcdefgh", data: { userId: "legacy-uid", active: false } },
      ],
      deliveries: [],
      emailsByUserId: new Map([["manager-uid", "manager@example.test"]]),
    });

    expect(diagnostics.devices).toEqual([
      expect.objectContaining({ deviceId: "12345678", userEmail: "manager@example.test", active: true }),
      expect.objectContaining({ deviceId: "abcdefgh", userEmail: null, platform: "web", active: false }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("must-never-reach-the-browser");
  });

  it("returns only aggregate reminder delivery outcomes and handles empty diagnostics", () => {
    const diagnostics = buildNotificationDiagnostics({
      devices: [],
      deliveries: [{
        data: {
          reminderType: "TODAY_07",
          targetDate: "2026-09-10",
          timezone: "America/Los_Angeles",
          jobCount: 3,
          attentionCount: 1,
          deliveryStatus: "PARTIAL",
          attemptedDevices: 3,
          deliveredDevices: 1,
          failedDevices: 2,
          invalidatedDevices: 1,
          failureSummary: "Some manager devices did not confirm FCM delivery.",
        },
      }],
    });

    expect(diagnostics.devices).toEqual([]);
    expect(diagnostics.deliveries[0]).toMatchObject({
      deliveryProvider: "fcm",
      deliveryStatus: "PARTIAL",
      attemptedDevices: 3,
      deliveredDevices: 1,
      failedDevices: 2,
      invalidatedDevices: 1,
    });
  });

  it("keeps OneSignal recipient outcomes distinct from legacy FCM device counts", () => {
    const diagnostics = buildNotificationDiagnostics({
      devices: [],
      deliveries: [{
        data: {
          reminderType: "TOMORROW_19",
          targetDate: "2026-09-11",
          timezone: "America/Los_Angeles",
          deliveryProvider: "onesignal",
          deliveryStatus: "PARTIAL",
          attemptedRecipients: 2,
          acceptedRecipients: 1,
          failedRecipients: 0,
          noActiveRecipients: 1,
        },
      }],
    });

    expect(diagnostics.deliveries[0]).toMatchObject({
      deliveryProvider: "onesignal",
      deliveryStatus: "PARTIAL",
      attemptedRecipients: 2,
      acceptedRecipients: 1,
      noActiveRecipients: 1,
      attemptedDevices: null,
    });
  });

  it("projects coarse health, review outcomes, and test audit without tokens or operational data", () => {
    const diagnostics = buildNotificationDiagnostics({
      devices: [{ id: "a".repeat(64), data: { userId: "manager-uid", token: "private-fcm-token", active: true } }],
      deliveries: [],
      healthReports: [{ id: "a".repeat(64), data: {
        userId: "manager-uid", notificationPermission: "denied", serviceWorker: "ready",
        fcmRegistration: "missing", platform: "web", browserClass: "mobile",
        appVersion: "v1", checkedAt: timestamp("2026-09-29T20:00:00.000Z"),
        token: "private-fcm-token", jobId: "private-job",
      } }],
      reviewDeliveries: [{ data: {
        eventType: "CHECKLIST_READY_FOR_REVIEW", deliveryStatus: "NO_ACTIVE_DEVICES",
        targetDeviceCount: 0, acceptedByFcmDevices: 0, failedDevices: 0,
        createdAt: timestamp("2026-09-29T20:00:00.000Z"), jobId: "private-job",
      } }],
      developerTests: [{ data: {
        testType: "BASIC", targetRegistrationId: "a".repeat(64), status: "FCM_ACCEPTED",
        providerAccepted: true, tokenInvalidated: false, token: "private-fcm-token",
      } }],
    });

    expect(diagnostics.devices[0].registrationId).toBe("a".repeat(64));
    expect(diagnostics.healthReports[0]).toMatchObject({ notificationPermission: "denied", fcmRegistration: "missing" });
    expect(diagnostics.reviewDeliveries[0]).toMatchObject({ deliveryStatus: "NO_ACTIVE_DEVICES", targetDeviceCount: 0 });
    expect(diagnostics.developerTests[0]).toMatchObject({ status: "FCM_ACCEPTED", providerAccepted: true, targetDeviceId: "aaaaaaaa" });
    expect(JSON.stringify(diagnostics)).not.toMatch(/private-fcm-token|private-job/);
  });
});

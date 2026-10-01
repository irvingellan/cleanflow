import { describe, expect, it } from "vitest";
import { buildNotificationDiagnostics } from "./notificationDiagnostics.js";

const timestamp = (iso) => ({ toDate: () => new Date(iso) });

describe("notification diagnostics projection", () => {
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
      attemptedDevices: 0,
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

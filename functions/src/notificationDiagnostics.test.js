import { describe, expect, it } from "vitest";
import { buildNotificationDiagnostics } from "./notificationDiagnostics.js";

const timestamp = (iso) => ({ toDate: () => new Date(iso) });

describe("notification diagnostics projection", () => {
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
});

import { describe, expect, it, vi } from "vitest";
import {
  dispatchManagerReminder,
  managerReminderDeliveryAuditFields,
  managerReminderProvider,
  managerReminderProviders,
  oneSignalMessageRequest,
  oneSignalRecipientGroups,
  oneSignalRecipientsFromManagerDevices,
  oneSignalRequestTimeoutMs,
  sendOneSignalManagerReminder,
  summarizeOneSignalReminderDelivery,
  unknownManagerReminderDeliveryAuditFields,
  validateOneSignalLaunchUrl,
  validateOneSignalReminderConfiguration,
} from "./managerReminderTransport.js";
import { managerReminderTypes } from "./managerReminders.js";

const reminder = {
  type: managerReminderTypes.TODAY_07,
  targetDate: "2026-09-12",
  jobCount: 3,
  attentionCount: 1,
};
const launchUrl = "https://clean-flow-prototipo.web.app/";

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
});

describe("manager reminder transports", () => {
  it("keeps FCM as the default and selects OneSignal only explicitly", () => {
    expect(managerReminderProvider()).toBe(managerReminderProviders.FCM);
    expect(managerReminderProvider("unexpected")).toBe(managerReminderProviders.FCM);
    expect(managerReminderProvider("onesignal")).toBe(managerReminderProviders.ONESIGNAL);
  });

  it("deduplicates Firebase Auth UIDs and uses the most recently registered language", () => {
    const recipients = oneSignalRecipientsFromManagerDevices([
      { userId: "uid-b", active: true, language: "en", updatedAt: 10 },
      { userId: "uid-a", active: true, language: "pt", updatedAt: 20 },
      { userId: "uid-b", active: true, language: "es", updatedAt: 30 },
      { userId: "ignored-inactive", active: false, language: "en", updatedAt: 40 },
      { active: true, language: "en" },
    ]);

    expect(recipients).toEqual([
      { userId: "uid-a", language: "pt", updatedAt: 20 },
      { userId: "uid-b", language: "es", updatedAt: 30 },
    ]);
    expect(oneSignalRecipientGroups(recipients)).toEqual([
      { language: "pt", externalIds: ["uid-a"] },
      { language: "es", externalIds: ["uid-b"] },
    ]);
  });

  it("requires an explicit approved HTTPS CleanFlow Hosting launch URL", () => {
    expect(validateOneSignalLaunchUrl(launchUrl, "clean-flow-prototipo")).toBe(launchUrl);
    expect(validateOneSignalLaunchUrl("https://clean-flow-prototipo.firebaseapp.com", "clean-flow-prototipo"))
      .toBe("https://clean-flow-prototipo.firebaseapp.com/");
    expect(() => validateOneSignalLaunchUrl("", "clean-flow-prototipo"))
      .toThrow(/not configured/i);
    expect(() => validateOneSignalLaunchUrl("/", "clean-flow-prototipo"))
      .toThrow(/invalid/i);
    expect(() => validateOneSignalLaunchUrl("http://clean-flow-prototipo.web.app/", "clean-flow-prototipo"))
      .toThrow(/approved/i);
    expect(() => validateOneSignalLaunchUrl("https://unrelated.example/", "clean-flow-prototipo"))
      .toThrow(/approved/i);
    expect(() => validateOneSignalLaunchUrl("https://clean-flow-prototipo.web.app/jobs", "clean-flow-prototipo"))
      .toThrow(/approved/i);
  });

  it("fails OneSignal configuration before dispatch when the selected transport is incomplete", () => {
    expect(() => validateOneSignalReminderConfiguration({
      appId: "app-id",
      restApiKey: "key",
      launchUrl: "",
      projectId: "clean-flow-prototipo",
    })).toThrow(/launch URL is not configured/i);
    expect(() => validateOneSignalReminderConfiguration({
      appId: "",
      restApiKey: "key",
      launchUrl,
      projectId: "clean-flow-prototipo",
    })).toThrow(/not configured/i);
  });

  it("targets Firebase Auth UIDs as OneSignal External IDs with localized count-only payloads", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(response({ id: "message-pt" }))
      .mockResolvedValueOnce(response({ id: "message-en" }));

    const delivery = await sendOneSignalManagerReminder({
      reminder,
      managerDevices: [
        { userId: "manager-pt", active: true, language: "pt", updatedAt: 2 },
        { userId: "manager-en", active: true, language: "en", updatedAt: 1 },
      ],
      appId: "onesignal-app-id",
      restApiKey: "server-only-api-key",
      launchUrl,
      fetchImplementation,
    });

    expect(delivery).toMatchObject({
      provider: "onesignal",
      attemptedRecipients: 2,
      acceptedRecipients: 2,
      failedRecipients: 0,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);

    const requests = fetchImplementation.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        include_aliases: { external_id: ["manager-pt"] },
        target_channel: "push",
        headings: { en: "☀️ Hoje: 3 limpezas" },
        contents: { en: "1 precisa de atenção. Toque para revisar no CleanFlow." },
        url: launchUrl,
      }),
      expect.objectContaining({
        include_aliases: { external_id: ["manager-en"] },
        headings: { en: "☀️ Today: 3 cleanings" },
      }),
    ]));
    expect(JSON.stringify(requests)).not.toContain("server-only-api-key");
  });

  it("records only confirmed OneSignal request outcomes", async () => {
    const successful = await sendOneSignalManagerReminder({
      reminder,
      managerDevices: [{ userId: "manager", active: true, language: "en" }],
      appId: "app-id",
      restApiKey: "key",
      launchUrl,
      fetchImplementation: vi.fn().mockResolvedValue(response({ id: "message" })),
    });
    expect(summarizeOneSignalReminderDelivery(successful)).toMatchObject({ deliveryStatus: "SENT" });

    const noRecipient = await sendOneSignalManagerReminder({
      reminder,
      managerDevices: [],
      appId: "app-id",
      restApiKey: "key",
      launchUrl,
      fetchImplementation: vi.fn(),
    });
    expect(summarizeOneSignalReminderDelivery(noRecipient)).toMatchObject({
      deliveryStatus: "NO_ACTIVE_RECIPIENTS",
    });

    const partial = await sendOneSignalManagerReminder({
      reminder,
      managerDevices: [
        { userId: "manager-en", active: true, language: "en" },
        { userId: "manager-pt", active: true, language: "pt" },
      ],
      appId: "app-id",
      restApiKey: "key",
      launchUrl,
      fetchImplementation: vi
        .fn()
        .mockResolvedValueOnce(response({ id: "message" }))
        .mockResolvedValueOnce(response({ error: "bad request" }, 400)),
    });
    expect(summarizeOneSignalReminderDelivery(partial)).toMatchObject({ deliveryStatus: "PARTIAL" });

    const failed = await sendOneSignalManagerReminder({
      reminder,
      managerDevices: [{ userId: "manager", active: true, language: "en" }],
      appId: "app-id",
      restApiKey: "key",
      launchUrl,
      fetchImplementation: vi.fn().mockResolvedValue(response({ error: "bad request" }, 400)),
    });
    expect(summarizeOneSignalReminderDelivery(failed)).toMatchObject({ deliveryStatus: "FAILED" });
  });

  it.each([
    ["HTTP 429", response({ errors: ["rate limited"] }, 429), "http-429"],
    ["HTTP 5xx", response({ errors: ["temporary provider failure"] }, 503), "http-503"],
    ["malformed success", { ok: true, status: 200, json: vi.fn().mockRejectedValue(new Error("invalid JSON")) }, "malformed-success-response"],
    ["success without a verified message id", response({ errors: ["No subscriptions"] }), "missing-message-id"],
  ])("treats %s as an ambiguous outcome without retry", async (_label, providerResponse, expectedCode) => {
    const fetchImplementation = vi.fn().mockResolvedValue(providerResponse);

    await expect(sendOneSignalManagerReminder({
      reminder,
      managerDevices: [{ userId: "manager", active: true, language: "en" }],
      appId: "app-id",
      restApiKey: "key",
      launchUrl,
      fetchImplementation,
    })).rejects.toMatchObject({
      code: expectedCode,
      managerReminderProvider: "onesignal",
      managerReminderAttemptedRecipients: 1,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("bounds a stalled OneSignal request and records it as ambiguous", async () => {
    vi.useFakeTimers();
    try {
      const fetchImplementation = vi.fn((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }));

      const delivery = sendOneSignalManagerReminder({
        reminder,
        managerDevices: [{ userId: "manager", active: true, language: "en" }],
        appId: "app-id",
        restApiKey: "key",
        launchUrl,
        fetchImplementation,
        requestTimeoutMs: 25,
      });
      const expectedRejection = expect(delivery).rejects.toMatchObject({
        code: "onesignal-timeout",
        managerReminderProvider: "onesignal",
      });
      await vi.advanceTimersByTimeAsync(25);

      await expectedRejection;
      expect(fetchImplementation).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the documented bounded server request timeout", () => {
    expect(oneSignalRequestTimeoutMs).toBe(15_000);
    expect(oneSignalMessageRequest({
      appId: "app-id",
      externalIds: ["manager"],
      payload: { eventId: "event", eventType: "MANAGER_REMINDER", link: "/" },
      launchUrl,
    }).url).toBe(launchUrl);
    expect(() => oneSignalMessageRequest({
      appId: "app-id",
      externalIds: ["manager"],
      payload: { eventId: "event", eventType: "MANAGER_REMINDER", link: "/" },
      launchUrl: "/",
    })).toThrow(/absolute HTTPS/i);
  });

  it("never falls back to FCM after an ambiguous OneSignal transport failure", async () => {
    const sendFcm = vi.fn();
    const sendOneSignal = vi.fn().mockRejectedValue(new Error("network connection closed"));

    await expect(dispatchManagerReminder({
      provider: managerReminderProviders.ONESIGNAL,
      reminder,
      sendFcm,
      sendOneSignal,
    })).rejects.toThrow("network connection closed");

    expect(sendOneSignal).toHaveBeenCalledWith(reminder);
    expect(sendFcm).not.toHaveBeenCalled();
  });

  it("continues to dispatch FCM unchanged when the default provider is selected", async () => {
    const sendFcm = vi.fn().mockResolvedValue({ provider: "fcm" });
    const sendOneSignal = vi.fn();

    await dispatchManagerReminder({
      provider: managerReminderProviders.FCM,
      reminder,
      sendFcm,
      sendOneSignal,
    });

    expect(sendFcm).toHaveBeenCalledWith(reminder);
    expect(sendOneSignal).not.toHaveBeenCalled();
  });

  it("keeps provider-specific audit fields unambiguous without exposing recipients", () => {
    const success = managerReminderDeliveryAuditFields({
      provider: "onesignal",
      attemptedRecipients: 2,
      acceptedRecipients: 1,
      failedRecipients: 0,
      noActiveRecipients: 1,
    }, { deliveryStatus: "PARTIAL", failureSummary: "Some manager recipients did not confirm OneSignal acceptance." });
    expect(success).toEqual(expect.objectContaining({
      deliveryProvider: "onesignal",
      attemptedRecipients: 2,
      acceptedRecipients: 1,
      noActiveRecipients: 1,
    }));
    expect(JSON.stringify(success)).not.toContain("manager-");

    const ambiguous = unknownManagerReminderDeliveryAuditFields({
      managerReminderProvider: "onesignal",
      managerReminderAttemptedRecipients: 2,
      managerReminderAcceptedRecipients: 1,
      code: "network-error",
    });
    expect(ambiguous).toMatchObject({
      deliveryProvider: "onesignal",
      attemptedRecipients: 2,
      acceptedRecipients: 1,
      failureSummary: "OneSignal request outcome was not confirmed.",
    });
  });
});

import { createHash, webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLocalNotificationHealth } from "./notificationHealthService.js";

const cache = vi.hoisted(() => ({ getCachedFcmRegistrationDiagnostic: vi.fn() }));
vi.mock("./notificationService.js", () => ({ getCachedFcmRegistrationState: () => cache.getCachedFcmRegistrationDiagnostic()?.state, getCachedFcmRegistrationDiagnostic: cache.getCachedFcmRegistrationDiagnostic }));

function environment(overrides = {}) {
  const getRegistration = vi.fn(async () => ({ scope: "https://synthetic.example/firebase-messaging-push/", active: { scriptURL: "https://synthetic.example/firebase-messaging-sw.js" } }));
  const register = vi.fn();
  const requestPermission = vi.fn();
  return {
    location: { origin: "https://synthetic.example" },
    Notification: { permission: "denied", requestPermission },
    navigator: { userAgent: "Mozilla/5.0 (iPhone) Safari/605.1", platform: "iPhone", serviceWorker: { getRegistration, register } },
    localStorage: { getItem: vi.fn(() => "local-device-12345678"), setItem: vi.fn() },
    matchMedia: vi.fn(() => ({ matches: true })),
    ...overrides,
  };
}

describe("readLocalNotificationHealth", () => {
  beforeEach(() => { cache.getCachedFcmRegistrationDiagnostic.mockReturnValue({ state: "unknown", stage: null, code: null }); });

  it("reads coarse browser state without requesting permission, registering, or exposing a token", async () => {
    const browser = environment();
    const snapshot = await readLocalNotificationHealth(browser);

    expect(snapshot).toMatchObject({
      deviceId: "local-device-12345678", notificationPermission: "denied", serviceWorker: "ready",
      fcmRegistration: "unknown", platform: "ios", browserClass: "safari", standalone: true,
    });
    expect(browser.navigator.serviceWorker.getRegistration).toHaveBeenCalledWith("/firebase-messaging-push/");
    expect(browser.navigator.serviceWorker.register).not.toHaveBeenCalled();
    expect(browser.Notification.requestPermission).not.toHaveBeenCalled();
    expect(browser.localStorage.setItem).not.toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).not.toMatch(/token|job|property|client|cleaner/i);
  });

  it("correlates only this account and installation, including an iPad in desktop mode", async () => {
    const browser = environment({ crypto: webcrypto });
    browser.navigator.userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1";
    browser.navigator.platform = "MacIntel";
    browser.navigator.maxTouchPoints = 5;
    const health = await readLocalNotificationHealth(browser, { userId: "synthetic-manager" });
    expect(health.platform).toBe("ios");
    expect(health.registrationId).toBe(createHash("sha256").update("synthetic-manager:local-device-12345678").digest("hex"));
    const other = await readLocalNotificationHealth(browser, { userId: "other-synthetic-manager" });
    expect(other.registrationId).not.toBe(health.registrationId);
  });

  it("treats unknown cached FCM state as unverified rather than missing", async () => {
    const browser = environment({
      navigator: { userAgent: "", platform: "", serviceWorker: { getRegistration: vi.fn(async () => null) } },
      matchMedia: vi.fn(() => { throw new Error("blocked"); }),
    });
    const snapshot = await readLocalNotificationHealth(browser);
    expect(snapshot).toMatchObject({ serviceWorker: "unavailable", fcmRegistration: "unknown", standalone: false });
  });

  it("does not call a stale cached registration ready after permission was denied", async () => {
    cache.getCachedFcmRegistrationDiagnostic.mockReturnValue({ state: "registered", stage: null, code: null });
    const snapshot = await readLocalNotificationHealth(environment());
    expect(snapshot).toMatchObject({ notificationPermission: "denied", fcmRegistration: "unknown" });
  });

  it("bounds a stalled service-worker check", async () => {
    vi.useFakeTimers();
    try {
      const browser = environment({ navigator: { userAgent: "", platform: "", serviceWorker: { getRegistration: vi.fn(() => new Promise(() => {})) } } });
      const pending = readLocalNotificationHealth(browser);
      await vi.advanceTimersByTimeAsync(2_000);
      expect((await pending).serviceWorker).toBe("error");
    } finally {
      vi.useRealTimers();
    }
  });
  it("rejects root scope and wrong script workers in the passive health projection", async () => {
    const browser = environment();
    browser.navigator.serviceWorker.getRegistration.mockResolvedValue({ scope: "https://synthetic.example/", active: { scriptURL: "https://synthetic.example/sw.js" } });
    const snapshot = await readLocalNotificationHealth(browser);
    expect(snapshot).toMatchObject({ serviceWorker: "unavailable", readiness: { worker: "mismatch", delivery: "UNKNOWN" } });
  });

  it("projects only safe current failure fields", async () => {
    cache.getCachedFcmRegistrationDiagnostic.mockReturnValue({ state: "error", stage: "token", code: "timeout", token: "must-not-project" });
    const browser = environment(); browser.Notification.permission = "granted";
    expect(await readLocalNotificationHealth(browser)).toMatchObject({ fcmRegistration: "error", fcmErrorStage: "token", fcmErrorCode: "timeout" });
  });

});

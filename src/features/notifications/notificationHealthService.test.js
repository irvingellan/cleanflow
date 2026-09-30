import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLocalNotificationHealth } from "./notificationHealthService.js";

const cache = vi.hoisted(() => ({ getCachedFcmRegistrationState: vi.fn() }));
vi.mock("./notificationService.js", () => ({ getCachedFcmRegistrationState: cache.getCachedFcmRegistrationState }));

function environment(overrides = {}) {
  const getRegistration = vi.fn(async () => ({ active: {} }));
  const register = vi.fn();
  const requestPermission = vi.fn();
  return {
    Notification: { permission: "denied", requestPermission },
    navigator: { userAgent: "Mozilla/5.0 (iPhone) Safari/605.1", platform: "iPhone", serviceWorker: { getRegistration, register } },
    localStorage: { getItem: vi.fn(() => "local-device-12345678"), setItem: vi.fn() },
    matchMedia: vi.fn(() => ({ matches: true })),
    ...overrides,
  };
}

describe("readLocalNotificationHealth", () => {
  beforeEach(() => { cache.getCachedFcmRegistrationState.mockReturnValue("unknown"); });

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

  it("treats unknown cached FCM state as unverified rather than missing", async () => {
    const browser = environment({
      navigator: { userAgent: "", platform: "", serviceWorker: { getRegistration: vi.fn(async () => null) } },
      matchMedia: vi.fn(() => { throw new Error("blocked"); }),
    });
    const snapshot = await readLocalNotificationHealth(browser);
    expect(snapshot).toMatchObject({ serviceWorker: "unavailable", fcmRegistration: "unknown", standalone: false });
  });

  it("does not call a stale cached registration ready after permission was denied", async () => {
    cache.getCachedFcmRegistrationState.mockReturnValue("registered");
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
});

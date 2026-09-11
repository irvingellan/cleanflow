import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const oneSignal = {
  init: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  Notifications: { requestPermission: vi.fn() },
  User: { PushSubscription: { optedIn: false, id: null, optIn: vi.fn() } },
};

vi.mock("react-onesignal", () => ({ default: oneSignal }));

async function loadService(appId = "test-app-id") {
  vi.resetModules();
  vi.stubEnv("VITE_ONESIGNAL_APP_ID", appId);
  return import("./oneSignalService.js");
}

describe("oneSignalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.getElementById("onesignal-sdk")?.remove();
    oneSignal.init.mockResolvedValue(undefined);
    oneSignal.login.mockResolvedValue(undefined);
    oneSignal.logout.mockResolvedValue(undefined);
    oneSignal.Notifications.requestPermission.mockResolvedValue(undefined);
    oneSignal.User.PushSubscription = { optedIn: false, id: null, optIn: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("is feature-gated when the App ID is absent", async () => {
    const service = await loadService("");

    expect(service.oneSignalAvailable()).toBe(false);
    expect(await service.initializeOneSignal()).toBeNull();
    expect(oneSignal.init).not.toHaveBeenCalled();
  });

  it("initializes once under duplicate calls and uses the isolated worker scope", async () => {
    const service = await loadService();

    await Promise.all([service.initializeOneSignal(), service.initializeOneSignal()]);

    expect(oneSignal.init).toHaveBeenCalledTimes(1);
    expect(oneSignal.init).toHaveBeenCalledWith(expect.objectContaining({
      appId: "test-app-id",
      serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
      serviceWorkerParam: { scope: "/onesignal/" },
      welcomeNotification: { disable: true },
    }));
  });

  it("associates only the authenticated Firebase UID and does not request permission automatically", async () => {
    const service = await loadService();

    await service.associateOneSignalUser("firebase-user-uid");

    expect(oneSignal.login).toHaveBeenCalledWith("firebase-user-uid");
    expect(oneSignal.Notifications.requestPermission).not.toHaveBeenCalled();
    expect(oneSignal.init.mock.calls[0][0]).not.toHaveProperty("tags");
  });

  it("uses OneSignal optIn only from the explicit enable path", async () => {
    const service = await loadService();
    oneSignal.User.PushSubscription = { optedIn: true, id: "subscription-12345678", optIn: vi.fn().mockResolvedValue(undefined) };

    const state = await service.requestOneSignalSubscription("firebase-user-uid");

    expect(oneSignal.User.PushSubscription.optIn).toHaveBeenCalledOnce();
    expect(oneSignal.Notifications.requestPermission).not.toHaveBeenCalled();
    expect(oneSignal.login).toHaveBeenCalledWith("firebase-user-uid");
    expect(state).toMatchObject({ initialized: true, optedIn: true, subscriptionId: "12345678" });
  });

  it("returns an unsubscribed state instead of treating permission as full registration", async () => {
    const service = await loadService();

    await expect(service.oneSignalSubscriptionState()).resolves.toMatchObject({
      initialized: true,
      optedIn: false,
      state: "not-subscribed",
    });
  });

  it("clears the OneSignal identity on sign out without exposing a subscription token", async () => {
    const service = await loadService();
    await service.associateOneSignalUser("firebase-user-uid");
    await service.clearOneSignalUser();

    expect(oneSignal.logout).toHaveBeenCalledOnce();
    const state = await service.oneSignalSubscriptionState();
    expect(state).not.toHaveProperty("token");
  });

  it("reports the isolated worker as registered without registering another worker", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue({ scope: "https://clean-flow-prototipo.web.app/onesignal/" }),
      },
    });
    const service = await loadService();

    await expect(service.oneSignalWorkerState()).resolves.toEqual({ state: "registered" });
    expect(navigator.serviceWorker.getRegistration).toHaveBeenCalledWith("/onesignal/");
  });

  it("settles a non-resolving OneSignal initialization as an error instead of loading forever", async () => {
    vi.useFakeTimers();
    oneSignal.init.mockImplementation(() => new Promise(() => {}));
    const service = await loadService();

    const initialization = service.initializeOneSignal();
    const rejection = expect(initialization).rejects.toMatchObject({
      oneSignalStage: "initialization",
      oneSignalCode: "timeout",
    });
    await vi.advanceTimersByTimeAsync(4_000);

    await rejection;
  });

  it("identifies a stalled SDK script separately from a later initialization timeout", async () => {
    vi.useFakeTimers();
    oneSignal.init.mockImplementation(() => {
      const script = document.createElement("script");
      script.id = "onesignal-sdk";
      document.head.appendChild(script);
      return new Promise(() => {});
    });
    const service = await loadService();

    const initialization = service.initializeOneSignal();
    const rejection = expect(initialization).rejects.toMatchObject({
      oneSignalStage: "sdkLoad",
      oneSignalCode: "timeout",
    });
    await vi.advanceTimersByTimeAsync(4_000);

    await rejection;
  });

  it("reports a safe opt-in stage when the explicit Safari activation fails", async () => {
    const service = await loadService();
    oneSignal.User.PushSubscription.optIn.mockRejectedValue(new Error("native prompt unavailable"));

    await expect(service.requestOneSignalSubscription("firebase-user-uid")).rejects.toMatchObject({
      oneSignalStage: "subscriptionOptIn",
      oneSignalCode: "failed",
    });
  });

  it("classifies an initialization origin/configuration failure without exposing the provider message", async () => {
    oneSignal.init.mockRejectedValue(new Error("OneSignal app ID does not match the configured origin"));
    const service = await loadService();

    await expect(service.initializeOneSignal()).rejects.toMatchObject({
      oneSignalStage: "initialization",
      oneSignalCode: "originConfig",
    });
  });
});

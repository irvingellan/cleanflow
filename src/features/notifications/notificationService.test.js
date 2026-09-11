import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  getMessaging: vi.fn(() => ({})),
  getToken: vi.fn(),
  isSupported: vi.fn(),
  httpsCallable: vi.fn(),
}));
const oneSignal = vi.hoisted(() => ({
  associateOneSignalUser: vi.fn(),
  oneSignalDiagnosticFailure: vi.fn((error) => ({
    configured: true,
    initialized: false,
    optedIn: false,
    state: "error",
    errorStage: error?.oneSignalStage || "initialization",
    errorCode: error?.oneSignalCode || "failed",
  })),
  oneSignalWorkerState: vi.fn(),
  oneSignalSubscriptionState: vi.fn(),
  requestOneSignalSubscription: vi.fn(),
}));

vi.mock("firebase/messaging", () => ({
  getMessaging: firebase.getMessaging,
  getToken: firebase.getToken,
  isSupported: firebase.isSupported,
}));
vi.mock("firebase/functions", () => ({ httpsCallable: firebase.httpsCallable }));
vi.mock("../../services/firebase/client.js", () => ({ firebaseApp: {}, functions: {} }));
vi.mock("./oneSignalService.js", () => oneSignal);

function browserPermission(permission) {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission),
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: vi.fn().mockResolvedValue({}) },
  });
}

async function loadService() {
  vi.resetModules();
  vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "test-vapid-key");
  return import("./notificationService.js");
}

describe("notificationService channel coexistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.isSupported.mockResolvedValue(true);
    firebase.getToken.mockResolvedValue("fcm-token");
    firebase.httpsCallable.mockReturnValue(vi.fn().mockResolvedValue(undefined));
    oneSignal.associateOneSignalUser.mockResolvedValue({ configured: true, initialized: true, optedIn: false, state: "not-subscribed" });
    oneSignal.requestOneSignalSubscription.mockResolvedValue({ configured: true, initialized: true, optedIn: true, state: "active" });
    oneSignal.oneSignalSubscriptionState.mockResolvedValue({ configured: true, initialized: true, optedIn: false, state: "not-subscribed" });
    oneSignal.oneSignalWorkerState.mockResolvedValue({ state: "registered" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps the existing FCM registration active while attempting OneSignal from the explicit action", async () => {
    browserPermission("granted");
    const service = await loadService();

    const result = await service.enablePushNotifications({ userId: "firebase-user-uid" });

    expect(firebase.getToken).toHaveBeenCalledOnce();
    expect(oneSignal.requestOneSignalSubscription).toHaveBeenCalledWith("firebase-user-uid");
    expect(oneSignal.requestOneSignalSubscription.mock.invocationCallOrder[0]).toBeLessThan(firebase.getToken.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({ state: "enabled", fcm: { state: "registered" }, oneSignal: { optedIn: true } });
  });

  it("does not describe browser permission or an FCM-only registration as a completed cross-browser setup", async () => {
    browserPermission("granted");
    firebase.isSupported.mockResolvedValue(true);
    oneSignal.associateOneSignalUser.mockResolvedValue({ configured: true, initialized: true, optedIn: false, state: "not-subscribed" });
    const service = await loadService();

    await expect(service.getPushChannelDiagnostics("firebase-user-uid")).resolves.toMatchObject({
      browserPermission: "granted",
      state: "incomplete",
      fcm: { state: "registered" },
      oneSignal: { optedIn: false },
    });
  });

  it("keeps a working FCM channel usable if OneSignal initialization fails", async () => {
    browserPermission("granted");
    oneSignal.associateOneSignalUser.mockRejectedValue(new Error("OneSignal unavailable"));
    const service = await loadService();

    await expect(service.getPushChannelDiagnostics("firebase-user-uid")).resolves.toMatchObject({
      state: "enabled",
      fcm: { state: "registered" },
      oneSignal: { state: "error", optedIn: false },
    });
  });

  it("reports an explicit OneSignal failure instead of silently returning to ready", async () => {
    browserPermission("default");
    firebase.isSupported.mockResolvedValue(false);
    oneSignal.associateOneSignalUser.mockRejectedValue(Object.assign(new Error("init timed out"), {
      oneSignalStage: "initialization",
      oneSignalCode: "timeout",
    }));
    const service = await loadService();

    await expect(service.getPushChannelDiagnostics("firebase-user-uid")).resolves.toMatchObject({
      state: "error",
      oneSignal: { state: "error", errorStage: "initialization", errorCode: "timeout" },
    });
  });

  it("settles Safari diagnostics when Firebase Messaging support never resolves", async () => {
    vi.useFakeTimers();
    browserPermission("granted");
    firebase.isSupported.mockImplementation(() => new Promise(() => {}));
    oneSignal.associateOneSignalUser.mockResolvedValue({ configured: true, initialized: true, optedIn: true, state: "active" });
    const service = await loadService();

    const diagnostics = service.getPushChannelDiagnostics("firebase-user-uid");
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(diagnostics).resolves.toMatchObject({
      fcm: { state: "unavailable" },
      oneSignal: { state: "active", optedIn: true },
      state: "enabled",
    });
  });
});

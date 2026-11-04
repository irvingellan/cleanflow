import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  invoke: vi.fn(), supported: vi.fn(), getToken: vi.fn(), deleteToken: vi.fn(),
  auth: { currentUser: null }, initializeApp: vi.fn(),
}));

vi.mock("firebase/app", () => ({ getApps: () => [], initializeApp: sdk.initializeApp }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions, name) => (data) => sdk.invoke(name, data) }));
vi.mock("firebase/messaging", () => ({
  getMessaging: () => ({}), getToken: sdk.getToken, deleteToken: sdk.deleteToken, isSupported: sdk.supported,
}));
vi.mock("../../services/firebase/client.js", () => ({
  firebaseConfig: { projectId: "demo-cleanflow", messagingSenderId: "1234", appId: "1:1234:web:manager" },
  useFirebaseEmulators: false,
}));
vi.mock("../cleaner-hub/cleanerHubFirebase.js", () => ({ cleanerHubFirebase: () => ({ auth: sdk.auth, functions: {} }) }));

const session = { uid: "fake-a", organizationId: "demo-org", sessionId: "session-a" };
const options = { platform: "android", standalone: true, language: "pt" };
const bindingId = "11111111111111111111111111111111";
const deviceStorageKey = "cleanflow-cleaner-push-device-id";
let registration;
let state;
let registerWorker;
let requestPermission;
let permission;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("MODE", "production");
  vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "synthetic-vapid");
  vi.stubEnv("VITE_FIREBASE_CLEANER_MESSAGING_APP_ID", "1:1234:web:cleaner");
  state = undefined;
  window.localStorage.clear();
  permission = "default";
  requestPermission = vi.fn(async () => { permission = "granted"; return permission; });
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { get permission() { return permission; }, requestPermission });
  vi.stubGlobal("indexedDB", {
    open() {
      const open = {
        result: {
          close() {},
          transaction() {
            const request = {};
            const tx = { objectStore: () => ({ get: () => request, put: (data) => { state = data; } }) };
            queueMicrotask(() => {
              request.result = state;
              request.onsuccess();
              tx.oncomplete();
            });
            return tx;
          },
        },
      };
      queueMicrotask(() => open.onsuccess());
      return open;
    },
  });
  const origin = window.location.origin;
  registration = {
    scope: `${origin}/cleaner-messaging-push/`, active: { scriptURL: `${origin}/cleaner-messaging-sw.js` },
    pushManager: { getSubscription: vi.fn(async () => ({})) }, getNotifications: vi.fn(async () => []),
  };
  registerWorker = vi.fn(async () => registration);
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true, value: { register: registerWorker, getRegistration: vi.fn(async () => registration) },
  });
  sdk.auth.currentUser = { uid: session.uid, getIdTokenResult: async () => ({ claims: { cleanerHub: session } }) };
  sdk.supported.mockResolvedValue(true);
  sdk.getToken.mockResolvedValue("synthetic-cleaner-token");
  sdk.deleteToken.mockResolvedValue(true);
  sdk.invoke.mockImplementation(async (name) => ({ data: name === "registerCleanerPushDevice"
    ? { registered: true, registrationRevision: 1, bindingId }
    : name === "getCleanerPushDeviceStatus"
      ? { state: "active", registrationRevision: 1 }
      : { deactivated: true } }));
});

afterEach(() => {
  delete window.navigator.serviceWorker;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Cleaner push lifecycle", () => {
  it("never prompts from inspection or a lifecycle refresh and requests permission directly from the explicit action", async () => {
    const { inspectCleanerPush, enableCleanerPush, refreshCleanerPush } = await import("./cleanerPushService.js");
    expect(await inspectCleanerPush(session, options)).toBe("permission-default");
    expect(await refreshCleanerPush(session, options)).toBe("permission-default");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(registerWorker).not.toHaveBeenCalled();

    const enable = enableCleanerPush(session, options);
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(await enable).toBe("registered");
    expect(registerWorker).toHaveBeenCalledExactlyOnceWith("/cleaner-messaging-sw.js", { scope: "/cleaner-messaging-push/" });
    expect(sdk.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ appId: "1:1234:web:cleaner" }), "cleanflow-cleaner-messaging");
    expect(state).toMatchObject({ sessionId: session.sessionId, bindingId, registrationRevision: 1 });
    expect(sdk.invoke).toHaveBeenCalledWith("registerCleanerPushDevice", {
      deviceId: window.localStorage.getItem(deviceStorageKey), token: "synthetic-cleaner-token",
      language: "pt", platform: "android", permission: "granted",
    });
  });

  it("blocks iPhone tabs and never prompts from an unconfigured build", async () => {
    vi.stubEnv("VITE_FIREBASE_CLEANER_MESSAGING_APP_ID", "1:1234:web:manager");
    const { inspectCleanerPush, enableCleanerPush } = await import("./cleanerPushService.js");
    const iosTab = { ...options, platform: "ios", standalone: false };
    expect(await inspectCleanerPush(session, iosTab)).toBe("ios-standalone-required");
    expect(await enableCleanerPush(session, options)).toBe("unconfigured");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(registerWorker).not.toHaveBeenCalled();
  });

  it("clears local display and deactivates only the exact stored revision after permission revocation", async () => {
    const { inspectCleanerPush } = await import("./cleanerPushService.js");
    const close = vi.fn();
    registration.getNotifications.mockResolvedValueOnce([{ close }]);
    state = { sessionId: session.sessionId, bindingId, language: "pt", registrationRevision: 3 };
    window.localStorage.setItem(deviceStorageKey, "synthetic-installation");
    permission = "denied";
    expect(await inspectCleanerPush(session, options)).toBe("permission-denied");
    expect(state.bindingId).toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
    expect(sdk.invoke).toHaveBeenCalledExactlyOnceWith("deactivateCleanerPushDevice", {
      deviceId: "synthetic-installation", registrationRevision: 3, reason: "PERMISSION_REVOKED",
    });
    expect(sdk.getToken).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("rotates a conclusively invalidated token once and preserves any distinct role's app", async () => {
    const { inspectCleanerPush, enableCleanerPush } = await import("./cleanerPushService.js");
    permission = "granted";
    expect(await inspectCleanerPush(session, options)).toBe("missing");
    sdk.invoke.mockRejectedValueOnce({ details: { reason: "fcm-token-invalidated" } });
    expect(await enableCleanerPush(session, options)).toBe("registered");
    expect(sdk.deleteToken).toHaveBeenCalledOnce();
    expect(sdk.getToken).toHaveBeenCalledTimes(2);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("rejects a late enrollment after sign-out and never revives the old worker binding", async () => {
    const { inspectCleanerPush, enableCleanerPush, prepareCleanerPushSignOut } = await import("./cleanerPushService.js");
    permission = "granted";
    await inspectCleanerPush(session, options);
    let resolveRegistration;
    let requestStarted;
    const started = new Promise((resolve) => { requestStarted = resolve; });
    sdk.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveRegistration = resolve; requestStarted(); }));
    const enabling = enableCleanerPush(session, options);
    await started;
    await prepareCleanerPushSignOut(session);
    resolveRegistration({ data: { registered: true, registrationRevision: 2, bindingId } });
    expect(await enabling).toBe("superseded");
    expect(state).toEqual({ blockedSessionId: session.sessionId });
    expect(sdk.invoke).toHaveBeenLastCalledWith("deactivateCleanerPushDevice", expect.objectContaining({
      registrationRevision: 2, reason: "SIGNED_OUT",
    }));
    expect(sdk.deleteToken).not.toHaveBeenCalled();
  });
});

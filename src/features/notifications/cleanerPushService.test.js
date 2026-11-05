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
  vi.stubEnv("VITE_FIREBASE_VAPID_KEY", `B${"A".repeat(86)}`);
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Cleaner push pilot precheck", () => {
  beforeEach(() => vi.stubEnv("VITE_CLEANFLOW_CLEANER_PUSH_PILOT", "enabled"));

  function status(state) {
    sdk.invoke.mockImplementation(async (name) => ({ data: name === "getCleanerPushDeviceStatus"
      ? { state }
      : { registered: true, registrationRevision: 1, bindingId } }));
  }

  it("creates only a local installation reference before an ineligible result and never prompts or touches FCM", async () => {
    status("pilot-ineligible");
    const push = await import("./cleanerPushService.js");
    expect(await push.inspectCleanerPush(session, options)).toBe("pilot-ineligible");
    const installation = window.localStorage.getItem(deviceStorageKey);
    expect(installation).toMatch(/^[a-f0-9-]{36}$/);
    expect(sdk.invoke).toHaveBeenCalledExactlyOnceWith("getCleanerPushDeviceStatus", { deviceId: installation });
    expect(push.cleanerPushPairingReference(session)).toBe(`${session.sessionId}.${installation}`);
    expect(push.cleanerPushCanEnable(session)).toBe(false);
    expect(await push.enableCleanerPush(session, options)).toBe("pilot-ineligible");
    expect(await push.refreshCleanerPush(session, options)).toBe("pilot-ineligible");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sdk.supported).not.toHaveBeenCalled();
    expect(sdk.initializeApp).not.toHaveBeenCalled();
    expect(sdk.getToken).not.toHaveBeenCalled();
    expect(registerWorker).not.toHaveBeenCalled();
    expect(state).toBeUndefined();
    expect(push.cleanerPushPairingReference({ ...session, sessionId: "another-session" })).toBeNull();
    expect(push.cleanerPushPairingReference({ ...session, organizationId: "another-org" })).toBeNull();
    sdk.auth.currentUser = { uid: "another-cleaner" };
    expect(push.cleanerPushPairingReference(session)).toBeNull();
  });

  it("re-enrolls with a new binding after eligibility was lost and restored on the same installation", async () => {
    const push = await import("./cleanerPushService.js");
    const { cleanerPushBinding } = await import("./cleanerPushBinding.js");
    const rebound = "22222222222222222222222222222222";
    let eligible = true;
    let serverRevision = 1;
    let serverBinding = bindingId;
    sdk.invoke.mockImplementation(async (name, data) => {
      if (name === "getCleanerPushDeviceStatus") {
        return { data: eligible ? { state: "active", registrationRevision: serverRevision } : { state: "pilot-ineligible" } };
      }
      // Like the server: a plain repeat keeps the binding, a rebind rotates it.
      if (data.rebind === true) { serverRevision += 1; serverBinding = rebound; }
      return { data: { registered: true, registrationRevision: serverRevision, bindingId: serverBinding } };
    });
    permission = "granted";
    expect(await push.inspectCleanerPush(session, options)).toBe("missing");
    expect(await push.enableCleanerPush(session, options)).toBe("registered");
    expect((await cleanerPushBinding("read")).bindingId).toBe(bindingId);

    eligible = false;
    expect(await push.inspectCleanerPush(session, options)).toBe("pilot-ineligible");
    expect((await cleanerPushBinding("read")).bindingId).toBeUndefined();

    eligible = true;
    expect(await push.inspectCleanerPush(session, options)).toBe("missing");
    expect(await push.enableCleanerPush(session, options)).toBe("registered");
    expect(sdk.invoke).toHaveBeenLastCalledWith("registerCleanerPushDevice", expect.objectContaining({ rebind: true }));
    expect(await cleanerPushBinding("read")).toMatchObject({ bindingId: rebound, registrationRevision: 2 });
    expect(await push.inspectCleanerPush(session, options)).toBe("registered");
  });

  it("requires an approved precheck and preserves the explicit permission gesture once approved", async () => {
    status("missing");
    const push = await import("./cleanerPushService.js");
    expect(await push.enableCleanerPush(session, options)).toBe("pilot-check-required");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(await push.inspectCleanerPush(session, options)).toBe("missing");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(push.cleanerPushPairingReference(session)).toBeNull();
    expect(push.cleanerPushCanEnable(session)).toBe(true);
    const enabling = push.enableCleanerPush(session, options);
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(await enabling).toBe("registered");
    expect(sdk.invoke.mock.calls.map(([name]) => name)).toEqual([
      "getCleanerPushDeviceStatus", "getCleanerPushDeviceStatus", "registerCleanerPushDevice",
    ]);
    expect(sdk.getToken).toHaveBeenCalledOnce();
  });

  it("does not prompt with an expired cached approval", async () => {
    status("missing");
    const push = await import("./cleanerPushService.js");
    const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
    expect(await push.inspectCleanerPush(session, options)).toBe("missing");
    now.mockReturnValue(160_000);
    expect(push.cleanerPushCanEnable(session)).toBe(false);
    expect(await push.enableCleanerPush(session, options)).toBe("pilot-check-required");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sdk.getToken).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "unknown-server-state"])("fails closed for %s", async (serverState) => {
    status(serverState);
    const push = await import("./cleanerPushService.js");
    expect(await push.inspectCleanerPush(session, options)).toBe(serverState === "unavailable" ? "unavailable" : "error");
    expect(push.cleanerPushCanEnable(session)).toBe(false);
    expect(push.cleanerPushPairingReference(session)).toBeNull();
    await push.enableCleanerPush(session, options);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sdk.getToken).not.toHaveBeenCalled();
  });

  it("invalidates readiness after a failed recheck without prompting", async () => {
    status("missing");
    const push = await import("./cleanerPushService.js");
    expect(await push.inspectCleanerPush(session, options)).toBe("missing");
    sdk.invoke.mockRejectedValueOnce(new Error("synthetic offline provider"));
    expect(await push.inspectCleanerPush(session, options)).toBe("error");
    expect(push.cleanerPushCanEnable(session)).toBe(false);
    expect(await push.enableCleanerPush(session, options)).toBe("pilot-check-required");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("rechecks approval before FCM after consent and stops when the grant was revoked", async () => {
    status("missing");
    const push = await import("./cleanerPushService.js");
    await push.inspectCleanerPush(session, options);
    status("pilot-ineligible");
    expect(await push.enableCleanerPush(session, options)).toBe("pilot-ineligible");
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(sdk.getToken).not.toHaveBeenCalled();
    expect(registerWorker).not.toHaveBeenCalled();
    expect(push.cleanerPushPairingReference(session)).toBe(`${session.sessionId}.${window.localStorage.getItem(deviceStorageKey)}`);
  });

  it("handles the authoritative registration denial without token rotation or a retry", async () => {
    status("missing");
    const push = await import("./cleanerPushService.js");
    await push.inspectCleanerPush(session, options);
    sdk.invoke.mockImplementation(async (name) => {
      if (name === "registerCleanerPushDevice") throw { details: { reason: "cleaner-push-pilot-ineligible" } };
      return { data: { state: "missing" } };
    });
    expect(await push.enableCleanerPush(session, options)).toBe("pilot-ineligible");
    expect(push.cleanerPushCanEnable(session)).toBe(false);
    expect(sdk.getToken).toHaveBeenCalledOnce();
    expect(sdk.deleteToken).not.toHaveBeenCalled();
    expect(state.bindingId).toBeUndefined();
  });

  it("rechecks the grant before rotating a conclusively invalidated FCM token", async () => {
    status("missing");
    const push = await import("./cleanerPushService.js");
    await push.inspectCleanerPush(session, options);
    let denied = false;
    sdk.invoke.mockImplementation(async (name) => {
      if (name === "registerCleanerPushDevice") {
        denied = true;
        throw { details: { reason: "fcm-token-invalidated" } };
      }
      return { data: { state: denied ? "pilot-ineligible" : "missing" } };
    });
    expect(await push.enableCleanerPush(session, options)).toBe("pilot-ineligible");
    expect(sdk.getToken).toHaveBeenCalledOnce();
    expect(sdk.deleteToken).not.toHaveBeenCalled();
  });

  it("hides pairing and invalidates a pending status on an account switch even without a worker binding", async () => {
    status("pilot-ineligible");
    const push = await import("./cleanerPushService.js");
    await push.inspectCleanerPush(session, options);
    expect(push.cleanerPushPairingReference(session)).not.toBeNull();
    expect(state).toBeUndefined();
    await push.prepareCleanerPushAccountSwitch();
    expect(push.cleanerPushPairingReference(session)).toBeNull();
    let resolveStatus;
    let started;
    const requested = new Promise((resolve) => { started = resolve; });
    sdk.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveStatus = resolve; started(); }));
    const checking = push.inspectCleanerPush(session, options);
    await requested;
    await push.prepareCleanerPushAccountSwitch();
    resolveStatus({ data: { state: "missing" } });
    expect(await checking).toBe("superseded");
    expect(push.cleanerPushCanEnable(session)).toBe(false);
    expect(await push.enableCleanerPush(session, options)).toBe("pilot-check-required");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("clears an existing display binding when the pilot grant expires and keeps sign-out cleanup available", async () => {
    status("pilot-ineligible");
    permission = "granted";
    state = { sessionId: session.sessionId, bindingId, language: "pt", registrationRevision: 3 };
    window.localStorage.setItem(deviceStorageKey, "synthetic-installation");
    const close = vi.fn();
    registration.getNotifications.mockResolvedValue([{ close, data: { cleanerBindingId: bindingId } }]);
    const push = await import("./cleanerPushService.js");
    expect(await push.inspectCleanerPush(session, options)).toBe("pilot-ineligible");
    expect(state.bindingId).toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
    await push.prepareCleanerPushSignOut(session);
    expect(push.cleanerPushPairingReference(session)).toBeNull();
    expect(sdk.invoke).toHaveBeenLastCalledWith("deactivateCleanerPushDevice", {
      deviceId: "synthetic-installation", registrationRevision: 3, reason: "SIGNED_OUT",
    });
    expect(await push.enableCleanerPush(session, options)).toBe("superseded");
  });
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
    registration.getNotifications.mockResolvedValueOnce([{ close, data: { cleanerBindingId: bindingId } }]);
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

  it("clears a revoked permission offline and reconciles the same revision on reconnect", async () => {
    const { inspectCleanerPush } = await import("./cleanerPushService.js");
    state = { sessionId: session.sessionId, bindingId, language: "pt", registrationRevision: 3 };
    window.localStorage.setItem(deviceStorageKey, "synthetic-installation");
    permission = "denied";
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    try {
      expect(await inspectCleanerPush(session, options)).toBe("permission-denied");
      expect(state).toEqual({ sessionId: session.sessionId, registrationRevision: 3, permissionRevocationPending: true });
      expect(sdk.invoke).not.toHaveBeenCalled();

      online.mockReturnValue(true);
      expect(await inspectCleanerPush(session, options)).toBe("permission-denied");
      expect(state).toEqual({ sessionId: session.sessionId, registrationRevision: 3 });
      expect(sdk.invoke).toHaveBeenCalledExactlyOnceWith("deactivateCleanerPushDevice", {
        deviceId: "synthetic-installation", registrationRevision: 3, reason: "PERMISSION_REVOKED",
      });
      expect(await inspectCleanerPush(session, options)).toBe("permission-denied");
      expect(sdk.invoke).toHaveBeenCalledTimes(1);
    } finally { online.mockRestore(); }
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

  it("does not enroll an old session if another tab cleared its binding during token lookup", async () => {
    const { inspectCleanerPush, enableCleanerPush } = await import("./cleanerPushService.js");
    const { cleanerPushBinding } = await import("./cleanerPushBinding.js");
    permission = "granted";
    await inspectCleanerPush(session, options);
    sdk.getToken.mockImplementationOnce(async () => {
      await cleanerPushBinding("clear", session.sessionId);
      return "old-session-token";
    });

    expect(await enableCleanerPush(session, options)).toBe("superseded");
    expect(sdk.invoke).not.toHaveBeenCalled();
  });

  it("cannot restore an invalidated binding with an older enrollment result", async () => {
    const { cleanerPushBinding } = await import("./cleanerPushBinding.js");
    await cleanerPushBinding("claim", session.sessionId);
    await cleanerPushBinding("set", session.sessionId, bindingId, "pt", 3);
    await cleanerPushBinding("invalidate", session.sessionId, null, null, 3);
    expect(await cleanerPushBinding("set", session.sessionId, bindingId, "pt", 3)).toBeNull();
    expect(await cleanerPushBinding("read")).toEqual({ sessionId: session.sessionId, registrationRevision: 3 });
    expect(await cleanerPushBinding("set", session.sessionId, bindingId, "pt", 4)).toBeTruthy();
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

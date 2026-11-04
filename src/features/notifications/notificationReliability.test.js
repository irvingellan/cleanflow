import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ auth: { currentUser: null }, getToken: vi.fn(), deleteToken: vi.fn(), isSupported: vi.fn(), enroll: vi.fn(), deactivate: vi.fn(), send: vi.fn(), onMessage: vi.fn() }));
vi.mock("firebase/auth", () => ({ getAuth: () => sdk.auth }));
vi.mock("firebase/messaging", () => ({ getMessaging: () => ({}), getToken: sdk.getToken, deleteToken: sdk.deleteToken, isSupported: sdk.isSupported, onMessage: sdk.onMessage }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_f, name) => ({ registerManagerPushDevice: sdk.enroll, deactivateManagerPushDevice: sdk.deactivate, sendCurrentManagerTestNotification: sdk.send })[name] }));
vi.mock("../../services/firebase/client.js", () => ({ firebaseApp: {}, functions: {} }));
vi.mock("./oneSignalService.js", () => ({}));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
let registerWorker;
async function load() {
  vi.resetModules(); vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "synthetic-vapid");
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() }); vi.stubGlobal("PushManager", class {});
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  registerWorker = vi.fn().mockResolvedValue({ showNotification: vi.fn() });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: registerWorker } });
  return import("./notificationService.js");
}
beforeEach(() => {
  vi.clearAllMocks(); sdk.auth.currentUser = { uid: "manager-a" };
  sdk.getToken.mockResolvedValue("synthetic-token-a"); sdk.deleteToken.mockResolvedValue(true); sdk.isSupported.mockResolvedValue(true);
  sdk.enroll.mockResolvedValue({ data: { registered: true, registrationRevision: 7 } }); sdk.deactivate.mockResolvedValue({ data: { deactivated: true } });
  sdk.send.mockResolvedValue({ data: { status: "FCM_ACCEPTED", providerAccepted: true } }); sdk.onMessage.mockReturnValue(vi.fn());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("bounded registration and exact session cleanup", () => {
  it.each(["worker", "token", "enrollment"])("stops a late %s completion after the absolute budget", async stage => {
    const api = await load(); vi.useFakeTimers(); const late = deferred();
    ({ worker: registerWorker, token: sdk.getToken, enrollment: sdk.enroll })[stage].mockReturnValueOnce(late.promise);
    const pending = api.refreshPushNotifications(); await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({ state: "error" }); expect(api.getCachedFcmRegistrationDiagnostic()).toEqual({ state: "error", stage, code: "timeout" });
    const writes = sdk.enroll.mock.calls.length; late.resolve(stage === "token" ? "late-token" : {}); await vi.advanceTimersByTimeAsync(1);
    expect(sdk.enroll).toHaveBeenCalledTimes(writes); expect(api.getCachedFcmRegistrationState()).toBe("error"); expect(sdk.onMessage).not.toHaveBeenCalled();
  });
  it("uses one budget across delayed worker and token stages", async () => {
    const api = await load(); vi.useFakeTimers(); const worker = deferred(); const token = deferred(); registerWorker.mockReturnValueOnce(worker.promise); sdk.getToken.mockReturnValueOnce(token.promise);
    const pending = api.refreshPushNotifications(); await vi.advanceTimersByTimeAsync(10_000); worker.resolve({}); await vi.advanceTimersByTimeAsync(4_999);
    expect(sdk.getToken).toHaveBeenCalledOnce(); await vi.advanceTimersByTimeAsync(1); expect(await pending).toEqual({ state: "error" }); token.resolve("late-token"); await vi.advanceTimersByTimeAsync(1); expect(sdk.enroll).not.toHaveBeenCalled();
  });
  it("coalesces passive overlap into one enrollment without prompts or sends", async () => {
    const api = await load(); const token = deferred(); sdk.getToken.mockReturnValueOnce(token.promise); const first = api.refreshPushNotifications(); const second = api.refreshPushNotifications();
    await vi.waitFor(() => expect(sdk.getToken).toHaveBeenCalledOnce()); token.resolve("same-token");
    expect(await Promise.all([first, second])).toEqual([{ state: "registered" }, { state: "registered" }]); expect(sdk.enroll).toHaveBeenCalledOnce(); expect(Notification.requestPermission).not.toHaveBeenCalled(); expect(sdk.send).not.toHaveBeenCalled();
  });
  it("serializes an expired SDK operation before a retry recovers without reload", async () => {
    const api = await load(); vi.useFakeTimers(); const token = deferred(); sdk.getToken.mockReturnValueOnce(token.promise); const first = api.refreshPushNotifications(); await vi.advanceTimersByTimeAsync(15_000); await first;
    const retry = api.refreshPushNotifications(); await vi.advanceTimersByTimeAsync(1); expect(sdk.getToken).toHaveBeenCalledOnce(); expect(sdk.enroll).not.toHaveBeenCalled();
    token.resolve("expired-token"); await vi.advanceTimersByTimeAsync(1); expect(await retry).toEqual({ state: "registered" }); expect(sdk.enroll).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ token: "synthetic-token-a" })); expect(api.getCachedFcmRegistrationDiagnostic()).toEqual({ state: "registered", stage: null, code: null });
  });
  it("does not adopt another account when auth changes during support", async () => {
    const api = await load(); const supported = deferred(); sdk.isSupported.mockReturnValueOnce(supported.promise); const pending = api.refreshPushNotifications(); sdk.auth.currentUser = { uid: "manager-b" }; supported.resolve(true);
    expect(await pending).toEqual({ state: "error" }); expect(registerWorker).not.toHaveBeenCalled(); expect(sdk.enroll).not.toHaveBeenCalled(); expect(api.getCachedFcmRegistrationState()).toBe("unknown");
  });
  it("rotates exactly once for the conclusive invalidated-token marker", async () => {
    const api = await load(); sdk.enroll.mockRejectedValueOnce({ code: "functions/failed-precondition", details: { reason: "fcm-token-invalidated" } }); sdk.getToken.mockResolvedValueOnce("cached-invalidated").mockResolvedValueOnce("fresh-token");
    expect(await api.refreshPushNotifications()).toEqual({ state: "registered" }); expect(sdk.deleteToken).toHaveBeenCalledOnce(); expect(sdk.enroll.mock.calls.map(([input]) => input.token)).toEqual(["cached-invalidated", "fresh-token"]); expect(sdk.send).not.toHaveBeenCalled(); expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
  it.each([{ code: "functions/failed-precondition" }, { code: "functions/deadline-exceeded" }, { code: "functions/failed-precondition", details: { reason: "other" } }])("never rotates for an inconclusive error %j", async error => {
    const api = await load(); sdk.enroll.mockRejectedValueOnce(error); expect(await api.refreshPushNotifications()).toEqual({ state: "error" }); expect(sdk.deleteToken).not.toHaveBeenCalled();
  });
  it("serializes a late SDK deletion across accounts", async () => {
    const api = await load(); vi.useFakeTimers(); const deletion = deferred(); sdk.deleteToken.mockReturnValueOnce(deletion.promise); sdk.enroll.mockRejectedValueOnce({ code: "functions/failed-precondition", details: { reason: "fcm-token-invalidated" } });
    const first = api.refreshPushNotifications(); await vi.advanceTimersByTimeAsync(15_000); await first; sdk.auth.currentUser = { uid: "manager-b" }; const retry = api.refreshPushNotifications(); await vi.advanceTimersByTimeAsync(1); expect(sdk.getToken).toHaveBeenCalledOnce(); deletion.resolve(true); await vi.advanceTimersByTimeAsync(1); expect(await retry).toEqual({ state: "registered" }); expect(sdk.getToken).toHaveBeenCalledTimes(2);
  });
  it("deactivates only the exact owned successful revision and prevents refresh during sign-out", async () => {
    const api = await load(); await api.refreshPushNotifications(); const deviceId = api.getLocalPushDeviceId(); expect(await api.prepareManagerPushSignOut()).toMatchObject({ deactivated: true });
    expect(sdk.deactivate).toHaveBeenCalledExactlyOnceWith({ deviceId, token: "synthetic-token-a", registrationRevision: 7 }); expect(sdk.deleteToken).not.toHaveBeenCalled(); expect(api.getCachedFcmRegistrationState()).toBe("unknown"); expect(await api.refreshPushNotifications()).toEqual({ state: "error" }); expect(sdk.enroll).toHaveBeenCalledOnce();
  });
  it("invalidates pending registration before bounded best-effort sign-out", async () => {
    const api = await load(); vi.useFakeTimers(); const token = deferred(); sdk.getToken.mockReturnValueOnce(token.promise); const pending = api.refreshPushNotifications(); await vi.advanceTimersByTimeAsync(1);
    const logout = api.prepareManagerPushSignOut(); await vi.advanceTimersByTimeAsync(5_000); expect(await logout).toMatchObject({ deactivated: false }); token.resolve("late-token"); await vi.advanceTimersByTimeAsync(1); await pending;
    expect(sdk.enroll).not.toHaveBeenCalled(); expect(sdk.deleteToken).not.toHaveBeenCalled(); expect(sdk.onMessage).not.toHaveBeenCalled();
  });
  it("waits for a dispatched enrollment then cleans exactly its returned revision", async () => {
    const api = await load(); const write = deferred(); sdk.enroll.mockReturnValueOnce(write.promise); const pending = api.refreshPushNotifications(); await vi.waitFor(() => expect(sdk.enroll).toHaveBeenCalledOnce());
    const logout = api.prepareManagerPushSignOut(); write.resolve({ data: { registered: true, registrationRevision: 9 } }); await pending; expect(await logout).toMatchObject({ deactivated: true }); expect(sdk.deactivate.mock.calls[0][0].registrationRevision).toBe(9);
  });
  it.each([undefined, 0, -1, "7"])("skips unsafe cleanup with legacy revision %j", async registrationRevision => {
    const api = await load(); sdk.enroll.mockResolvedValueOnce({ data: { registered: true, registrationRevision } }); await api.refreshPushNotifications(); expect(await api.prepareManagerPushSignOut()).toMatchObject({ deactivated: false }); expect(sdk.deactivate).not.toHaveBeenCalled();
  });
  it("does not deactivate another account's enrollment", async () => {
    const api = await load(); await api.refreshPushNotifications(); sdk.auth.currentUser = { uid: "manager-b" }; expect(await api.prepareManagerPushSignOut()).toMatchObject({ deactivated: false }); expect(sdk.deactivate).not.toHaveBeenCalled();
  });
  it("bounds cleanup without affecting a refreshed enrollment", async () => {
    const api = await load(); vi.useFakeTimers(); await api.refreshPushNotifications(); const cleanup = deferred(); sdk.deactivate.mockReturnValueOnce(cleanup.promise); const logout = api.prepareManagerPushSignOut(); await vi.advanceTimersByTimeAsync(5_000); expect(await logout).toMatchObject({ deactivated: false });
    sdk.auth.currentUser = { uid: "manager-b" }; sdk.enroll.mockResolvedValueOnce({ data: { registered: true, registrationRevision: 10 } }); expect(await api.refreshPushNotifications()).toEqual({ state: "registered" }); cleanup.resolve({ data: { deactivated: false } }); await vi.advanceTimersByTimeAsync(1); expect(sdk.deactivate.mock.calls[0][0].registrationRevision).toBe(7); expect(api.getCachedFcmRegistrationState()).toBe("registered");
  });
  it("exposes only safe stage and code rather than raw SDK errors", async () => {
    const api = await load(); sdk.getToken.mockRejectedValueOnce({ code: "sensitive/token-value", message: "private-token" }); await api.refreshPushNotifications(); expect(api.getCachedFcmRegistrationDiagnostic()).toEqual({ state: "error", stage: "token", code: "failed" });
  });
  it("allows a fresh Auth session for the same UID after explicit sign-out", async () => {
    const api = await load(); await api.refreshPushNotifications(); await api.prepareManagerPushSignOut();
    sdk.auth.currentUser = { uid: "manager-a" };
    expect(await api.refreshPushNotifications()).toEqual({ state: "registered" });
    expect(sdk.enroll).toHaveBeenCalledTimes(2);
  });
  it("keeps known provider acceptance after registration's budget has ended", async () => {
    const api = await load(); vi.useFakeTimers(); const send = deferred(); sdk.send.mockReturnValueOnce(send.promise);
    const pending = api.testCurrentDeviceNotifications(); await vi.advanceTimersByTimeAsync(16_000); send.resolve({ data: { status: "FCM_ACCEPTED", providerAccepted: true } });
    expect(await pending).toEqual({ state: "fcm-accepted", recovered: false });
  });
  it("never refreshes for a stale mounted user", async () => {
    const api = await load(); expect(await api.refreshPushNotifications({ userId: "manager-b" })).toEqual({ state: "error" });
    expect(registerWorker).not.toHaveBeenCalled(); expect(sdk.enroll).not.toHaveBeenCalled();
  });

  it("does not expose a previous Auth session's cached registration for the same UID", async () => {
    const api = await load(); await api.refreshPushNotifications(); sdk.auth.currentUser = { uid: "manager-a" };
    expect(api.getCachedFcmRegistrationState()).toBe("unknown");
  });
  it("starts a separately guarded attempt for a new session with the same UID", async () => {
    const api = await load(); const support = deferred(); sdk.isSupported.mockReturnValueOnce(support.promise);
    const old = api.refreshPushNotifications(); sdk.auth.currentUser = { uid: "manager-a" };
    const fresh = api.refreshPushNotifications(); support.resolve(true);
    expect(await fresh).toEqual({ state: "registered" }); expect(await old).toEqual({ state: "error" }); expect(sdk.enroll).toHaveBeenCalledOnce();
  });
  it("never loops if the rotated token is also conclusively invalidated", async () => {
    const api = await load(); sdk.enroll.mockRejectedValue({ code: "functions/failed-precondition", details: { reason: "fcm-token-invalidated" } });
    expect(await api.refreshPushNotifications()).toEqual({ state: "error" }); expect(sdk.enroll).toHaveBeenCalledTimes(2); expect(sdk.deleteToken).toHaveBeenCalledOnce();
  });

  it.each([undefined, { data: {} }, { data: { registered: false } }])("does not claim registration for a malformed successful response %j", async response => {
    const api = await load(); sdk.enroll.mockResolvedValueOnce(response);
    expect(await api.refreshPushNotifications()).toEqual({ state: "error" });
    expect(api.getCachedFcmRegistrationDiagnostic()).toEqual({ state: "error", stage: "enrollment", code: "failed" });
    expect(sdk.onMessage).not.toHaveBeenCalled();
  });
  it("records a recovery registration failure instead of retaining a stale registered cache", async () => {
    const api = await load(); sdk.send.mockResolvedValueOnce({ data: { status: "FAILED", providerAccepted: false, recoveryAllowed: true, failureCode: "messaging/registration-token-not-registered" } });
    sdk.deleteToken.mockRejectedValueOnce(new Error("synthetic SDK failure"));
    expect(await api.testCurrentDeviceNotifications()).toMatchObject({ state: "registration-failed" });
    expect(api.getCachedFcmRegistrationDiagnostic()).toEqual({ state: "error", stage: "token", code: "failed" });
    expect(sdk.send).toHaveBeenCalledOnce();
  });

  it("releases a failed sign-out only for the initiating current Auth session", async () => {
    const api = await load(); await api.refreshPushNotifications(); const preparation = await api.prepareManagerPushSignOut();
    expect(api.abortManagerPushSignOut(preparation)).toBe(true);
    expect(api.getCachedFcmRegistrationState()).toBe("unknown");
    expect(await api.refreshPushNotifications()).toEqual({ state: "registered" });
    expect(sdk.deleteToken).not.toHaveBeenCalled();
  });
  it("cannot release a newer sign-out for the same Auth object with an older preparation", async () => {
    const api = await load(); await api.refreshPushNotifications();
    const old = await api.prepareManagerPushSignOut(); const current = await api.prepareManagerPushSignOut();
    expect(api.abortManagerPushSignOut(old)).toBe(false);
    expect(await api.refreshPushNotifications()).toEqual({ state: "error" });
    expect(api.abortManagerPushSignOut(current)).toBe(true);
    expect(await api.refreshPushNotifications()).toEqual({ state: "registered" });
  });
  it("cannot release a superseded Auth session's sign-out guard", async () => {
    const api = await load(); await api.refreshPushNotifications(); const old = await api.prepareManagerPushSignOut();
    sdk.auth.currentUser = { uid: "manager-a" }; const current = await api.prepareManagerPushSignOut();
    expect(api.abortManagerPushSignOut(old)).toBe(false);
    expect(await api.refreshPushNotifications()).toEqual({ state: "error" });
    expect(api.abortManagerPushSignOut(current)).toBe(true);
    expect(await api.refreshPushNotifications()).toEqual({ state: "registered" });
  });
  it("cannot release sign-out for an account that has already changed", async () => {
    const api = await load(); await api.refreshPushNotifications(); const old = await api.prepareManagerPushSignOut();
    sdk.auth.currentUser = { uid: "manager-b" }; expect(api.abortManagerPushSignOut(old)).toBe(false);
  });
  it("never performs a second rotation/send after enrollment already consumed the explicit attempt's rotation", async () => {
    const api = await load(); sdk.enroll.mockRejectedValueOnce({ code: "functions/failed-precondition", details: { reason: "fcm-token-invalidated" } });
    sdk.send.mockResolvedValue({ data: { status: "FAILED", providerAccepted: false, recoveryAllowed: true, failureCode: "messaging/registration-token-not-registered" } });
    expect(await api.testCurrentDeviceNotifications()).toEqual({ state: "fcm-rejected", recovered: true });
    expect(sdk.deleteToken).toHaveBeenCalledOnce(); expect(sdk.getToken).toHaveBeenCalledTimes(2);
    expect(sdk.enroll).toHaveBeenCalledTimes(2); expect(sdk.send).toHaveBeenCalledOnce();
  });

});

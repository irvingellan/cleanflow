import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  getAuth: vi.fn(), getMessaging: vi.fn(() => ({})), getToken: vi.fn(),
  deleteToken: vi.fn(), isSupported: vi.fn(), onMessage: vi.fn(),
  register: vi.fn(), test: vi.fn(),
}));
vi.mock("firebase/auth", () => ({ getAuth: firebase.getAuth }));
vi.mock("firebase/messaging", () => ({
  getMessaging: firebase.getMessaging, getToken: firebase.getToken,
  deleteToken: firebase.deleteToken, isSupported: firebase.isSupported, onMessage: firebase.onMessage,
}));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions, name) => name === "registerManagerPushDevice" ? firebase.register : firebase.test,
}));
vi.mock("../../services/firebase/client.js", () => ({ firebaseApp: {}, functions: {} }));
vi.mock("./oneSignalService.js", () => ({}));

const deviceId = "c679d2e5-af31-4c44-8000-99d09beaa842";
const accepted = { data: { status: "FCM_ACCEPTED", providerAccepted: true } };
const rejected = { data: {
  status: "FAILED", providerAccepted: false, recoveryAllowed: true,
  failureCode: "messaging/registration-token-not-registered",
} };
let worker;

async function service(permission = "granted") {
  vi.resetModules();
  vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "synthetic-public-vapid");
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  vi.stubGlobal("Notification", { permission, requestPermission: vi.fn(async () => {
    Notification.permission = "granted";
    return "granted";
  }) });
  vi.stubGlobal("PushManager", class {});
  worker = { showNotification: vi.fn().mockResolvedValue(undefined) };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {
    register: vi.fn().mockResolvedValue(worker),
  } });
  localStorage.setItem("cleanflow-push-device-id", deviceId);
  return import("./notificationService.js");
}

describe("explicit current-device notification self-test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.getAuth.mockReturnValue({ currentUser: { uid: "synthetic-manager" } });
    firebase.isSupported.mockResolvedValue(true);
    firebase.getToken.mockResolvedValue("synthetic-fcm-registration-token");
    firebase.deleteToken.mockResolvedValue(true);
    firebase.register.mockResolvedValue({ data: { registered: true } });
    firebase.test.mockResolvedValue(accepted);
    firebase.onMessage.mockReturnValue(vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });

  it("requests default permission synchronously from the tap, before async support settles", async () => {
    const api = await service("default");
    let supported;
    firebase.isSupported.mockImplementation(() => new Promise(resolve => { supported = resolve; }));
    const action = api.testCurrentDeviceNotifications();
    expect(Notification.requestPermission).toHaveBeenCalledOnce();
    expect(firebase.register).not.toHaveBeenCalled();
    supported(true);
    await expect(action).resolves.toMatchObject({ state: "fcm-accepted" });
  });

  it("does not prompt, register or send when permission is denied", async () => {
    const api = await service("denied");
    await expect(api.testCurrentDeviceNotifications()).resolves.toEqual({ state: "permission-blocked" });
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(firebase.register).not.toHaveBeenCalled();
    expect(firebase.test).not.toHaveBeenCalled();
  });

  it("registers this same local device before the test, sending only deviceId and confirmation", async () => {
    const api = await service();
    await expect(api.testCurrentDeviceNotifications()).resolves.toMatchObject({ state: "fcm-accepted" });
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/firebase-messaging-sw.js", {
      scope: "/firebase-messaging-push/",
    });
    expect(firebase.register).toHaveBeenCalledWith(expect.objectContaining({ deviceId }));
    expect(firebase.test).toHaveBeenCalledExactlyOnceWith({ deviceId, confirm: true });
    expect(firebase.register.mock.invocationCallOrder[0]).toBeLessThan(firebase.test.mock.invocationCallOrder[0]);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it("shows the fixed foreground notification only after the matching FCM message arrives", async () => {
    const api = await service();
    await api.testCurrentDeviceNotifications();
    const receive = firebase.onMessage.mock.calls[0][1];
    receive({ data: { eventType: "MANAGER_REMINDER", title: "ignored" } });
    await Promise.resolve();
    expect(worker.showNotification).not.toHaveBeenCalled();
    receive({ data: { eventType: "CURRENT_DEVICE_TEST", title: "not-client-controlled" } });
    await vi.waitFor(() => expect(worker.showNotification).toHaveBeenCalledExactlyOnceWith("CleanFlow Test",
      expect.objectContaining({ body: "Notifications are working on this device.", data: { link: "/" } })));
  });

  it.each(["CLEANER_INTERESTED", "CHECKLIST_READY_FOR_REVIEW", "ASSIGNMENT_CONFIRMED", "MANAGER_REMINDER"])(
    "normal registration displays actual foreground %s receipts without sending a test", async (eventType) => {
      const api = await service();
      await api.refreshPushNotifications();
      expect(firebase.test).not.toHaveBeenCalled();
      const receive = firebase.onMessage.mock.calls[0]?.[1];
      expect(receive).toBeTypeOf("function");
      receive({ data: { eventType, eventId: "synthetic-event", title: "Safe operational title", body: "Safe summary", link: "/" } });
      await vi.waitFor(() => expect(worker.showNotification).toHaveBeenCalledExactlyOnceWith("Safe operational title",
        expect.objectContaining({ body: "Safe summary", tag: "synthetic-event", data: { link: "/" } })));
    },
  );

  it("subscribes once across registration refreshes and the explicit test", async () => {
    const api = await service();
    await api.refreshPushNotifications();
    await api.refreshPushNotifications();
    await api.testCurrentDeviceNotifications();
    expect(firebase.onMessage).toHaveBeenCalledTimes(1);
  });

  it.each([null, { uid: "another-synthetic-manager" }])(
    "does not attach a receiver if the account changes during passive registration (%j)", async currentUser => {
      const api = await service();
      let finishRegistration;
      firebase.register.mockImplementationOnce(() => new Promise(resolve => { finishRegistration = resolve; }));
      const refresh = api.refreshPushNotifications();
      await vi.waitFor(() => expect(firebase.register).toHaveBeenCalledOnce());
      firebase.getAuth.mockReturnValue({ currentUser });
      finishRegistration({ data: { registered: true } });
      await expect(refresh).resolves.toEqual({ state: "error" });
      expect(firebase.onMessage).not.toHaveBeenCalled();
      expect(firebase.test).not.toHaveBeenCalled();
    },
  );

  it("drops actual receipts if sign-out/account change occurs before display", async () => {
    const api = await service();
    await api.refreshPushNotifications();
    const receive = firebase.onMessage.mock.calls[0][1];
    receive({ data: { eventType: "CLEANER_INTERESTED", eventId: "synthetic-event", title: "Safe title", body: "Safe summary" } });
    firebase.getAuth.mockReturnValue({ currentUser: null });
    await Promise.resolve();
    expect(worker.showNotification).not.toHaveBeenCalled();
    firebase.getAuth.mockReturnValue({ currentUser: { uid: "another-synthetic-manager" } });
    receive({ data: { eventType: "CURRENT_DEVICE_TEST" } });
    await Promise.resolve();
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it("ignores unknown/malformed receipts, fixes the authenticated destination and tolerates display failure", async () => {
    const api = await service();
    await api.refreshPushNotifications();
    const receive = firebase.onMessage.mock.calls[0][1];
    receive({ data: { eventType: "OTHER_EVENT", eventId: "synthetic-event", title: "Ignored", body: "Ignored" } });
    receive({ data: { eventType: "CLEANER_INTERESTED", eventId: "https://invalid.example", title: "Ignored", body: "Ignored" } });
    receive({ data: { eventType: "CLEANER_INTERESTED", eventId: "synthetic-event", title: "Ignored" } });
    await Promise.resolve();
    expect(worker.showNotification).not.toHaveBeenCalled();
    worker.showNotification.mockRejectedValueOnce(new Error("Synthetic OS display rejection"));
    receive({ data: { eventType: "CLEANER_INTERESTED", eventId: "synthetic-event", title: "Safe title", body: "Safe summary", link: "https://invalid.example" } });
    await vi.waitFor(() => expect(worker.showNotification).toHaveBeenCalledExactlyOnceWith("Safe title",
      expect.objectContaining({ data: { link: "/" } })));
    expect(firebase.test).not.toHaveBeenCalled();
    await expect(api.refreshPushNotifications()).resolves.toMatchObject({ state: "registered" });
  });

  it("deletes a conclusively stale SDK token, registers the same device and retries exactly once", async () => {
    const api = await service();
    firebase.test.mockResolvedValueOnce(rejected).mockResolvedValueOnce(accepted);
    firebase.getToken.mockResolvedValueOnce("old-synthetic-token").mockResolvedValueOnce("new-synthetic-token");
    await expect(api.testCurrentDeviceNotifications()).resolves.toEqual({ state: "fcm-accepted", recovered: true });
    expect(firebase.deleteToken).toHaveBeenCalledOnce();
    expect(firebase.register.mock.calls.map(([request]) => request.deviceId)).toEqual([deviceId, deviceId]);
    expect(firebase.test.mock.calls.map(([request]) => request)).toEqual([
      { deviceId, confirm: true }, { deviceId, confirm: true },
    ]);
  });

  it("never loops when the recovery token is also rejected", async () => {
    const api = await service();
    firebase.test.mockResolvedValue(rejected);
    await expect(api.testCurrentDeviceNotifications()).resolves.toEqual({ state: "fcm-rejected", recovered: true });
    expect(firebase.deleteToken).toHaveBeenCalledOnce();
    expect(firebase.test).toHaveBeenCalledTimes(2);
  });

  it("does not let a late passive token overwrite the explicit self-healed registration", async () => {
    const api = await service();
    let resolveOldToken;
    firebase.getToken.mockImplementationOnce(() => new Promise(resolve => { resolveOldToken = resolve; }))
      .mockResolvedValueOnce("old-synthetic-token").mockResolvedValueOnce("new-synthetic-token");
    const passive = api.refreshPushNotifications();
    await vi.waitFor(() => expect(firebase.getToken).toHaveBeenCalledOnce());
    firebase.test.mockResolvedValueOnce(rejected).mockResolvedValueOnce(accepted);
    await expect(api.testCurrentDeviceNotifications()).resolves.toMatchObject({ state: "fcm-accepted", recovered: true });
    resolveOldToken("stale-passive-synthetic-token");
    await passive;
    expect(firebase.register.mock.calls.map(([request]) => request.token)).toEqual([
      "old-synthetic-token", "new-synthetic-token",
    ]);
  });

  it("waits for an already-dispatched passive registration write before refreshing", async () => {
    const api = await service();
    let resolveOldWrite;
    firebase.register.mockImplementationOnce(() => new Promise(resolve => { resolveOldWrite = resolve; }));
    const passive = api.refreshPushNotifications();
    await vi.waitFor(() => expect(firebase.register).toHaveBeenCalledOnce());
    const action = api.testCurrentDeviceNotifications();
    await Promise.resolve();
    expect(firebase.test).not.toHaveBeenCalled();
    expect(firebase.getToken).toHaveBeenCalledOnce();
    resolveOldWrite({ data: { registered: true } });
    await passive;
    await expect(action).resolves.toMatchObject({ state: "fcm-accepted" });
    expect(firebase.register).toHaveBeenCalledTimes(2);
    expect(firebase.test).toHaveBeenCalledOnce();
  });

  it("does not race a new registration against an uncertain passive server write", async () => {
    const api = await service();
    firebase.register.mockImplementationOnce(() => new Promise(() => {}));
    const passive = api.refreshPushNotifications();
    await vi.waitFor(() => expect(firebase.register).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    const action = api.testCurrentDeviceNotifications();
    await vi.advanceTimersByTimeAsync(api.currentDeviceRegistrationTimeoutMs);
    await expect(action).resolves.toEqual({ state: "registration-failed" });
    expect(firebase.register).toHaveBeenCalledOnce();
    expect(firebase.test).not.toHaveBeenCalled();
    await passive;
  });

  it("does not restart a passive registration whose support check predates the explicit test", async () => {
    const api = await service();
    let resolvePassiveSupport;
    firebase.isSupported.mockImplementationOnce(() => new Promise(resolve => { resolvePassiveSupport = resolve; }));
    const passive = api.refreshPushNotifications();
    firebase.test.mockResolvedValueOnce(rejected).mockResolvedValueOnce(accepted);
    await expect(api.testCurrentDeviceNotifications()).resolves.toMatchObject({ state: "fcm-accepted", recovered: true });
    resolvePassiveSupport(true);
    await passive;
    expect(firebase.register).toHaveBeenCalledTimes(2);
  });

  it("does not recover when the server has not authorized the bounded rejection retry", async () => {
    const api = await service();
    firebase.test.mockResolvedValue({ data: { ...rejected.data, recoveryAllowed: false } });
    await expect(api.testCurrentDeviceNotifications()).resolves.toMatchObject({ state: "fcm-rejected" });
    expect(firebase.test).toHaveBeenCalledOnce();
    expect(firebase.deleteToken).not.toHaveBeenCalled();
  });

  it.each([
    { data: { status: "UNKNOWN", providerAccepted: null } },
    { data: null },
    { data: { status: "FCM_ACCEPTED", providerAccepted: null } },
  ])("never retries an unknown or malformed provider result", async result => {
    const api = await service(); firebase.test.mockResolvedValue(result);
    await expect(api.testCurrentDeviceNotifications()).resolves.toMatchObject({ state: "unknown" });
    expect(firebase.test).toHaveBeenCalledOnce(); expect(firebase.deleteToken).not.toHaveBeenCalled();
  });

  it("bounds a stalled callable as unknown without another send", async () => {
    const api = await service(); vi.useFakeTimers();
    firebase.test.mockImplementation(() => new Promise(() => {}));
    const action = api.testCurrentDeviceNotifications();
    await vi.advanceTimersByTimeAsync(api.currentDeviceTestTimeoutMs);
    await expect(action).resolves.toMatchObject({ state: "unknown" });
    expect(firebase.test).toHaveBeenCalledOnce(); expect(firebase.deleteToken).not.toHaveBeenCalled();
  });

  it("bounds registration and never sends if token acquisition stalls", async () => {
    const api = await service(); vi.useFakeTimers();
    firebase.getToken.mockImplementation(() => new Promise(() => {}));
    const action = api.testCurrentDeviceNotifications();
    await vi.advanceTimersByTimeAsync(api.currentDeviceRegistrationTimeoutMs);
    await expect(action).resolves.toEqual({ state: "registration-failed" });
    expect(firebase.test).not.toHaveBeenCalled();
  });

  it("continues no send after the manager account changes during registration", async () => {
    const api = await service();
    firebase.register.mockImplementation(async () => {
      firebase.getAuth.mockReturnValue({ currentUser: { uid: "another-manager" } });
      return { data: { registered: true } };
    });
    await expect(api.testCurrentDeviceNotifications()).resolves.toEqual({ state: "unauthorized" });
    expect(firebase.test).not.toHaveBeenCalled();
  });

  it.each([
    ["functions/resource-exhausted", "cooldown"],
    ["functions/permission-denied", "unauthorized"],
    ["functions/deadline-exceeded", "unknown"],
    ["functions/failed-precondition", "registration-failed"],
  ])("maps %s safely without retry", async (code, state) => {
    const api = await service();
    firebase.test.mockRejectedValue({ code });
    await expect(api.testCurrentDeviceNotifications()).resolves.toMatchObject({ state });
    expect(firebase.test).toHaveBeenCalledOnce(); expect(firebase.deleteToken).not.toHaveBeenCalled();
  });

  it("unsupported Web Push never registers or sends", async () => {
    const api = await service(); firebase.isSupported.mockResolvedValue(false);
    await expect(api.testCurrentDeviceNotifications()).resolves.toEqual({ state: "unsupported" });
    expect(firebase.register).not.toHaveBeenCalled(); expect(firebase.test).not.toHaveBeenCalled();
  });
});

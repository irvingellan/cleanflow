import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  auth: { currentUser: null },
  call: vi.fn(),
  deviceId: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock("firebase/auth", () => ({ getAuth: () => mocked.auth }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocked.call }));
vi.mock("../../services/firebase/client.js", () => ({ functions: {}, firebaseApp: {} }));
vi.mock("./notificationService.js", () => ({ getLocalPushDeviceId: mocked.deviceId }));
vi.mock("./notificationHealthService.js", () => ({ readLocalNotificationHealth: mocked.snapshot }));

import { reportCurrentManagerNotificationHealth } from "./notificationHealthReporter.js";

describe("manager notification health reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.auth.currentUser = { uid: "manager-a" };
    mocked.deviceId.mockReturnValue("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    mocked.snapshot.mockResolvedValue({
      deviceId: null,
      notificationPermission: "denied",
      serviceWorker: "unavailable",
      fcmRegistration: "unknown",
      platform: "ios",
      browserClass: "safari",
      standalone: true,
      appVersion: "v0.9.3",
      checkedAt: "local-only-time",
      token: "must-not-send",
    });
    mocked.call.mockResolvedValue({ data: { recorded: true } });
  });

  it("reports only coarse allowlisted state with the existing local device ID", async () => {
    expect(await reportCurrentManagerNotificationHealth()).toBe(true);
    expect(mocked.call).toHaveBeenCalledWith({
      deviceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      notificationPermission: "denied",
      serviceWorker: "unavailable",
      fcmRegistration: "unknown",
      platform: "ios",
      browserClass: "safari",
      standalone: true,
      appVersion: "v0.9.3",
    });
  });

  it("never breaks the manager view when local state or the report call fails", async () => {
    mocked.call.mockRejectedValueOnce(new Error("offline"));
    expect(await reportCurrentManagerNotificationHealth()).toBe(false);
    mocked.deviceId.mockImplementationOnce(() => { throw new Error("storage blocked"); });
    expect(await reportCurrentManagerNotificationHealth()).toBe(false);
  });
  it("sends only allowlisted optional failure stage/code", async () => {
    mocked.snapshot.mockResolvedValueOnce({ notificationPermission: "granted", serviceWorker: "ready", fcmRegistration: "error", fcmErrorStage: "token", fcmErrorCode: "timeout", platform: "ios", browserClass: "safari", standalone: true, appVersion: "v0.9.3", rawError: "must-not-send" });
    await reportCurrentManagerNotificationHealth();
    expect(mocked.call.mock.calls[0][0]).toMatchObject({ fcmErrorStage: "token", fcmErrorCode: "timeout" });
    expect(mocked.call.mock.calls[0][0]).not.toHaveProperty("rawError");
    mocked.snapshot.mockResolvedValueOnce({ fcmRegistration: "error", fcmErrorStage: "private-token", fcmErrorCode: "raw-error" });
    await reportCurrentManagerNotificationHealth();
    expect(mocked.call.mock.calls[1][0]).not.toHaveProperty("fcmErrorStage");
    expect(mocked.call.mock.calls[1][0]).not.toHaveProperty("fcmErrorCode");
  });

  it("does not attribute a delayed health snapshot to a different Auth session", async () => {
    let finish; mocked.snapshot.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = reportCurrentManagerNotificationHealth();
    mocked.auth.currentUser = { uid: "manager-b" }; finish({ notificationPermission: "granted", fcmRegistration: "registered" });
    expect(await pending).toBe(false); expect(mocked.call).not.toHaveBeenCalled();
  });

});

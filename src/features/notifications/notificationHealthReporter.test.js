import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  call: vi.fn(),
  deviceId: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock("firebase/functions", () => ({ httpsCallable: () => mocked.call }));
vi.mock("../../services/firebase/client.js", () => ({ functions: {} }));
vi.mock("./notificationService.js", () => ({ getLocalPushDeviceId: mocked.deviceId }));
vi.mock("./notificationHealthService.js", () => ({ readLocalNotificationHealth: mocked.snapshot }));

import { reportCurrentManagerNotificationHealth } from "./notificationHealthReporter.js";

describe("manager notification health reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

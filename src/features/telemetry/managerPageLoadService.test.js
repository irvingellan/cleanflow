import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({ addDoc: vi.fn(), collection: vi.fn(), serverTimestamp: vi.fn() }));

vi.mock("firebase/firestore", () => firebase);
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

function browserEnvironment({ connection } = {}) {
  return {
    crypto: { randomUUID: vi.fn().mockReturnValueOnce("session-1").mockReturnValueOnce("device-1") },
    sessionStorage: storage(),
    localStorage: storage(),
    navigator: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1",
      platform: "iPhone",
      ...(connection ? { connection } : {}),
    },
    window: { innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: true }) },
  };
}

describe("managerPageLoadService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("builds a coarse, customer-data-free mobile event and keeps stable local identifiers", async () => {
    const { buildManagerPageLoadEvent } = await import("./managerPageLoadService.js");
    const environment = browserEnvironment({ connection: { effectiveType: "4g", rtt: 72.4, downlink: 8.5, saveData: false } });
    const input = { page: "dashboard", durationMs: 123.7, dataDurationMs: 100.1, result: "success", uid: "manager-uid" };
    const first = buildManagerPageLoadEvent(input, environment);
    const second = buildManagerPageLoadEvent({ ...input, page: "jobs" }, environment);

    expect(first).toMatchObject({
      page: "dashboard", durationMs: 124, dataDurationMs: 100, result: "success", uid: "manager-uid",
      sessionId: "session-1", deviceId: "device-1", deviceClass: "mobile", browser: "safari",
      platform: "ios", standalone: true, viewport: { width: 390, height: 844 },
      connection: { effectiveType: "4g", rtt: 72, downlink: 8.5, saveData: false },
    });
    expect(second.sessionId).toBe("session-1");
    expect(second.deviceId).toBe("device-1");
    expect(JSON.stringify(first)).not.toMatch(/property|client|jobId|email|token|url/i);
  });

  it("omits unavailable connection information", async () => {
    const { buildManagerPageLoadEvent } = await import("./managerPageLoadService.js");
    const event = buildManagerPageLoadEvent(
      { page: "cleaners", durationMs: 10, dataDurationMs: 8, result: "error", uid: "manager-uid" },
      browserEnvironment(),
    );
    expect(event).not.toHaveProperty("connection");
    expect(event.result).toBe("error");
  });

  it("absorbs a diagnostic write failure", async () => {
    firebase.collection.mockReturnValue("events");
    firebase.serverTimestamp.mockReturnValue("server-time");
    firebase.addDoc.mockRejectedValue(new Error("offline"));
    const { recordManagerPageLoad } = await import("./managerPageLoadService.js");

    await expect(recordManagerPageLoad({
      page: "payouts", durationMs: 30, dataDurationMs: 20, result: "success", uid: "manager-uid",
    })).resolves.toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collection: vi.fn(() => "managerPageLoadEvents"),
  getDocs: vi.fn(),
  limit: vi.fn((value) => ({ limit: value })),
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  query: vi.fn((...args) => ({ query: args })),
  Timestamp: { fromDate: vi.fn((date) => ({ cutoff: date.getTime() })) },
  where: vi.fn((...args) => ({ where: args })),
}));

vi.mock("firebase/firestore", () => firestore);
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));

describe("manager page-load diagnostics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    firestore.getDocs.mockResolvedValue({ docs: [] });
  });

  it("queries only the selected recent window and caps the result set", async () => {
    const { getManagerPageLoadEvents } = await import("./managerPageLoadDiagnosticsService.js");
    await getManagerPageLoadEvents({ windowDays: 7, now: Date.UTC(2026, 8, 22) });

    expect(firestore.collection).toHaveBeenCalledWith({}, "organizations", "cleanflow-demo", "managerPageLoadEvents");
    expect(firestore.where).toHaveBeenCalledWith("createdAt", ">=", { cutoff: Date.UTC(2026, 8, 15) });
    expect(firestore.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(firestore.limit).toHaveBeenCalledWith(500);
  });

  it("projects only the existing allowlisted timing fields", async () => {
    firestore.getDocs.mockResolvedValue({ docs: [{
      id: "event-1",
      data: () => ({
        page: "jobs", durationMs: 3200, dataDurationMs: 2900, result: "success", uid: "manager-uid",
        sessionId: "session-123456", deviceId: "device-123456", deviceClass: "desktop", browser: "chrome",
        platform: "macos", standalone: false, connection: { effectiveType: "4g" }, createdAt: "time",
        email: "not-displayed@example.test", propertyId: "must-not-be-in-projection", accessCode: "secret",
      }),
    }] });
    const { getManagerPageLoadEvents } = await import("./managerPageLoadDiagnosticsService.js");
    const [event] = await getManagerPageLoadEvents();

    expect(event).toMatchObject({ id: "event-1", page: "jobs", uid: "manager-uid", durationMs: 3200 });
    expect(event).not.toHaveProperty("email");
    expect(event).not.toHaveProperty("propertyId");
    expect(event).not.toHaveProperty("accessCode");
  });

  it("calculates summary percentiles and page breakdowns with pilot thresholds", async () => {
    const { durationSeverity, summarizeManagerPageLoadEvents } = await import("./managerPageLoadDiagnosticsService.js");
    const events = [400, 1200, 3100, 5000].map((durationMs, index) => ({
      id: `event-${index}`, page: index < 3 ? "jobs" : "dashboard", durationMs,
    }));
    const summary = summarizeManagerPageLoadEvents(events);

    expect(summary).toMatchObject({ eventCount: 4, averageMs: 2425, medianMs: 2150, p95Ms: 5000 });
    expect(summary.slowest).toMatchObject({ page: "dashboard", durationMs: 5000 });
    expect(summary.byPage.find((row) => row.page === "jobs")).toMatchObject({
      eventCount: 3, averageMs: 1567, p95Ms: 3100, slowest: { durationMs: 3100 },
    });
    expect(durationSeverity(999)).toBe("normal");
    expect(durationSeverity(1000)).toBe("noticeable");
    expect(durationSeverity(3001)).toBe("slow");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("firebase/firestore", () => firebase);
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));

import {
  createManagerOperationTracker,
  createManagerPageVisitId,
} from "./managerOperationTelemetryService.js";

const pageVisitId = "00000000-0000-4000-8000-000000000001";

async function flushDiagnosticWrite() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("managerOperationTelemetryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    firebase.collection.mockReturnValue("manager-events");
    firebase.serverTimestamp.mockReturnValue("server-time");
    firebase.addDoc.mockResolvedValue(undefined);
  });

  it("creates a UUID-shaped page-visit ID", () => {
    const first = createManagerPageVisitId();
    const second = createManagerPageVisitId();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(second).not.toBe(first);
  });

  it("bounds durations while retaining numeric start times for success and error", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      const tracker = createManagerOperationTracker({ uid: "manager-uid", pageVisitId });
      expect(tracker.track("checklist-run", () => "saved")).toBe("saved");
      clock.mockReturnValue(1_700_000_700_000);
      await flushDiagnosticWrite();

      const originalError = new Error("private task failure");
      clock.mockReturnValue(1_700_000_800_000);
      expect(() => tracker.track("cleaners", () => { throw originalError; })).toThrow(originalError);
      clock.mockReturnValue(1_700_000_800_123);
      await flushDiagnosticWrite();

      const events = firebase.addDoc.mock.calls.map(([, event]) => event);
      expect(events[0]).toMatchObject({
        startedAtMs: 1_700_000_000_000, durationMs: 600_000, result: "success",
      });
      expect(events[1]).toMatchObject({
        startedAtMs: 1_700_000_800_000, durationMs: 123, result: "error",
      });
    } finally {
      clock.mockRestore();
    }
  });

  it("records initial and refresh phases with coarse shared metadata and no content", async () => {
    const tracker = createManagerOperationTracker({ uid: "manager-uid", pageVisitId });
    expect(tracker.track("offers", () => "first-result")).toBe("first-result");
    expect(tracker.track("offers", () => "second-result")).toBe("second-result");
    expect(tracker.track("issues", () => "third-result")).toBe("third-result");
    await flushDiagnosticWrite();

    expect(firebase.collection).toHaveBeenCalledWith(
      {}, "organizations", "cleanflow-demo", "managerOperationEvents",
    );
    expect(firebase.addDoc).toHaveBeenCalledTimes(3);
    const events = firebase.addDoc.mock.calls.map(([, event]) => event);
    expect(events.map(({ operation, phase }) => [operation, phase])).toEqual([
      ["offers", "initial"], ["offers", "refresh"], ["issues", "initial"],
    ]);
    expect(events[0]).toMatchObject({
      page: "job-detail", operation: "offers", phase: "initial",
      startedAtMs: expect.any(Number), durationMs: expect.any(Number),
      result: "success", uid: "manager-uid", pageVisitId,
      sessionId: expect.any(String), deviceId: expect.any(String),
      deviceClass: expect.any(String), browser: expect.any(String),
      platform: expect.any(String), standalone: expect.any(Boolean),
      viewport: { width: expect.any(Number), height: expect.any(Number) },
      appVersion: expect.any(String), createdAt: "server-time",
    });
    expect(events[1].sessionId).toBe(events[0].sessionId);
    expect(events[1].deviceId).toBe(events[0].deviceId);
    expect(JSON.stringify(events)).not.toMatch(/jobId|propertyId|cleanerId|token|rawError|email/i);
  });

  it("preserves operation rejection and ignores a failed telemetry write", async () => {
    const tracker = createManagerOperationTracker({ uid: "manager-uid", pageVisitId });
    const originalError = new Error("private operational failure text");
    firebase.addDoc.mockRejectedValue(new Error("offline"));

    await expect(tracker.track("assignments", async () => {
      throw originalError;
    })).rejects.toBe(originalError);
    await flushDiagnosticWrite();

    expect(firebase.addDoc).toHaveBeenCalledTimes(1);
    const event = firebase.addDoc.mock.calls[0][1];
    expect(event.result).toBe("error");
    expect(JSON.stringify(event)).not.toContain(originalError.message);
  });

  it("returns the original asynchronous result without waiting for diagnostic persistence", async () => {
    let finishWrite;
    firebase.addDoc.mockImplementation(() => new Promise((resolve) => { finishWrite = resolve; }));
    const tracker = createManagerOperationTracker({ uid: "manager-uid", pageVisitId });
    const result = { id: "private-job-id", price: 200, cleanerId: "private-cleaner-id" };

    await expect(tracker.track("checklist-run", async () => result)).resolves.toBe(result);
    await flushDiagnosticWrite();
    expect(firebase.addDoc).toHaveBeenCalledOnce();
    expect(firebase.addDoc.mock.calls[0][1]).not.toHaveProperty("id");
    expect(firebase.addDoc.mock.calls[0][1]).not.toHaveProperty("price");
    expect(firebase.addDoc.mock.calls[0][1]).not.toHaveProperty("cleanerId");
    finishWrite();
  });

  it("runs tasks but drops unknown operations, phases, and invalid visit IDs", async () => {
    const tracker = createManagerOperationTracker({ uid: "manager-uid", pageVisitId });
    expect(tracker.track("secret-job-id", () => 1)).toBe(1);
    expect(tracker.track("cleaners", () => 2, { phase: "unbounded phase" })).toBe(2);
    const invalidVisit = createManagerOperationTracker({ uid: "manager-uid", pageVisitId: "not-a-uuid" });
    expect(invalidVisit.track("offers", () => 3)).toBe(3);
    await flushDiagnosticWrite();
    expect(firebase.addDoc).not.toHaveBeenCalled();
  });

  it("normalizes an explicit manual refresh and absorbs a synchronous write failure", async () => {
    const tracker = createManagerOperationTracker({ uid: "manager-uid", pageVisitId });
    firebase.addDoc.mockImplementation(() => { throw new Error("offline"); });
    expect(tracker.track("checklist-run", () => "still works", { phase: "manual", jobId: "secret" }))
      .toBe("still works");
    await flushDiagnosticWrite();
    expect(firebase.addDoc.mock.calls[0][1].phase).toBe("refresh");
    expect(firebase.addDoc.mock.calls[0][1]).not.toHaveProperty("jobId");
  });
});

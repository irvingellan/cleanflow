import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { managerAvailabilityForCleaner } from "./managerAvailabilityService.js";
import { getCleanerSelectionContext } from "../jobs/jobService.js";

const mocks = vi.hoisted(() => ({ read: vi.fn(), call: vi.fn() }));
vi.mock("../../services/firebase/client.js", () => ({ db: {}, functions: {} }));
vi.mock("../../services/firebase/config.js", () => ({ managerOrganizationId: "sample" }));
vi.mock("../../services/firebase/serverReads.js", async importActual => ({
  ...await importActual(), serverFirestore: () => ({}),
}));
vi.mock("firebase/functions", () => ({ httpsCallable: (_, name) => fields => mocks.call(name, fields) }));
vi.mock("firebase/firestore/lite", async importActual => ({
  ...await importActual(),
  collection: (_, ...segments) => segments.join("/"),
  query: (path, ...filters) => ({ path, filters }),
  where: (key, op, value) => ({ key, op, value }),
  limit: count => ({ limit: count }),
  orderBy: (key, direction) => ({ key, direction }),
  getDocs: mocks.read,
}));

const scheduledDate = "2026-11-19";
const profile = managerAvailabilityForCleaner("worker");
const sample = { organizationId: "sample", cleanerId: "worker", startDate: scheduledDate, endDate: scheduledDate, createdBy: "CLEANER" };
const blocksPath = "organizations/sample/cleanerUnavailability";
const target = { jobId: "job", propertyId: "property", scheduledDate, scheduledStart: "09:00" };
const row = (id, value) => ({ id, data: () => value });
const snapshot = (...docs) => ({ docs });
const otherJob = row("other-job", { operationalStatus: "ASSIGNED", assignedCleanerId: "worker", scheduledDate, scheduledStart: "15:00" });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-20T02:30:00Z"));
  mocks.read.mockReset();
  mocks.call.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("manager availability profile service", () => {
  it("lists the targeted worker's current and future periods with the 03A composite index", async () => {
    mocks.read.mockResolvedValue(snapshot(
      row("in-scope", { ...sample, startTime: "09:00", endTime: "12:00", privateField: "extra" }),
      row("future", { ...sample, startDate: "2026-11-25", endDate: "2026-11-26", createdBy: "MANAGER" }),
      row("elsewhere", { ...sample, organizationId: "other" }),
      row("other", { ...sample, cleanerId: "another" }),
      row("expired", { ...sample, startDate: "2026-11-15", endDate: "2026-11-15" }),
      row("invalid", { ...sample, endTime: "09:00" }),
    ));
    expect(await profile.list()).toEqual({ blocks: [
      { id: "in-scope", startDate: scheduledDate, endDate: scheduledDate, startTime: "09:00", endTime: "12:00", createdBy: "CLEANER" },
      { id: "future", startDate: "2026-11-25", endDate: "2026-11-26", createdBy: "MANAGER" },
    ] });
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ path: blocksPath, filters: [
      { key: "organizationId", op: "==", value: "sample" },
      { key: "cleanerId", op: "==", value: "worker" },
      { key: "endDate", op: ">=", value: scheduledDate }, { limit: 30 },
    ] });
  });

  it("uses the authorized manager callables and binds only the selected profile and allowed period fields", async () => {
    const period = { startDate: scheduledDate, endDate: scheduledDate, startTime: "11:30", endTime: "12:00" };
    const result = { block: { ...period, id: "block", createdBy: "MANAGER" } };
    mocks.call.mockResolvedValueOnce({ data: result }).mockResolvedValueOnce({ data: { removed: false } });
    expect(await profile.set({ ...period, cleanerId: "elsewhere", reason: "extra" })).toEqual(result);
    expect(await profile.remove({ blockId: "block", cleanerId: "elsewhere" })).toEqual({ removed: false });
    expect(mocks.call.mock.calls).toEqual([
      ["setCleanerUnavailability", { cleanerId: "worker", ...period }],
      ["removeCleanerUnavailability", { cleanerId: "worker", blockId: "block" }],
    ]);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("propagates read and mutation failures to the profile", async () => {
    const denied = Object.assign(new Error(), { code: "permission-denied" });
    mocks.read.mockRejectedValue(denied);
    mocks.call.mockRejectedValue(denied);
    await expect(profile.list()).rejects.toBe(denied);
    await expect(profile.remove({ blockId: "block" })).rejects.toBe(denied);
  });
});

describe("picker availability server read", () => {
  it("makes one end-date query for all workers and filters organization, date and time in memory", async () => {
    mocks.read.mockImplementation(async ({ path, filters }) => {
      if (path === blocksPath) return snapshot(
        row("full", { ...sample, startDate: "2026-11-12", endDate: scheduledDate, privateField: "extra" }),
        row("partial", { ...sample, cleanerId: "partial", startTime: "09:00", endTime: "12:30" }),
        row("outside", { ...sample, cleanerId: "outside", startTime: "10:30", endTime: "14:00" }),
        row("future", { ...sample, cleanerId: "future", startDate: "2026-11-20", endDate: "2026-11-20" }),
        row("misplaced", { ...sample, organizationId: "other", cleanerId: "elsewhere" }),
      );
      return filters.some(filter => filter.key === "scheduledDate") ? snapshot(otherJob) : snapshot();
    });
    const result = await getCleanerSelectionContext(target);
    expect(result.byCleanerId).toEqual({
      worker: { completedHereCount: 0, lastCompletedHereDate: null, sameDayStarts: ["15:00"], unavailability: { state: "blocked", periods: [] } },
      partial: { completedHereCount: 0, lastCompletedHereDate: null, sameDayStarts: [], unavailability: {
        state: "blocked", periods: [{ startTime: "09:00", endTime: "12:30" }],
      } },
    });
    const candidateReads = mocks.read.mock.calls.filter(([read]) => read.path === blocksPath);
    expect(candidateReads).toEqual([[{ path: blocksPath, filters: [{ key: "endDate", op: ">=", value: scheduledDate }] }]]);
  });

  it("retains already-loaded job information even when the new read stalls", async () => {
    mocks.read.mockImplementation(({ path, filters }) => path === blocksPath ? new Promise(() => {})
      : Promise.resolve(filters.some(filter => filter.key === "scheduledDate") ? snapshot(otherJob) : snapshot()));
    const pending = getCleanerSelectionContext(target);
    await vi.advanceTimersByTimeAsync(8_000);
    const result = await pending;
    expect(result.availabilityUnavailable).toBe(true);
    expect(result.byCleanerId.worker.sameDayStarts).toEqual(["15:00"]);
    expect(result.schedulePartial).toBe(false);
  });

  it("keeps availability when a job query fails; propagates a complete failure", async () => {
    const failure = new Error("offline");
    mocks.read.mockImplementation(async ({ path }) => {
      if (path === blocksPath) return snapshot(row("block", sample));
      throw failure;
    });
    const result = await getCleanerSelectionContext(target);
    expect(result).toMatchObject({ historyPartial: false, schedulePartial: false, jobContextUnavailable: true, byCleanerId: {
      worker: { unavailability: { state: "blocked", periods: [] } },
    } });
    expect(result.availabilityUnavailable).toBeUndefined();
    mocks.read.mockRejectedValue(failure);
    await expect(getCleanerSelectionContext(target)).rejects.toBe(failure);
  });

  it("skips the availability read for an undated target and aborts a stale result", async () => {
    mocks.read.mockResolvedValue(snapshot());
    await getCleanerSelectionContext({ ...target, scheduledDate: null });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    const pending = getCleanerSelectionContext(target, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

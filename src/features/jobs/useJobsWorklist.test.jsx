import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getJobs: vi.fn(), getAllCleaners: vi.fn() }));
vi.mock("./jobService.js", () => ({ getJobs: mocks.getJobs }));
vi.mock("../cleaners/cleanerService.js", () => ({ getAllCleaners: mocks.getAllCleaners }));

import { useJobsWorklist } from "./useJobsWorklist.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function page(id, cursor = id, hasMore = true) {
  return {
    jobs: [{ id }], hasMore,
    nextPageCursors: {
      activeCursor: cursor, completedCursor: null,
      activeExhausted: false, completedExhausted: false,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAllCleaners.mockResolvedValue([]);
  mocks.getJobs.mockResolvedValue(page("initial-job"));
});

describe("useJobsWorklist current-query pagination", () => {
  it.each([
    ["status", "completed"], ["datePreset", "today"],
  ])("ignores old pagination rows and cursors after %s changes", async (filter, value) => {
    const oldPage = deferred();
    mocks.getJobs.mockResolvedValueOnce(page("initial-job"))
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce(page("current-job", "current-cursor"))
      .mockResolvedValueOnce(page("current-next-job", null, false));
    const { result } = renderHook(() => useJobsWorklist({ view: "job-list" }));
    await waitFor(() => expect(result.current.jobs).toEqual([{ id: "initial-job" }]));
    let pending;
    act(() => { pending = result.current.loadMore(); });
    act(() => result.current.setFilters((current) => ({ ...current, [filter]: value })));
    await waitFor(() => expect(result.current.jobs).toEqual([{ id: "current-job" }]));
    await act(async () => { oldPage.resolve(page("obsolete-job", "obsolete-cursor", false)); await pending; });
    expect(result.current.jobs).toEqual([{ id: "current-job" }]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.hasError).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
    await act(async () => { await result.current.loadMore(); });
    expect(mocks.getJobs.mock.calls[3][0][filter]).toBe(value);
    expect(mocks.getJobs.mock.calls[3][1].activeCursor).toBe("current-cursor");
    expect(result.current.jobs).toEqual([{ id: "current-job" }, { id: "current-next-job" }]);
  });

  it.each([
    ["status", "assigned"], ["datePreset", "next-7-days"],
  ])("ignores an old pagination error after %s changes", async (filter, value) => {
    const oldPage = deferred();
    mocks.getJobs.mockResolvedValueOnce(page("initial-job"))
      .mockReturnValueOnce(oldPage.promise).mockResolvedValueOnce(page("current-job"));
    const { result } = renderHook(() => useJobsWorklist({ view: "job-list" }));
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
    let pending;
    act(() => { pending = result.current.loadMore(); });
    act(() => result.current.setFilters((current) => ({ ...current, [filter]: value })));
    await waitFor(() => expect(result.current.jobs).toEqual([{ id: "current-job" }]));
    await act(async () => { oldPage.reject(new Error("obsolete query failed")); await pending; });
    expect(result.current.jobs).toEqual([{ id: "current-job" }]);
    expect(result.current.hasError).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it("does not clear a new query's pagination spinner when the old request settles", async () => {
    const oldPage = deferred();
    const currentPage = deferred();
    mocks.getJobs.mockResolvedValueOnce(page("initial-job"))
      .mockReturnValueOnce(oldPage.promise).mockResolvedValueOnce(page("current-job"))
      .mockReturnValueOnce(currentPage.promise);
    const { result } = renderHook(() => useJobsWorklist({ view: "job-list" }));
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
    let oldPending;
    act(() => { oldPending = result.current.loadMore(); });
    act(() => result.current.setFilters((current) => ({ ...current, status: "assigned" })));
    await waitFor(() => expect(result.current.jobs).toEqual([{ id: "current-job" }]));
    let currentPending;
    act(() => { currentPending = result.current.loadMore(); });
    await act(async () => { oldPage.resolve(page("obsolete-job")); await oldPending; });
    expect(result.current.isLoadingMore).toBe(true);
    await act(async () => { currentPage.resolve(page("current-next-job")); await currentPending; });
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.jobs).toEqual([{ id: "current-job" }, { id: "current-next-job" }]);
  });

  it("retains the existing merge and error behavior for current-query requests", async () => {
    mocks.getJobs.mockResolvedValueOnce(page("initial-job"))
      .mockResolvedValueOnce(page("next-job", "next-cursor"))
      .mockRejectedValueOnce(new Error("current query failed"));
    const { result } = renderHook(() => useJobsWorklist({ view: "job-list" }));
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.jobs).toEqual([{ id: "initial-job" }, { id: "next-job" }]);
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.hasError).toBe(true);
    expect(result.current.isLoadingMore).toBe(false);
  });
});

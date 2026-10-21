import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useJobsWorklist } from "./useJobsWorklist.js";
import { getJobs } from "./jobService.js";
vi.mock("./jobService.js", () => ({ getJobs: vi.fn() }));
vi.mock("../cleaners/cleanerService.js", () => ({ getAllCleaners: vi.fn(async () => []) }));
const page = { jobs: [{ id: "synthetic-job", scheduledDate: "2026-10-21" }], nextPageCursors: {}, hasMore: false };
beforeEach(() => { vi.clearAllMocks(); getJobs.mockResolvedValue(page); });
it("retry recovers a failed worklist read without navigation or mutation", async () => {
  getJobs.mockRejectedValueOnce(Error("Synthetic network failure"));
  const { result } = renderHook(() => useJobsWorklist({ view: "job-list" }));
  await waitFor(() => expect(result.current.hasError).toBe(true));
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.jobs).toEqual(page.jobs));
  expect(result.current.hasError).toBe(false); expect(getJobs).toHaveBeenCalledTimes(2);
});
it("inactive worklist does not fetch and late initial reads cannot publish after leaving", async () => {
  let finish; getJobs.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(({ view }) => useJobsWorklist({ view }), { initialProps: { view: "job-list" } });
  rerender({ view: "dashboard" });
  await act(async () => finish(page));
  expect(result.current.jobs).toEqual([]); expect(getJobs).toHaveBeenCalledTimes(1);
});
it("a late Load more page cannot mix old-filter Jobs or cursors into the new filter", async () => {
  let finish;
  const initial = { ...page, hasMore: true, nextPageCursors: { activeCursor: "old-cursor" } };
  getJobs.mockResolvedValueOnce(initial).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue({ jobs: [{ id: "assigned-only" }], hasMore: false, nextPageCursors: { activeExhausted: true } });
  const { result } = renderHook(() => useJobsWorklist({ view: "job-list" }));
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  act(() => { void result.current.loadMore(); });
  act(() => result.current.setFilters(f => ({ ...f, status: "assigned" })));
  await waitFor(() => expect(result.current.jobs).toEqual([{ id: "assigned-only" }]));
  await act(async () => finish({ jobs: [{ id: "unassigned-stale" }], hasMore: true, nextPageCursors: { activeCursor: "wrong" } }));
  expect(result.current.jobs).toEqual([{ id: "assigned-only" }]);
  expect(result.current.hasMore).toBe(false); expect(result.current.isLoadingMore).toBe(false);
});

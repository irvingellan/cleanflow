import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useJobsWorklist } from "./useJobsWorklist.js";
import { getJobs } from "./jobService.js";
import { getAllCleaners } from "../cleaners/cleanerService.js";
vi.mock("./jobService.js", () => ({ getJobs: vi.fn() }));
vi.mock("../cleaners/cleanerService.js", () => ({ getAllCleaners: vi.fn() }));
const page = id => ({ jobs: [{ id }], nextPageCursors: {}, hasMore: false });
beforeEach(() => { vi.clearAllMocks(); getAllCleaners.mockResolvedValue([]); getJobs.mockResolvedValue(page("synthetic")); });
describe("explicit Services retry reuses existing load", () => {
  it("does not add reads on repeated renders or local search", async () => {
    const { result, rerender } = renderHook(() => useJobsWorklist({ view: "job-list" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender();
    act(() => result.current.setFilters(filters => ({ ...filters, search: "demo" })));
    expect(getJobs).toHaveBeenCalledTimes(1); expect(getAllCleaners).toHaveBeenCalledTimes(1);
  });
  it("retries a failed load with the same filters and query options", async () => {
    getJobs.mockRejectedValueOnce(new Error("Synthetic failure"));
    const { result } = renderHook(() => useJobsWorklist({ view: "job-list", includeArchived: true }));
    await waitFor(() => expect(result.current.hasError).toBe(true));
    const original = getJobs.mock.calls[0];
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.jobs).toEqual(page("synthetic").jobs));
    expect(result.current.hasError).toBe(false); expect(getJobs.mock.calls[1]).toEqual(original);
  });
  it("uses existing effect cleanup to suppress an old response after retry", async () => {
    let resolveOld;
    getJobs.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const { result, unmount } = renderHook(() => useJobsWorklist({ view: "job-list" }));
    await waitFor(() => expect(getJobs).toHaveBeenCalledOnce());
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.jobs).toEqual(page("synthetic").jobs));
    await act(async () => resolveOld(page("obsolete")));
    expect(result.current.jobs).toEqual(page("synthetic").jobs);
    unmount();
  });
});

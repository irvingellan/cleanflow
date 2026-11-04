import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useJobsWorklist } from "./useJobsWorklist.js";

const mocks = vi.hoisted(() => ({ getJobs: vi.fn(), getAllCleaners: vi.fn() }));
vi.mock("./jobService.js", () => ({ getJobs: mocks.getJobs }));
vi.mock("../cleaners/cleanerService.js", () => ({ getAllCleaners: mocks.getAllCleaners }));

function page(id, cursor = null) {
  return {
    jobs: id ? [{ id }] : [], hasMore: Boolean(cursor),
    nextPageCursors: { activeCursor: cursor, completedCursor: null, activeExhausted: !cursor, completedExhausted: true },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const paneProps = { view: "job-detail", detailPaneActive: true, preserveLoadedJobs: true };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAllCleaners.mockResolvedValue([]);
});

async function openPane(firstPage = page("initial", "initial-cursor")) {
  mocks.getJobs.mockResolvedValueOnce(firstPage);
  const hook = renderHook((props) => useJobsWorklist(props), { initialProps: { view: "job-list" } });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  hook.rerender(paneProps);
  return hook;
}

describe("Services pane worklist queries", () => {
  it("reuses loaded pages on opening the pane and paginates with their original cursor", async () => {
    const { result } = await openPane();
    expect(mocks.getJobs).toHaveBeenCalledTimes(1);
    expect(mocks.getAllCleaners).toHaveBeenCalledTimes(1);
    mocks.getJobs.mockResolvedValueOnce(page("next"));
    await act(async () => result.current.loadMore());
    expect(mocks.getJobs).toHaveBeenLastCalledWith(expect.objectContaining({ status: "all", datePreset: "any" }),
      expect.objectContaining({ activeCursor: "initial-cursor" }));
    expect(result.current.jobs.map(({ id }) => id)).toEqual(["initial", "next"]);
  });

  it.each([{ status: "completed" }, { datePreset: "today" }])("reloads the first page for a pane filter %j without keeping unmatched jobs", async (updates) => {
    const { result } = await openPane();
    mocks.getJobs.mockResolvedValueOnce(page("matching"));
    act(() => result.current.setFilters((current) => ({ ...current, ...updates })));
    await waitFor(() => expect(result.current.jobs).toEqual([{ id: "matching" }]));
    expect(mocks.getJobs).toHaveBeenLastCalledWith(expect.objectContaining(updates), { includeArchived: false });
    expect(result.current.hasMore).toBe(false);
  });

  it("reloads when excluded-record scope changes, and allows clearing a filter that has no results", async () => {
    const { result, rerender } = await openPane();
    mocks.getJobs.mockResolvedValueOnce(page(null));
    rerender({ ...paneProps, includeArchived: true });
    await waitFor(() => expect(result.current.jobs).toEqual([]));
    expect(mocks.getJobs).toHaveBeenLastCalledWith(expect.any(Object), { includeArchived: true });
    mocks.getJobs.mockResolvedValueOnce(page("restored"));
    rerender(paneProps);
    await waitFor(() => expect(result.current.jobs).toEqual([{ id: "restored" }]));
  });

  it.each(["success", "error"])("ignores a previous filter's late pagination %s", async (outcome) => {
    const { result } = await openPane();
    const older = deferred();
    const replacement = deferred();
    mocks.getJobs.mockReturnValueOnce(older.promise).mockReturnValueOnce(replacement.promise);
    act(() => { void result.current.loadMore(); });
    act(() => { void result.current.loadMore(); });
    expect(mocks.getJobs).toHaveBeenCalledTimes(2);
    act(() => result.current.setFilters((current) => ({ ...current, status: "completed" })));
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.isLoading).toBe(true);
    await act(async () => outcome === "success" ? older.resolve(page("wrong-old-job", "wrong-cursor")) : older.reject(new Error("old page failed")));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasError).toBe(false);
    await act(async () => replacement.resolve(page("completed-job", "new-cursor")));
    expect(result.current.jobs).toEqual([{ id: "completed-job" }]);
    mocks.getJobs.mockResolvedValueOnce(page("next-completed"));
    await act(async () => result.current.loadMore());
    expect(mocks.getJobs).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed" }),
      expect.objectContaining({ activeCursor: "new-cursor" }));
  });

  it("keeps client-only search local and refreshes normally on return to the full list", async () => {
    const { result, rerender } = await openPane();
    act(() => result.current.setFilters((current) => ({ ...current, search: "cottage", cleanerId: "synthetic-cleaner" })));
    expect(mocks.getJobs).toHaveBeenCalledTimes(1);
    mocks.getJobs.mockResolvedValueOnce(page("fresh"));
    rerender({ view: "job-list", preserveLoadedJobs: false });
    await waitFor(() => expect(result.current.jobs).toEqual([{ id: "fresh" }]));
    expect(mocks.getJobs).toHaveBeenCalledTimes(2);
  });

  it("does not load a hidden pane for Jobs opened from other surfaces", () => {
    renderHook(() => useJobsWorklist({ view: "job-detail", detailPaneActive: false }));
    expect(mocks.getJobs).not.toHaveBeenCalled();
    expect(mocks.getAllCleaners).not.toHaveBeenCalled();
  });
});

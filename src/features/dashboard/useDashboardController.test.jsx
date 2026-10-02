import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDashboardController } from "./useDashboardController.js";
import { getOperationalDashboard } from "./dashboardService.js";

vi.mock("./dashboardService.js", () => ({ getOperationalDashboard: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
});
afterEach(() => vi.useRealTimers());

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it("bounds a dependency that never settles and permits retry without page reload", async () => {
  getOperationalDashboard.mockReturnValueOnce(new Promise(() => {}));
  const { result } = renderHook(() => useDashboardController({ view: "dashboard" }));
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(result.current.isLoading).toBe(false);
  expect(result.current.hasError).toBe(true);
  getOperationalDashboard.mockResolvedValueOnce({ counts: { today: 2 } });
  await act(() => result.current.refresh());
  expect(result.current.hasError).toBe(false);
  expect(result.current.dashboardData).toEqual({ counts: { today: 2 } });
});

it("ignores late success and rejection from expired or superseded generations", async () => {
  const old = deferred();
  getOperationalDashboard.mockReturnValueOnce(old.promise);
  const { result } = renderHook(() => useDashboardController({ view: "dashboard" }));
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  getOperationalDashboard.mockResolvedValueOnce({ generation: "new" });
  await act(() => result.current.refresh());
  await act(async () => old.resolve({ generation: "old" }));
  expect(result.current.dashboardData).toEqual({ generation: "new" });
  expect(result.current.hasError).toBe(false);

  const pending = deferred();
  getOperationalDashboard.mockReturnValueOnce(pending.promise);
  act(() => { void result.current.refresh(); });
  await act(async () => {});
  getOperationalDashboard.mockResolvedValueOnce({ generation: "latest" });
  await act(() => result.current.refresh());
  await act(async () => pending.reject(new Error("late error")));
  expect(result.current.dashboardData).toEqual({ generation: "latest" });
  expect(result.current.hasError).toBe(false);
});

it("invalidates reads on view switch, reentry and unmount, clearing deadlines", async () => {
  const old = deferred();
  getOperationalDashboard.mockReturnValueOnce(old.promise);
  const { result, rerender, unmount } = renderHook(({ view }) => useDashboardController({ view }), {
    initialProps: { view: "dashboard" },
  });
  await act(async () => {});
  rerender({ view: "job-list" });
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => old.resolve({ stale: true }));
  expect(result.current.dashboardData).toBe(null);
  getOperationalDashboard.mockResolvedValueOnce({ fresh: true });
  rerender({ view: "dashboard" });
  await act(async () => {});
  expect(result.current.dashboardData).toEqual({ fresh: true });
  getOperationalDashboard.mockReturnValueOnce(new Promise(() => {}));
  act(() => { void result.current.refresh(); });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("resume events cannot extend the deadline; manual retry gets a fresh window", async () => {
  getOperationalDashboard.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useDashboardController({ view: "dashboard" }));
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  act(() => window.dispatchEvent(new Event("pageshow")));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(getOperationalDashboard).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(result.current.hasError).toBe(true);
  act(() => { void result.current.refresh(); });
  await act(() => vi.advanceTimersByTimeAsync(19_999));
  expect(result.current.isLoading).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.current.hasError).toBe(true);
});

it("expires on resume even if browser suspension prevented the timer from running", async () => {
  const old = deferred();
  getOperationalDashboard.mockReturnValueOnce(old.promise);
  const { result } = renderHook(() => useDashboardController({ view: "dashboard" }));
  await act(async () => {});
  vi.setSystemTime(Date.now() + 21_000);
  act(() => window.dispatchEvent(new Event("pageshow")));
  expect(result.current.isLoading).toBe(false);
  expect(result.current.hasError).toBe(true);
  await act(async () => old.resolve({ late: true }));
  expect(result.current.dashboardData).toBe(null);
});

it("does not publish overdue success ahead of a suspended timer", async () => {
  const old = deferred();
  getOperationalDashboard.mockReturnValueOnce(old.promise);
  const { result } = renderHook(() => useDashboardController({ view: "dashboard" }));
  await act(async () => {});
  vi.setSystemTime(Date.now() + 21_000);
  await act(async () => old.resolve({ late: true }));
  expect(result.current.hasError).toBe(true);
  expect(result.current.dashboardData).toBe(null);
});

it("surfaces real dependency rejection without inventing data", async () => {
  getOperationalDashboard.mockRejectedValueOnce(new Error("permission-denied"));
  const { result } = renderHook(() => useDashboardController({ view: "dashboard" }));
  await act(async () => {});
  expect(result.current.hasError).toBe(true);
  expect(result.current.isLoading).toBe(false);
  expect(result.current.dashboardData).toBe(null);
  expect(vi.getTimerCount()).toBe(0);
});

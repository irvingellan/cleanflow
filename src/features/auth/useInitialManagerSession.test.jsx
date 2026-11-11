import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subscribeToAuthState } from "./authService.js";
import { recordManagerAccessDiagnostic } from "./managerAccessDiagnostics.js";
import { managerAuthDeadlineMs, useInitialManagerSession } from "./useInitialManagerSession.js";

vi.mock("./authService.js", () => ({ subscribeToAuthState: vi.fn() }));
vi.mock("./managerAccessDiagnostics.js", () => ({ recordManagerAccessDiagnostic: vi.fn() }));

let observers;
let stop;
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  observers = [];
  stop = vi.fn();
  subscribeToAuthState.mockImplementation((onChange) => {
    observers.push(onChange);
    return stop;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

it("shows a bounded failure without signing out, and a late Firebase callback resumes the same session", () => {
  const { result } = renderHook(() => useInitialManagerSession(true));
  expect(result.current.status).toBe("loading");
  advance(managerAuthDeadlineMs);
  expect(result.current).toMatchObject({ status: "error", authUser: undefined });
  expect(recordManagerAccessDiagnostic).toHaveBeenCalledWith("auth_restore_timeout", {
    attempt: 1, durationMs: managerAuthDeadlineMs, reason: "timeout",
  });
  const verifiedByAuth = { uid: "synthetic-manager" };
  act(() => observers[0](verifiedByAuth));
  expect(result.current).toMatchObject({ status: "resolved", authUser: verifiedByAuth });
  expect(subscribeToAuthState).toHaveBeenCalledOnce();
});

it("expires on resume without granting access and ignores an observer superseded by manual retry", () => {
  const { result } = renderHook(() => useInitialManagerSession(true));
  vi.setSystemTime(Date.now() + managerAuthDeadlineMs + 1);
  fireEvent(window, new Event("pageshow"));
  expect(result.current).toMatchObject({ status: "error", authUser: undefined });
  act(() => result.current.retry());
  expect(stop).toHaveBeenCalledOnce();
  act(() => observers[0]({ uid: "obsolete-user" }));
  expect(result.current.authUser).toBeUndefined();
  act(() => observers[1](null));
  expect(result.current).toMatchObject({ status: "resolved", authUser: null });
});

it("makes an actual offline transition recoverable once while lifecycle churn cannot extend the deadline", () => {
  const online = vi.spyOn(navigator, "onLine", "get");
  online.mockReturnValue(false);
  const { result } = renderHook(() => useInitialManagerSession(true));
  expect(result.current).toMatchObject({ status: "offline", authUser: undefined });
  online.mockReturnValue(true);
  fireEvent(window, new Event("online"));
  expect(result.current.status).toBe("loading");
  for (let index = 0; index < 4; index++) {
    advance(managerAuthDeadlineMs / 4);
    fireEvent(window, new Event("online"));
    fireEvent(window, new Event("pageshow"));
  }
  expect(result.current).toMatchObject({ status: "error", authUser: undefined });
  expect(subscribeToAuthState).toHaveBeenCalledOnce();
});

it("does not subscribe for public entry routes and handles a synchronous Auth exception", () => {
  const { result, rerender } = renderHook(({ enabled }) => useInitialManagerSession(enabled), {
    initialProps: { enabled: false },
  });
  expect(subscribeToAuthState).not.toHaveBeenCalled();
  subscribeToAuthState.mockImplementation(() => { throw new Error("private details"); });
  rerender({ enabled: true });
  expect(result.current).toMatchObject({ status: "error", authUser: undefined });
  expect(recordManagerAccessDiagnostic).toHaveBeenCalledWith("auth_restore_error", { attempt: 1, reason: "unknown" });
});

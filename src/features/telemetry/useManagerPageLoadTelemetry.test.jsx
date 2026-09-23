import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const telemetry = vi.hoisted(() => ({ recordManagerPageLoad: vi.fn() }));
vi.mock("./managerPageLoadService.js", () => telemetry);

import { useManagerPageLoadTelemetry } from "./useManagerPageLoadTelemetry.js";

describe("useManagerPageLoadTelemetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(callback, 1));
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    telemetry.recordManagerPageLoad.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderTelemetry(initialState = { isLoading: true, hasError: false }) {
    return renderHook(({ state }) => useManagerPageLoadTelemetry({
      user: { uid: "manager-uid", isAnonymous: false },
      view: "dashboard",
      pageStates: { dashboard: state },
    }), { initialProps: { state: initialState } });
  }

  it("records one successful timing only after the loading cycle settles", () => {
    const { rerender } = renderTelemetry();
    expect(telemetry.recordManagerPageLoad).not.toHaveBeenCalled();

    rerender({ state: { isLoading: false, hasError: false } });
    act(() => vi.runAllTimers());
    rerender({ state: { isLoading: false, hasError: false } });
    act(() => vi.runAllTimers());

    expect(telemetry.recordManagerPageLoad).toHaveBeenCalledTimes(1);
    expect(telemetry.recordManagerPageLoad).toHaveBeenCalledWith(expect.objectContaining({
      page: "dashboard", result: "success", uid: "manager-uid",
    }));
  });

  it("does not finish an initially idle render before its data load begins", () => {
    const { rerender } = renderTelemetry({ isLoading: false, hasError: false });
    rerender({ state: { isLoading: true, hasError: false } });
    act(() => vi.runAllTimers());

    expect(telemetry.recordManagerPageLoad).not.toHaveBeenCalled();

    rerender({ state: { isLoading: false, hasError: false } });
    act(() => vi.runAllTimers());

    expect(telemetry.recordManagerPageLoad).toHaveBeenCalledTimes(1);
  });

  it("records an error result once when the page load fails", () => {
    const { rerender } = renderTelemetry();
    rerender({ state: { isLoading: false, hasError: true } });
    act(() => vi.runAllTimers());

    expect(telemetry.recordManagerPageLoad).toHaveBeenCalledWith(expect.objectContaining({ result: "error" }));
  });
});

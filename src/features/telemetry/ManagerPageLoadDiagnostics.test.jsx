import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";

const hook = vi.hoisted(() => ({ useManagerPageLoadDiagnostics: vi.fn() }));
vi.mock("./useManagerPageLoadDiagnostics.js", () => hook);

import { ManagerPageLoadDiagnostics } from "./ManagerPageLoadDiagnostics.jsx";

function renderDiagnostics(overrides = {}) {
  const value = {
    windowDays: 7, setWindowDays: vi.fn(), pageFilter: "all", setPageFilter: vi.fn(),
    userFilter: "all", setUserFilter: vi.fn(), deviceFilter: "all", setDeviceFilter: vi.fn(),
    events: [{
      id: "event-1", createdAt: "2026-09-22T12:00:00.000Z", page: "jobs", durationMs: 3200,
      dataDurationMs: 2800, result: "success", uid: "manager-user-uid", sessionId: "S1234567abcdef",
      deviceId: "D7654321abcdef", deviceClass: "desktop", browser: "chrome", platform: "macos",
      connection: { effectiveType: "4g" },
    }],
    summary: {
      eventCount: 1, averageMs: 3200, medianMs: 3200, p95Ms: 3200,
      slowest: { page: "jobs", durationMs: 3200 },
      byPage: [
        { page: "dashboard", eventCount: 0, averageMs: null, p95Ms: null, slowest: null },
        { page: "jobs", eventCount: 1, averageMs: 3200, p95Ms: 3200, slowest: { durationMs: 3200 } },
      ],
    },
    users: ["manager-user-uid"], devices: ["chrome/macos"], isLoading: false,
    hasError: false, refresh: vi.fn(),
    ...overrides,
  };
  hook.useManagerPageLoadDiagnostics.mockReturnValue(value);
  return {
    ...render(<TranslationProvider><ManagerPageLoadDiagnostics onBack={vi.fn()} /></TranslationProvider>),
    diagnostics: value,
  };
}

describe("ManagerPageLoadDiagnostics", () => {
  beforeEach(() => hook.useManagerPageLoadDiagnostics.mockReset());

  it("shows summary, page aggregation, and only the existing coarse event fields", () => {
    renderDiagnostics();

    expect(screen.getByRole("heading", { name: "Manager page-load timings" })).toBeVisible();
    expect(screen.getAllByText("manager-user-uid")).toHaveLength(2);
    expect(screen.getByText("chrome/macos · desktop")).toBeVisible();
    expect(screen.getByText("4g")).toBeVisible();
    expect(screen.getByText("S1234567 / D7654321")).toBeVisible();
    expect(screen.getAllByText("3.20 s").length).toBeGreaterThan(1);
    expect(screen.getAllByText("slow").length).toBeGreaterThan(1);
    expect(screen.queryByText(/email|address|access code/i)).not.toBeInTheDocument();
  });

  it("exposes simple time/page/user/device filters", () => {
    const { diagnostics: { setWindowDays, setPageFilter, setUserFilter, setDeviceFilter } } = renderDiagnostics();

    fireEvent.change(screen.getByLabelText("Time window"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Page"), { target: { value: "jobs" } });
    fireEvent.change(screen.getByLabelText("User / UID"), { target: { value: "manager-user-uid" } });
    fireEvent.change(screen.getByLabelText("Device / browser"), { target: { value: "chrome/macos" } });

    expect(setWindowDays).toHaveBeenCalledWith(30);
    expect(setPageFilter).toHaveBeenCalledWith("jobs");
    expect(setUserFilter).toHaveBeenCalledWith("manager-user-uid");
    expect(setDeviceFilter).toHaveBeenCalledWith("chrome/macos");
  });

  it("shows localized loading, empty, and error states", () => {
    const { rerender } = renderDiagnostics({ isLoading: true });
    expect(screen.getByText("Loading page-load events…")).toBeVisible();

    hook.useManagerPageLoadDiagnostics.mockReturnValue({
      windowDays: 7, setWindowDays: vi.fn(), pageFilter: "all", setPageFilter: vi.fn(),
      userFilter: "all", setUserFilter: vi.fn(), deviceFilter: "all", setDeviceFilter: vi.fn(),
      events: [], summary: { eventCount: 0, averageMs: null, medianMs: null, p95Ms: null, slowest: null, byPage: [] },
      users: [], devices: [], isLoading: false, hasError: false, refresh: vi.fn(),
    });
    rerender(<TranslationProvider><ManagerPageLoadDiagnostics onBack={vi.fn()} /></TranslationProvider>);
    expect(screen.getByText("No page-load events in this time window.")).toBeVisible();

    hook.useManagerPageLoadDiagnostics.mockReturnValue({
      windowDays: 7, setWindowDays: vi.fn(), pageFilter: "all", setPageFilter: vi.fn(),
      userFilter: "all", setUserFilter: vi.fn(), deviceFilter: "all", setDeviceFilter: vi.fn(),
      events: [], summary: { eventCount: 0, averageMs: null, medianMs: null, p95Ms: null, slowest: null, byPage: [] },
      users: [], devices: [], isLoading: false, hasError: true, refresh: vi.fn(),
    });
    rerender(<TranslationProvider><ManagerPageLoadDiagnostics onBack={vi.fn()} /></TranslationProvider>);
    expect(screen.getByText("Unable to load page-load events.")).toBeVisible();
  });
});

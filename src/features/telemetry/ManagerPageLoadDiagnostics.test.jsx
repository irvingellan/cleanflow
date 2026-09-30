import { fireEvent, render, screen, within } from "@testing-library/react";
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
    operationEvents: [], operationSummary: [], jobDetailVisits: [],
    operationIsLoading: false, operationHasError: false,
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
  beforeEach(() => {
    hook.useManagerPageLoadDiagnostics.mockReset();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("shows summary, page aggregation, and only the existing coarse event fields", () => {
    renderDiagnostics();

    expect(screen.getByRole("heading", { name: "Manager page-load timings" })).toBeVisible();
    expect(screen.getAllByText("manager-user-uid")).toHaveLength(1);
    expect(screen.getByTitle("manager-user-uid")).toHaveTextContent("manager-");
    expect(screen.getByText("chrome/macos · desktop")).toBeVisible();
    expect(screen.getByText("4g")).toBeVisible();
    expect(screen.getByText("S1234567 / D7654321")).toBeVisible();
    expect(screen.getByTitle("S1234567abcdef / D7654321abcdef")).toHaveTextContent("S1234567 / D7654321");
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

  it("shows operation summaries and a selectable parallel Job Detail waterfall", () => {
    renderDiagnostics({
      operationEvents: [{ id: "offers-event" }, { id: "issues-event" }],
      operationSummary: [
        { operation: "offers", eventCount: 1, averageMs: 400, p95Ms: 400, slowest: { durationMs: 400 }, errorCount: 0 },
        { operation: "issues", eventCount: 1, averageMs: 200, p95Ms: 200, slowest: { durationMs: 200 }, errorCount: 1 },
      ],
      jobDetailVisits: [
        {
          id: "visit-123456789", latestAtMs: Date.UTC(2026, 8, 22, 12), startedAtMs: 1000, spanMs: 400,
          events: [
            { id: "offers-event", operation: "offers", phase: "initial", startedAtMs: 1000, durationMs: 400, result: "success", uid: "manager-user-uid", browser: "safari", platform: "ios", deviceClass: "mobile" },
            { id: "issues-event", operation: "issues", phase: "initial", startedAtMs: 1050, durationMs: 200, result: "error", uid: "manager-user-uid", browser: "safari", platform: "ios", deviceClass: "mobile" },
          ],
        },
        {
          id: "visit-2", latestAtMs: Date.UTC(2026, 8, 21, 12), startedAtMs: 2000, spanMs: 100,
          events: [{ id: "refresh-event", operation: "offers", phase: "refresh", startedAtMs: 2000, durationMs: 100, result: "success", uid: "other-manager", browser: "chrome", platform: "android", deviceClass: "mobile" }],
        },
      ],
    });

    const operations = screen.getByRole("region", { name: "Operation timings" });
    const visits = screen.getByRole("region", { name: "Recent Job Detail visits" });
    expect(within(operations).getByRole("table")).toHaveTextContent("Offers");
    expect(within(operations).getByRole("table")).toHaveTextContent("Errors");
    expect(within(operations).getByRole("table")).toHaveTextContent("1");
    const waterfall = within(visits).getByRole("list", { name: "Operation timing waterfall" });
    expect(within(waterfall).getAllByRole("listitem")).toHaveLength(2);
    expect(waterfall).toHaveTextContent("+50 ms · 200 ms · Error");
    expect(waterfall.querySelectorAll(".load-diagnostics__waterfall-bar")[1]).toHaveStyle({ left: "12.5%", width: "50%" });
    expect(within(visits).getByText(/Latest event:/)).toHaveTextContent("User: manager-");
    expect(within(visits).getByText(/Latest event:/)).toHaveTextContent("Device: safari/ios · mobile");
    expect(within(visits).getByText(/Latest event:/)).toHaveTextContent("Observed span: 400 ms");
    expect(visits.parentElement).toBe(operations.parentElement);
    expect(operations).toHaveClass("load-diagnostics__section--alongside");
    expect(screen.getByRole("region", { name: "By page" })).toHaveClass("load-diagnostics__section--by-page");
    expect(visits.compareDocumentPosition(screen.getByRole("region", { name: "Events" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Visit"), { target: { value: "visit-2" } });
    expect(within(visits).getByRole("list", { name: "Operation timing waterfall" })).toHaveTextContent("Refresh");
    expect(within(visits).getByText(/Latest event:/)).toHaveTextContent("Device: chrome/android · mobile");
    expect(within(visits).getByText(/Latest event:/)).toHaveTextContent("Observed span: 100 ms");
  });

  it("preserves the 600-second success outlier and its sub-second data duration", () => {
    const { diagnostics, rerender } = renderDiagnostics();
    diagnostics.events[0] = { ...diagnostics.events[0], durationMs: 600000, dataDurationMs: 480 };
    diagnostics.summary = {
      ...diagnostics.summary, averageMs: 600000, medianMs: 600000, p95Ms: 600000,
      slowest: { page: "jobs", durationMs: 600000 },
    };
    hook.useManagerPageLoadDiagnostics.mockReturnValue(diagnostics);
    rerender(<TranslationProvider><ManagerPageLoadDiagnostics onBack={vi.fn()} /></TranslationProvider>);
    const events = screen.getByRole("region", { name: "Events" });
    expect(within(events).getByText("600.00 s")).toBeVisible();
    expect(within(events).getByText("Data: 480 ms")).toBeVisible();
    expect(within(events).getByText("Success")).toBeVisible();
    expect(screen.getAllByText("600.00 s")).toHaveLength(4);
    expect(diagnostics.summary.averageMs).toBe(600000);
    expect(diagnostics.events[0].durationMs).toBe(600000);
  });

  it("mounts the shared scroll control only after meaningful scroll", () => {
    renderDiagnostics();
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();
    Object.defineProperty(window, "scrollY", { value: 600, configurable: true });
    fireEvent.scroll(window);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();
    Object.defineProperty(window, "scrollY", { value: 601, configurable: true });
    fireEvent.scroll(window);
    expect(screen.getByRole("button", { name: "Back to top" })).toHaveClass("scroll-to-top-button");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    fireEvent.scroll(window);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();
  });

  it("keeps page-load results visible when the operation read fails", () => {
    renderDiagnostics({ operationHasError: true });
    expect(screen.getByRole("heading", { name: "By page" })).toBeVisible();
    expect(screen.getByText("Unable to load operation timings.")).toBeVisible();
  });

  it("keeps operation diagnostics full width when page-load data is unavailable", () => {
    renderDiagnostics({ hasError: true });
    expect(screen.getByRole("region", { name: "Operation timings" }))
      .not.toHaveClass("load-diagnostics__section--alongside");
  });

  it("shows localized loading, empty, and error states", () => {
    const { rerender } = renderDiagnostics({ isLoading: true });
    expect(screen.getByText("Loading page-load events…")).toBeVisible();

    hook.useManagerPageLoadDiagnostics.mockReturnValue({
      windowDays: 7, setWindowDays: vi.fn(), pageFilter: "all", setPageFilter: vi.fn(),
      userFilter: "all", setUserFilter: vi.fn(), deviceFilter: "all", setDeviceFilter: vi.fn(),
      events: [], summary: { eventCount: 0, averageMs: null, medianMs: null, p95Ms: null, slowest: null, byPage: [] },
      operationEvents: [], operationSummary: [], jobDetailVisits: [], operationIsLoading: false, operationHasError: false,
      users: [], devices: [], isLoading: false, hasError: false, refresh: vi.fn(),
    });
    rerender(<TranslationProvider><ManagerPageLoadDiagnostics onBack={vi.fn()} /></TranslationProvider>);
    expect(screen.getByText("No page-load events in this time window.")).toBeVisible();

    hook.useManagerPageLoadDiagnostics.mockReturnValue({
      windowDays: 7, setWindowDays: vi.fn(), pageFilter: "all", setPageFilter: vi.fn(),
      userFilter: "all", setUserFilter: vi.fn(), deviceFilter: "all", setDeviceFilter: vi.fn(),
      events: [], summary: { eventCount: 0, averageMs: null, medianMs: null, p95Ms: null, slowest: null, byPage: [] },
      operationEvents: [], operationSummary: [], jobDetailVisits: [], operationIsLoading: false, operationHasError: false,
      users: [], devices: [], isLoading: false, hasError: true, refresh: vi.fn(),
    });
    rerender(<TranslationProvider><ManagerPageLoadDiagnostics onBack={vi.fn()} /></TranslationProvider>);
    expect(screen.getByText("Unable to load page-load events.")).toBeVisible();
  });
});

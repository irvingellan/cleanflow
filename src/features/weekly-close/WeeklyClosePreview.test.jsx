import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { WeeklyClosePreview } from "./WeeklyClosePreview.jsx";
import { buildWeeklyClose } from "./weeklyCloseModel.js";
import { loadWeeklyClose } from "./weeklyCloseService.js";

vi.mock("./weeklyCloseService.js", () => ({ loadWeeklyClose: vi.fn() }));
const weekStart = "2026-09-21";
const originalPeriod = { start: weekStart, end: "2026-09-27" };
const result = () => buildWeeklyClose({ weekStart, jobs: [{
  id: "fixture-job", organizationId: "cleanflow-demo", dataProvenance: "REAL",
  operationalStatus: "COMPLETED", scheduledDate: "2026-09-22", clientId: "client",
  clientName: "Example Client", propertyName: "Example Property",
  assignedCleanerId: "cleaner", assignedCleanerName: "Example Cleaner",
  clientPrice: 200, cleanerPayout: 100, legacyPayoutEligible: true,
  notes: "PRIVATE_NOTE", keyCodeInfo: "PRIVATE_ACCESS",
}] });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const mount = () => render(<TranslationProvider><WeeklyClosePreview onBack={vi.fn()} /></TranslationProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  window.localStorage.setItem("cleanflow-language", "en");
  loadWeeklyClose.mockResolvedValue(result());
});
afterEach(() => { vi.useRealTimers(); });

describe("Weekly Close manager preview", () => {
  it("does not expire a completed load when the browser resumes after its deadline", async () => {
    mount(); await screen.findByText("Example Client", { selector: "strong" });
    vi.setSystemTime(new Date("2026-10-01T12:00:16Z"));
    fireEvent(window, new Event("pageshow"));
    fireEvent(window, new Event("online"));
    expect(screen.getByText("Example Client", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows one missing margin service while general readiness has two attention services", async () => {
    const base = {
      dataProvenance: "REAL", operationalStatus: "COMPLETED", scheduledDate: "2026-09-22",
      clientId: "client", clientName: "Example Client", assignedCleanerId: "cleaner",
      assignedCleanerName: "Example Cleaner", cleanerPayout: 100, legacyPayoutEligible: true,
    };
    const model = buildWeeklyClose({ weekStart, jobs: [
      { ...base, id: "missing-charge" },
      { ...base, id: "unknown-payment", schemaVersion: 2, assignedCleanerIds: ["cleaner"], clientPrice: 200 },
    ], cleanerNamesById: { cleaner: "Example Cleaner" } });
    expect(model.overall).toMatchObject({ attentionCount: 2, missingGrossMarginCount: 1 });
    loadWeeklyClose.mockResolvedValueOnce(model);
    mount(); await screen.findByText("Example Client", { selector: "strong" });
    const margin = within(document.querySelector(".weekly-close-metrics"))
      .getByText("Gross operational margin").parentElement;
    expect(margin).toHaveTextContent("1 service missing data");
    expect(margin).not.toHaveTextContent("2 services missing data");
    expect(document.querySelector(".weekly-close-client summary")).toHaveTextContent("1 service missing data");
    expect(document.querySelector(".weekly-close-attention")).toHaveTextContent("2 services need attention");
  });
  it("shows known client subtotals without presenting incomplete totals as complete", async () => {
    const model = result();
    model.clients[0].clientCharges = null;
    loadWeeklyClose.mockResolvedValueOnce(model);
    mount(); await screen.findByText("Example Client", { selector: "strong" });
    const summary = document.querySelector(".weekly-close-client summary");
    expect(summary.textContent).toContain("Incomplete");
    expect(summary.textContent).not.toContain("Unknown");
    expect(summary.textContent).toContain("200");
  });
  it.each([
    ["en", "Incomplete", "Unknown", "1 service missing data", "in this selection"],
    ["pt", "Incompleto", "Desconhecido", "1 serviço com dados pendentes", "nesta seleção"],
    ["es", "Incompleto", "Desconocido", "1 servicio con datos pendientes", "en esta selección"],
  ])("separates incomplete aggregates from factual unknown rows in %s", async (language, incomplete, unknown, pending, readiness) => {
    window.localStorage.setItem("cleanflow-language", language);
    const model = buildWeeklyClose({ weekStart, jobs: [{
      id: "incomplete", dataProvenance: "REAL", operationalStatus: "COMPLETED",
      scheduledDate: "2026-09-22", clientId: "client", clientName: "Example Client",
      clientPrice: undefined, cleanerPayout: 100, schemaVersion: 2,
    }] });
    loadWeeklyClose.mockResolvedValueOnce(model);
    mount(); await screen.findByText("Example Client", { selector: "strong" });
    const metrics = document.querySelector(".weekly-close-metrics");
    expect(metrics.textContent).toContain(incomplete);
    expect(metrics.textContent).not.toContain(unknown);
    expect(metrics.textContent).toContain(pending);
    expect(document.querySelector(".weekly-close-client summary").textContent).toContain(incomplete);
    expect(document.querySelector(".weekly-close-status").textContent).toBe(unknown);
    expect(document.querySelector(".weekly-close-attention").textContent).toContain(readiness);
    expect(document.querySelector(".weekly-close-preview").textContent).not.toContain("weeklyClose.");
  });
  it.each([
    ["en", "All included services have complete reconciliation data for this CleanFlow view."],
    ["pt", "Todos os serviços incluídos têm dados completos de reconciliação para esta visão do CleanFlow."],
    ["es", "Todos los servicios incluidos tienen datos completos de conciliación para esta vista de CleanFlow."],
  ])("zero attention communicates complete view data only in %s", async (language, copy) => {
    window.localStorage.setItem("cleanflow-language", language);
    mount(); await screen.findByText("Example Client", { selector: "strong" });
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByText(copy).textContent).not.toMatch(/paid|invoice|week closed/i);
  });
  it("resume checks the absolute deadline without renewing a suspended load", async () => {
    const pending = deferred(); loadWeeklyClose.mockReturnValueOnce(pending.promise);
    mount(); vi.setSystemTime(new Date("2026-10-01T12:00:16Z"));
    fireEvent(window, new Event("pageshow"));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be verified");
    await act(async () => pending.resolve(result()));
    expect(document.querySelector(".weekly-close-metrics")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("Example Client", { selector: "strong" });
  });
  it("unmount invalidates a pending week response", async () => {
    const pending = deferred(); loadWeeklyClose.mockReturnValueOnce(pending.promise);
    const view = mount(); view.unmount();
    await act(async () => pending.resolve(result()));
    expect(document.querySelector(".weekly-close-preview")).toBeNull();
  });
  it("opens the previous LA service week with reconciled read-only client rows", async () => {
    mount();
    await screen.findByText("Example Client", { selector: "strong" });
    expect(loadWeeklyClose).toHaveBeenCalledExactlyOnceWith(originalPeriod, { signal: expect.any(AbortSignal) });
    expect(screen.getByLabelText("Service date from")).toHaveValue(weekStart);
    const group = document.querySelector(".weekly-close-client");
    fireEvent.click(within(group).getByText("Example Client", { selector: "strong" }));
    expect(group.querySelector(".weekly-close-job").textContent).toContain("Example Cleaner");
    expect(group.querySelector(".weekly-close-job").textContent).toContain("Outstanding");
    expect(document.querySelector(".weekly-close-preview").textContent).not.toMatch(/PRIVATE_|fixture-job/);
    expect(screen.queryByRole("button", { name: /invoice|mark paid|record payment/i })).not.toBeInTheDocument();
  });

  it("applies explicit inclusive dates and keeps quick weeks and manual refresh", async () => {
    mount(); await screen.findByText("Example Client", { selector: "strong" });
    fireEvent.change(screen.getByLabelText("Service date from"), { target: { value: "2026-09-24" } });
    expect(loadWeeklyClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
    await screen.findByText("Example Client", { selector: "strong" });
    expect(loadWeeklyClose).toHaveBeenLastCalledWith({ start: "2026-09-24", end: "2026-09-27" }, { signal: expect.any(AbortSignal) });
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    await screen.findByText("Example Client", { selector: "strong" });
    expect(loadWeeklyClose).toHaveBeenLastCalledWith({ start: "2026-09-28", end: "2026-10-04" }, { signal: expect.any(AbortSignal) });
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await screen.findByText("Example Client", { selector: "strong" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("Example Client", { selector: "strong" });
    expect(loadWeeklyClose).toHaveBeenCalledTimes(5);
  });

  it("rejects invalid bounds without querying an unbounded period", async () => {
    mount(); await screen.findByText("Example Client", { selector: "strong" });
    fireEvent.change(screen.getByLabelText("Service date through"), { target: { value: "2026-10-22" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
    expect(screen.getByRole("alert")).toHaveTextContent("up to 31 days");
    expect(screen.getByLabelText("Service date through")).toHaveAttribute("aria-invalid", "true");
    expect(loadWeeklyClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Example Client", { selector: "strong" })).toBeInTheDocument();
  });

  it("filters loaded rows and totals by canonical client ID without changing the query coverage", async () => {
    const row = { dataProvenance: "REAL", operationalStatus: "COMPLETED", scheduledDate: "2026-09-22",
      clientName: "Same Name", cleanerPayout: 60, assignedCleanerId: "cleaner", legacyPayoutEligible: true };
    const partial = buildWeeklyClose({ period: originalPeriod, coverage: { limit: 200, scanned: 200, truncated: true }, jobs: [
      { ...row, id: "a", clientId: "client-a", clientPrice: 100, propertyName: "First Property" },
      { ...row, id: "b", clientId: "client-b", clientPrice: 250, propertyName: "Second Property" },
    ], cleanerNamesById: { cleaner: "Example Cleaner" } });
    loadWeeklyClose.mockResolvedValueOnce(partial);
    mount();
    const selector = await screen.findByLabelText("Client");
    expect(within(selector).getAllByRole("option", { name: "Same Name" })).toHaveLength(2);
    fireEvent.change(selector, { target: { value: "id:client-b" } });
    expect(screen.getByText("Second Property")).toBeInTheDocument();
    expect(screen.queryByText("First Property")).not.toBeInTheDocument();
    const metrics = document.querySelector(".weekly-close-metrics");
    expect(within(metrics).getByText("Completed services loaded").parentElement).toHaveTextContent("1");
    expect(within(metrics).getByText("Client charges").parentElement).toHaveTextContent(/Incomplete.*Known subtotal:.*250/);
    expect(screen.getByText(/Partial results.*Choose shorter date ranges/)).toBeInTheDocument();
    expect(screen.queryByText(/All included services have complete/)).not.toBeInTheDocument();
    expect(loadWeeklyClose).toHaveBeenCalledTimes(1);
  });

  it("does not call an empty truncated range empty of services", async () => {
    loadWeeklyClose.mockResolvedValueOnce(buildWeeklyClose({
      period: originalPeriod, coverage: { limit: 200, scanned: 200, truncated: true },
    }));
    mount(); await screen.findByText(/No eligible services in the loaded records/);
    expect(screen.queryByText(/No completed REAL services for this selection/)).not.toBeInTheDocument();
  });

  it("ignores a stale response after the selected week changes", async () => {
    const old = deferred(); loadWeeklyClose.mockReturnValueOnce(old.promise);
    mount(); fireEvent.click(screen.getByRole("button", { name: "This week" }));
    await screen.findByText("Example Client", { selector: "strong" });
    await act(async () => { old.resolve({ ...result(), clients: [] }); });
    expect(screen.getByText("Example Client", { selector: "strong" })).toBeInTheDocument();
  });

  it("settles a stalled read in 15 seconds without fabricated totals and permits retry", async () => {
    vi.useFakeTimers();
    loadWeeklyClose.mockReturnValueOnce(new Promise(() => {})); mount();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole("alert")).toHaveTextContent("could not be verified");
    expect(document.querySelector(".weekly-close-metrics")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("Example Client", { selector: "strong" })).toBeInTheDocument();
  });

  it.each([["pt", "Fechamento semanal", "Data inicial do serviço"], ["es", "Cierre semanal", "Fecha inicial del servicio"]])("renders %s without untranslated keys", async (language, title, label) => {
    window.localStorage.setItem("cleanflow-language", language); mount();
    await screen.findByText("Example Client", { selector: "strong" });
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(document.querySelector(".weekly-close-preview").textContent).not.toContain("weeklyClose.");
  });
});

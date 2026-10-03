import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { WeeklyClosePreview } from "./WeeklyClosePreview.jsx";
import { buildWeeklyClose } from "./weeklyCloseModel.js";
import { loadWeeklyClose } from "./weeklyCloseService.js";

vi.mock("./weeklyCloseService.js", () => ({ loadWeeklyClose: vi.fn() }));
const weekStart = "2026-09-21";
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
    mount(); await screen.findByText("Example Client");
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
    mount(); await screen.findByText("Example Client");
    const summary = document.querySelector(".weekly-close-client summary");
    expect(summary.textContent).toContain("Incomplete");
    expect(summary.textContent).not.toContain("Unknown");
    expect(summary.textContent).toContain("200");
  });
  it.each([
    ["en", "Incomplete", "Unknown", "1 service missing data", "before this week can be fully reconciled"],
    ["pt", "Incompleto", "Desconhecido", "1 serviço com dados pendentes", "antes que esta semana possa ser totalmente reconciliada"],
    ["es", "Incompleto", "Desconocido", "1 servicio con datos pendientes", "antes de que esta semana pueda conciliarse completamente"],
  ])("separates incomplete aggregates from factual unknown rows in %s", async (language, incomplete, unknown, pending, readiness) => {
    window.localStorage.setItem("cleanflow-language", language);
    const model = buildWeeklyClose({ weekStart, jobs: [{
      id: "incomplete", dataProvenance: "REAL", operationalStatus: "COMPLETED",
      scheduledDate: "2026-09-22", clientId: "client", clientName: "Example Client",
      clientPrice: undefined, cleanerPayout: 100, schemaVersion: 2,
    }] });
    loadWeeklyClose.mockResolvedValueOnce(model);
    mount(); await screen.findByText("Example Client");
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
    mount(); await screen.findByText("Example Client");
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
    await screen.findByText("Example Client");
  });
  it("unmount invalidates a pending week response", async () => {
    const pending = deferred(); loadWeeklyClose.mockReturnValueOnce(pending.promise);
    const view = mount(); view.unmount();
    await act(async () => pending.resolve(result()));
    expect(document.querySelector(".weekly-close-preview")).toBeNull();
  });
  it("opens the previous LA service week with reconciled read-only client rows", async () => {
    mount();
    await screen.findByText("Example Client");
    expect(loadWeeklyClose).toHaveBeenCalledExactlyOnceWith(weekStart);
    expect(screen.getByLabelText("Week starting")).toHaveValue(weekStart);
    const group = document.querySelector(".weekly-close-client");
    fireEvent.click(within(group).getByText("Example Client"));
    expect(group.querySelector(".weekly-close-job").textContent).toContain("Example Cleaner");
    expect(group.querySelector(".weekly-close-job").textContent).toContain("Outstanding");
    expect(document.querySelector(".weekly-close-preview").textContent).not.toMatch(/PRIVATE_|fixture-job/);
    expect(screen.queryByRole("button", { name: /invoice|mark paid|record payment/i })).not.toBeInTheDocument();
  });

  it("normalizes explicit dates and provides previous/current week plus manual refresh", async () => {
    mount(); await screen.findByText("Example Client");
    fireEvent.change(screen.getByLabelText("Week starting"), { target: { value: "2026-09-24" } });
    expect(screen.getByLabelText("Week starting")).toHaveValue(weekStart);
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    await screen.findByText("Example Client");
    expect(loadWeeklyClose).toHaveBeenLastCalledWith("2026-09-28");
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await screen.findByText("Example Client");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("Example Client");
    expect(loadWeeklyClose).toHaveBeenCalledTimes(4);
  });

  it("ignores a stale response after the selected week changes", async () => {
    const old = deferred(); loadWeeklyClose.mockReturnValueOnce(old.promise);
    mount(); fireEvent.click(screen.getByRole("button", { name: "This week" }));
    await screen.findByText("Example Client");
    await act(async () => { old.resolve({ ...result(), clients: [] }); });
    expect(screen.getByText("Example Client")).toBeInTheDocument();
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
    expect(screen.getByText("Example Client")).toBeInTheDocument();
  });

  it.each([["pt", "Fechamento semanal", "Semana iniciando em"], ["es", "Cierre semanal", "Semana que comienza"]])("renders %s without untranslated keys", async (language, title, label) => {
    window.localStorage.setItem("cleanflow-language", language); mount();
    await screen.findByText("Example Client");
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(document.querySelector(".weekly-close-preview").textContent).not.toContain("weeklyClose.");
  });
});

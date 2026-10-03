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
  it("shows known client subtotals without presenting incomplete totals as complete", async () => {
    const model = result();
    model.clients[0].clientCharges = null;
    loadWeeklyClose.mockResolvedValueOnce(model);
    mount(); await screen.findByText("Example Client");
    const summary = document.querySelector(".weekly-close-client summary");
    expect(summary.textContent).toContain("Unknown");
    expect(summary.textContent).toContain("200");
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

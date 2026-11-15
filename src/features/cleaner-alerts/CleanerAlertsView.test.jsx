import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";

vi.mock("../cleaners/cleanerHubAccessService.js", () => ({ cleanerHubUrl: () => "https://app.example.test/agenda" }));
vi.mock("./cleanerAlertsService.js", () => ({ loadCleanerAlerts: vi.fn(), setCleanerPushAlerts: vi.fn() }));
const { CleanerAlertsView } = await import("./CleanerAlertsView.jsx");

const rows = [
  { cleaner: { id: "a", name: "Ana Example", phone: "+1 555 0100", preferredLanguage: "pt" }, state: "no-device" },
  { cleaner: { id: "b", name: "Bia Example" }, state: "alerts-off" },
  { cleaner: { id: "c", name: "Cris Example" }, state: "ready", devices: 2 },
];

function renderView(service) {
  return render(<TranslationProvider><CleanerAlertsView onBack={() => {}} onOpenCleaner={vi.fn()} service={service} /></TranslationProvider>);
}

describe("CleanerAlertsView", () => {
  it("summarizes readiness and sends the activation steps without codes", async () => {
    renderView({ loadCleanerAlerts: vi.fn().mockResolvedValue(rows), setCleanerPushAlerts: vi.fn() });
    expect(await screen.findByText(/1 of 3 cleaners get phone alerts|1 de 3 cleaners recebem/)).toBeTruthy();
    const ana = screen.getByText("Ana Example").closest("li");
    const link = within(ana).getByRole("link");
    const text = decodeURIComponent(link.getAttribute("href"));
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/15550100\?text=/);
    expect(text).toContain("Olá, Ana Example!");
    expect(text).toContain("https://app.example.test/agenda");
    expect(text).toContain("Ativar avisos neste aparelho");
    expect(text).not.toMatch(/code|código/i);
  });

  it("turns alerts on for a cleaner and reloads", async () => {
    const service = { loadCleanerAlerts: vi.fn().mockResolvedValue(rows), setCleanerPushAlerts: vi.fn().mockResolvedValue({}) };
    renderView(service);
    const bia = (await screen.findByText("Bia Example")).closest("li");
    fireEvent.click(within(bia).getByRole("button", { name: /turn on alerts|ligar avisos/i }));
    await waitFor(() => expect(service.setCleanerPushAlerts).toHaveBeenCalledWith("b", true));
    await waitFor(() => expect(service.loadCleanerAlerts).toHaveBeenCalledTimes(2));
  });

  it("shows an error state when the check fails", async () => {
    renderView({ loadCleanerAlerts: vi.fn().mockRejectedValue(new Error("offline")), setCleanerPushAlerts: vi.fn() });
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});

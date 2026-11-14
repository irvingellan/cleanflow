import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { buildCleanerAgenda } from "./cleanerAgendaModel.js";

const loadCleanerAgenda = vi.fn();
vi.mock("./cleanerAgendaService.js", () => ({ loadCleanerAgenda: (...args) => loadCleanerAgenda(...args) }));

const { CleanerAgendaView } = await import("./CleanerAgendaView.jsx");

const jobs = [
  { id: "j1", propertyId: "p1", scheduledDate: "2026-11-17", scheduledStart: "11:00", operationalStatus: "ASSIGNED",
    schemaVersion: 2, assignedCleanerIds: ["c1"], dataProvenance: "REAL" },
  { id: "j2", propertyId: "p1", scheduledDate: "2026-11-18", operationalStatus: "UNASSIGNED",
    schemaVersion: 2, assignedCleanerIds: [], dataProvenance: "REAL" },
  { id: "j3", propertyId: "p1", scheduledDate: "2026-11-16", operationalStatus: "COMPLETED", cleanerPayout: 90,
    schemaVersion: 2, assignedCleanerIds: ["c1"], dataProvenance: "REAL" },
];

beforeEach(() => {
  loadCleanerAgenda.mockReset();
  loadCleanerAgenda.mockImplementation(async (period) => ({
    ...buildCleanerAgenda({
      period, jobs: jobs.map((job) => ({ ...job, scheduledDate: period.start })),
      cleaners: [{ id: "c1", name: "Ana Example", phone: "+1 555 0100", preferredLanguage: "pt" }],
      properties: [{ id: "p1", name: "Lake House", address: "100 Example St" }],
    }),
    coverage: { truncated: false, limit: 200 },
    jobsById: new Map(jobs.map((job) => [job.id, job])),
  }));
});

describe("CleanerAgendaView", () => {
  it("shows each cleaner's week with a WhatsApp message and opens a service", async () => {
    const onOpenJob = vi.fn();
    render(<TranslationProvider><CleanerAgendaView onBack={() => {}} onOpenJob={onOpenJob} /></TranslationProvider>);
    const group = await screen.findByRole("article", { name: "Ana Example" });
    expect(within(group).getAllByText("100 Example St")).toHaveLength(2);
    const link = within(group).getByRole("link");
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/15550100\?text=/);
    expect(decodeURIComponent(link.getAttribute("href"))).toContain("Lake House — 100 Example St");
    fireEvent.click(within(group).getAllByRole("button", { name: /Lake House/ })[0]);
    expect(onOpenJob).toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringMatching(/^j[13]$/) }));
  });

  it("lists services without a cleaner and completed services with payouts", async () => {
    render(<TranslationProvider><CleanerAgendaView onBack={() => {}} onOpenJob={() => {}} /></TranslationProvider>);
    await screen.findByRole("article", { name: "Ana Example" });
    fireEvent.click(screen.getByRole("button", { name: /without cleaner|sem cleaner/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /completed|concluídas/i }));
    const group = screen.getByRole("article", { name: "Ana Example" });
    expect(within(group).getAllByText(/90/).length).toBeGreaterThan(0);
  });
});

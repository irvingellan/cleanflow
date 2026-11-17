import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
    source: {
      period, jobs: jobs.map((job) => ({ ...job, scheduledDate: period.start })),
      cleaners: [{ id: "c1", name: "Ana Example", phone: "+1 555 0100", preferredLanguage: "pt" }],
      properties: [{ id: "p1", name: "Lake House", address: "100 Example St", clientId: "cl1" }],
      clients: [{ id: "cl1", name: "North Rentals" }],
    },
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

describe("CleanerAgendaView house and client filters", () => {
  it("narrows the agenda to one house or one client and clears back", async () => {
    const two = [
      { id: "h1", propertyId: "p1", operationalStatus: "ASSIGNED", schemaVersion: 2, assignedCleanerIds: ["c1"], dataProvenance: "REAL" },
      { id: "h2", propertyId: "p2", operationalStatus: "ASSIGNED", schemaVersion: 2, assignedCleanerIds: ["c1"], dataProvenance: "REAL" },
    ];
    loadCleanerAgenda.mockImplementation(async (period) => {
      const source = {
        period, jobs: two.map((job) => ({ ...job, scheduledDate: period.start })),
        cleaners: [{ id: "c1", name: "Ana Example", phone: "+1 555 0100", preferredLanguage: "pt" }],
        properties: [
          { id: "p1", name: "Lake House", address: "100 Example St", clientId: "cl1" },
          { id: "p2", name: "Garden Studio", address: "22 Sample Ave", clientId: "cl2" },
        ],
        clients: [{ id: "cl1", name: "North Rentals" }, { id: "cl2", name: "South Stays" }],
      };
      return { ...buildCleanerAgenda(source), source, coverage: { truncated: false, limit: 200 }, jobsById: new Map() };
    });
    render(<TranslationProvider><CleanerAgendaView onBack={() => {}} onOpenJob={() => {}} /></TranslationProvider>);
    // The view remembers the last tab for the page session; start on the schedule.
    fireEvent.click(await screen.findByRole("button", { name: /^(by cleaner|por cleaner)/i }));
    let group = await screen.findByRole("article", { name: "Ana Example" });
    expect(within(group).getAllByRole("listitem")).toHaveLength(2);

    fireEvent.change(screen.getByLabelText(/^(House|Casa)$/), { target: { value: "p2" } });
    group = screen.getByRole("article", { name: "Ana Example" });
    expect(within(group).getAllByRole("listitem")).toHaveLength(1);
    expect(within(group).getByText("Garden Studio")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /clear filters|limpar filtros/i }));
    fireEvent.change(screen.getByLabelText(/^(Client|Cliente)$/), { target: { value: "cl1" } });
    group = screen.getByRole("article", { name: "Ana Example" });
    expect(within(group).getAllByRole("listitem")).toHaveLength(1);
    expect(within(group).getByText("Lake House")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /clear filters|limpar filtros/i }));
  });
});

describe("CleanerAgendaView load deadline", () => {
  it("shows the error instead of loading forever when a read never answers", async () => {
    vi.useFakeTimers();
    try {
      loadCleanerAgenda.mockImplementation(() => new Promise(() => {}));
      render(<TranslationProvider><CleanerAgendaView onBack={() => {}} onOpenJob={() => {}} /></TranslationProvider>);
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(screen.getByText(/could not be loaded|não foi possível carregar/i)).toBeTruthy();
      expect(screen.queryByText(/loading these dates|carregando essas datas/i)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { buildCleanerAgenda } from "./cleanerAgendaModel.js";

const loadCleanerAgenda = vi.fn();
vi.mock("./cleanerAgendaService.js", () => ({ loadCleanerAgenda: (...args) => loadCleanerAgenda(...args) }));
vi.mock("../cleaners/CleanerDetail.jsx", () => ({ CleanerDetail: () => null }));
vi.mock("../cleaners/CleanerDirectory.jsx", () => ({ CleanerDirectory: () => null }));
vi.mock("../cleaners/CleanerProfileForm.jsx", () => ({ CleanerProfileForm: () => null, CleanerProfileSuccess: () => null }));
vi.mock("../cleaner-alerts/CleanerAlertsView.jsx", () => ({ CleanerAlertsView: () => null }));

const { CleanerViews } = await import("../manager-app/views/CleanerViews.jsx");

const properties = [
  { id: "property-a", name: "Example Lake House", address: "100 Example Street" },
  { id: "property-b", name: "Example Garden House", address: "200 Example Street" },
];
const writeText = vi.fn();
let entries;
let preferredLanguage;

beforeEach(() => {
  localStorage.setItem("cleanflow-language", "en");
  preferredLanguage = "en";
  entries = [{ id: "job-a", propertyId: "property-a", scheduledStart: "10:00", serviceType: "POST_CONSTRUCTION", scheduleRevision: 0 }];
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  loadCleanerAgenda.mockReset().mockImplementation(async (period) => {
    const source = {
      period,
      jobs: entries.map(({ dayOffset = 0, ...entry }) => {
        const date = new Date(`${period.start}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + dayOffset);
        return { ...entry, scheduledDate: date.toISOString().slice(0, 10), schemaVersion: 2,
          assignedCleanerIds: ["cleaner-example"], operationalStatus: "ASSIGNED", dataProvenance: "REAL" };
      }),
      cleaners: [{ id: "cleaner-example", name: "Example Cleaner", phone: "+1 555 0100", preferredLanguage }],
      properties,
      clients: [],
    };
    return { ...buildCleanerAgenda(source), source, coverage: { truncated: false, limit: 200 },
      jobsById: new Map(source.jobs.map((job) => [job.id, job])) };
  });
});

function application(view = "cleaner-agenda") {
  return <TranslationProvider><CleanerViews view={view} showCleaners={() => {}} openCleanerAgendaJob={() => {}} /></TranslationProvider>;
}

async function group() {
  return screen.findByRole("article", { name: "Example Cleaner" });
}

function draft(article) {
  return new URL(within(article).getByRole("link").href).searchParams.get("text");
}

async function copyAgenda(article) {
  const attempts = writeText.mock.calls.length;
  fireEvent.click(within(article).getByRole("button", { name: "Copy agenda", exact: true }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(attempts + 1));
  await act(async () => {});
}

async function refresh() {
  const reads = loadCleanerAgenda.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Refresh", exact: true }));
  await waitFor(() => expect(loadCleanerAgenda).toHaveBeenCalledTimes(reads + 1));
  return group();
}

describe("cleaner agenda message revisions", () => {
  it.each([
    ["pt", "Olá, Example Cleaner!", "Pós-obra", "Reagendado"],
    ["en", "Hi Example Cleaner!", "Post-construction", "Rescheduled"],
    ["es", "¡Hola, Example Cleaner!", "Limpieza posobra", "Reprogramado"],
  ])("uses the cleaner's %s language for the service type and verified reschedule", async (language, greeting, type, changed) => {
    preferredLanguage = language;
    entries[0].scheduleRevision = 2;
    render(application());
    const message = draft(await group());
    expect(message).toContain(greeting);
    expect(message).toContain(type);
    expect(message).toContain(changed);
    expect(message).toContain("10:00");
    expect(message).not.toContain("→");
  });

  it("uses Standard for a legacy job and keeps an unchanged schedule free of change notices", async () => {
    delete entries[0].serviceType;
    render(application());
    const message = draft(await group());
    expect(message).toContain("Standard (guest turnover)");
    expect(message).not.toContain("Rescheduled");
    expect(message).not.toContain("→");
  });

  it("compares a successful copy with the refreshed schedule even within the same revision", async () => {
    render(application());
    await copyAgenda(await group());
    entries[0].scheduledStart = "11:00";
    const article = await refresh();
    const message = draft(article);
    expect(message).toContain("10:00 → 11:00");
    await copyAgenda(article);
    expect(writeText.mock.lastCall[0]).toBe(message);
    expect(draft(article)).toBe(message);
    const refreshed = draft(await refresh());
    expect(refreshed).toContain("11:00");
    expect(refreshed).not.toContain("10:00 → 11:00");
  });

  it("retains the copied baseline while navigating away and back", async () => {
    const { rerender } = render(application());
    await copyAgenda(await group());
    rerender(application("job-detail"));
    entries[0].scheduledStart = "11:00";
    entries[0].scheduleRevision = 1;
    rerender(application());
    expect(draft(await group())).toContain("10:00 → 11:00");
  });

  it("includes both dates when the copied service moves to a day without a time", async () => {
    render(application());
    await copyAgenda(await group());
    const originalDate = loadCleanerAgenda.mock.calls[0][0].start;
    const nextDate = new Date(`${originalDate}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    const dateText = (date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date).replace(/\.$/, "");
    entries[0].dayOffset = 1;
    entries[0].scheduledStart = "";
    entries[0].scheduleRevision = 1;
    const message = draft(await refresh());
    expect(message).toContain(`${dateText(new Date(`${originalDate}T00:00:00`))} · 10:00 →`);
    expect(message).toContain(`${dateText(nextDate)} · No time`);
  });

  it("does not treat a failed clipboard write or a WhatsApp draft as a copied baseline", async () => {
    writeText.mockRejectedValue(new Error("synthetic clipboard denial"));
    render(application());
    const original = await group();
    expect(draft(original)).toContain("10:00");
    await copyAgenda(original);
    entries[0].scheduledStart = "11:00";
    entries[0].scheduleRevision = 1;
    const message = draft(await refresh());
    expect(message).toContain("Rescheduled");
    expect(message).toContain("11:00");
    expect(message).not.toContain("10:00");
    expect(message).not.toContain("→");
  });

  it("preserves other houses' copied baselines when copying a filtered agenda", async () => {
    entries.push({ id: "job-b", propertyId: "property-b", scheduledStart: "14:00", scheduleRevision: 0 });
    render(application());
    await copyAgenda(await group());
    fireEvent.change(screen.getByLabelText("House", { exact: true }), { target: { value: "property-a" } });
    await copyAgenda(await group());
    entries[1].scheduledStart = "15:00";
    fireEvent.click(screen.getByRole("button", { name: "Clear filters", exact: true }));
    const message = draft(await refresh());
    expect(message).toContain("14:00 → 15:00");
    expect(message).toContain("Example Garden House");
  });
});

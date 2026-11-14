import { describe, expect, it } from "vitest";
import { agendaMessage, buildCleanerAgenda, cleanerPayoutFor } from "./cleanerAgendaModel.js";

const period = { start: "2026-11-16", end: "2026-11-22" };
const cleaners = [
  { id: "c-ana", name: "Ana", phone: "+1 555 0100", preferredLanguage: "pt" },
  { id: "c-bea", name: "Bea", phone: "", preferredLanguage: "en" },
];
const properties = [
  { id: "p-lake", name: "Lake House", address: "100 Example St", accessCode: "never-show-1234" },
  { id: "p-studio", name: "Garden Studio", address: "22 Sample Ave" },
];
const job = (id, overrides = {}) => ({
  id, propertyId: "p-lake", scheduledDate: "2026-11-17", scheduledStart: "11:00", operationalStatus: "ASSIGNED",
  schemaVersion: 2, assignedCleanerIds: ["c-ana"], dataProvenance: "REAL", ...overrides,
});

describe("cleaner schedule", () => {
  const jobs = [
    job("j3", { scheduledDate: "2026-11-19", scheduledStart: "" }),
    job("j1", { scheduledStart: "13:00", propertyId: "p-studio" }),
    job("j2", { scheduledStart: "09:00" }),
    job("j4", { assignedCleanerIds: ["c-ana", "c-bea"], scheduledDate: "2026-11-20" }),
    job("j5", { operationalStatus: "CANCELLED" }),
    job("j6", { archivedAt: "2026-11-15" }),
    job("j7", { scheduledDate: "2026-11-23" }),
    job("j8", { dataProvenance: "DEMO" }),
    job("j9", { schemaVersion: 1, assignedCleanerIds: undefined, assignedCleanerId: "c-bea" }),
  ];
  const agenda = buildCleanerAgenda({ period, jobs, cleaners, properties });

  it("groups each cleaner's live services in date and time order", () => {
    expect(agenda.schedule.map((group) => group.name)).toEqual(["Ana", "Bea"]);
    expect(agenda.schedule[0].rows.map((entry) => entry.jobId)).toEqual(["j2", "j1", "j3", "j4"]);
    expect(agenda.schedule[1].rows.map((entry) => entry.jobId)).toEqual(["j9", "j4"]);
  });

  it("shows house name and address, never access details", () => {
    expect(agenda.schedule[0].rows[0]).toMatchObject({ propertyName: "Lake House", address: "100 Example St", start: "09:00" });
    expect(JSON.stringify(agenda)).not.toContain("never-show-1234");
  });
});

describe("services without a cleaner", () => {
  it("lists unassigned and partly filled services, not completed or started ones", () => {
    const agenda = buildCleanerAgenda({ period, cleaners, properties, jobs: [
      job("open", { operationalStatus: "UNASSIGNED", assignedCleanerIds: [] }),
      job("offered", { operationalStatus: "OFFERED", assignedCleanerIds: [], scheduledDate: "2026-11-16" }),
      job("partial", { operationalStatus: "OFFERED", requiredCleanerCount: 2, scheduledDate: "2026-11-18" }),
      job("full", { requiredCleanerCount: 1 }),
      job("done", { operationalStatus: "COMPLETED", assignedCleanerIds: [] }),
    ] });
    expect(agenda.unassigned.map((entry) => entry.jobId)).toEqual(["offered", "open", "partial"]);
    expect(agenda.unassigned[2]).toMatchObject({ required: 2, filled: 1, cleanerNames: ["Ana"] });
  });
});

describe("completed services for payment", () => {
  it("totals a cleaner's payouts only when every amount is known", () => {
    const agenda = buildCleanerAgenda({ period, cleaners, properties, jobs: [
      job("a", { operationalStatus: "COMPLETED", cleanerPayout: 90 }),
      job("b", { operationalStatus: "COMPLETED", cleanerPayout: 85.5, scheduledDate: "2026-11-18" }),
      job("c", { operationalStatus: "COMPLETED", assignedCleanerIds: ["c-bea"], cleanerPayout: 70 }),
      job("d", { operationalStatus: "COMPLETED", assignedCleanerIds: ["c-bea"] }),
      job("e", { operationalStatus: "ASSIGNED", cleanerPayout: 99 }),
    ] });
    const [ana, bea] = agenda.completed;
    expect(ana).toMatchObject({ name: "Ana", total: 175.5, knownTotal: 175.5, unknownCount: 0 });
    expect(bea).toMatchObject({ name: "Bea", total: null, knownTotal: 70, unknownCount: 1 });
  });

  it("does not split a shared service's single amount", () => {
    expect(cleanerPayoutFor(job("s", { assignedCleanerIds: ["c-ana", "c-bea"], cleanerPayout: 200 }))).toBeNull();
    expect(cleanerPayoutFor(job("s", { cleanerPayout: 200 }))).toBe(200);
    expect(cleanerPayoutFor(job("s", { cleanerPayout: -1 }))).toBeNull();
  });
});

describe("message for the cleaner", () => {
  it("lists date, time, house and address", () => {
    const agenda = buildCleanerAgenda({ period, cleaners, properties, jobs: [job("j1"), job("j2", { scheduledDate: "2026-11-18", scheduledStart: "" })] });
    const message = agendaMessage({
      group: agenda.schedule[0], period,
      copy: { greeting: "Olá, {name}!", intro: "Sua agenda de {start} a {end}:", closing: "Qualquer dúvida, me chame.", unnamedProperty: "Casa" },
      formatDate: (date) => date.slice(5), formatWeekday: () => "seg",
    });
    expect(message).toBe([
      "Olá, Ana!", "Sua agenda de 11-16 a 11-22:", "",
      "• seg 11-17 · 11:00 · Lake House — 100 Example St",
      "• seg 11-18 · Lake House — 100 Example St",
      "", "Qualquer dúvida, me chame.",
    ].join("\n"));
  });

  it("rejects an invalid period", () => {
    expect(() => buildCleanerAgenda({ period: { start: "2026-11-22", end: "2026-11-16" } })).toThrow(RangeError);
  });
});

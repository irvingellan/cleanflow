import { describe, expect, it } from "vitest";
import {
  computeAgendaEntries,
  offeredCompensationFor,
  planAgendaChanges,
  rosterCleanerIds,
  sameEntry,
} from "./cleanerAgenda.js";

const now = new Date("2026-11-03T12:00:00Z");
const future = { toMillis: () => now.getTime() + 86400000 };
const past = { toMillis: () => now.getTime() - 1000 };

function job(extra = {}) {
  return {
    schemaVersion: 2,
    operationalStatus: "ASSIGNED",
    assignedCleanerIds: ["ana"],
    propertyName: "  Maple   Example House ",
    scheduledDate: "2026-11-06",
    scheduledStart: "10:30",
    scheduleRevision: 2,
    clientPrice: 250,
    cleanerPayout: 150,
    notes: "private",
    guestName: "private",
    ...extra,
  };
}

describe("cleaner agenda projection", () => {
  it("projects only cleaner-safe fields for the current roster", () => {
    const entries = computeAgendaEntries({ organizationId: "org", jobId: "j1", job: job(), assignments: [{ cleanerId: "ana", isActive: true, cleanerAcknowledgedAt: {} }], now });
    expect([...entries.keys()]).toEqual(["ana"]);
    expect(entries.get("ana")).toEqual({
      organizationId: "org", cleanerId: "ana", jobId: "j1", jobStatus: "ASSIGNED",
      scheduledDate: "2026-11-06", scheduledStart: "10:30", propertyName: "Maple Example House",
      scheduleRevision: 2, kind: "ASSIGNED", acknowledged: true, offerStatus: null, offeredCompensation: null,
    });
    expect(JSON.stringify([...entries.values()])).not.toMatch(/250|150|private/);
  });

  it("drops everything for archived (cancelled) or missing Jobs", () => {
    expect(computeAgendaEntries({ organizationId: "o", jobId: "j", job: job({ archivedAt: {} }) }).size).toBe(0);
    expect(computeAgendaEntries({ organizationId: "o", jobId: "j", job: null }).size).toBe(0);
  });

  it("keeps legacy single-cleaner Jobs only while assigned, in progress or completed", () => {
    const legacy = { assignedCleanerId: "ana", operationalStatus: "IN_PROGRESS" };
    expect(rosterCleanerIds(legacy)).toEqual(["ana"]);
    expect(rosterCleanerIds({ ...legacy, operationalStatus: "OFFERED" })).toEqual([]);
    expect(rosterCleanerIds(job({ assignedCleanerIds: ["ana", "ana", "bia/../x", ""] }))).toEqual(["ana"]);
  });

  it("shows only live, unanswered-or-interested Offers that are not already assignments", () => {
    const offers = [
      { cleanerId: "bia", status: "PENDING", publicOfferExpiresAt: future, offeredCompensation: 140 },
      { cleanerId: "cris", status: "INTERESTED", publicOfferExpiresAt: future },
      { cleanerId: "dani", status: "DECLINED", publicOfferExpiresAt: future },
      { cleanerId: "eva", status: "PENDING", publicOfferExpiresAt: past },
      { cleanerId: "fia", status: "PENDING" },
      { cleanerId: "ana", status: "INTERESTED", publicOfferExpiresAt: future },
    ];
    const entries = computeAgendaEntries({ organizationId: "o", jobId: "j", job: job({ operationalStatus: "OFFERED", assignedCleanerIds: ["ana"] }), offers, now });
    expect([...entries.entries()].map(([id, entry]) => [id, entry.kind, entry.offerStatus, entry.offeredCompensation])).toEqual([
      ["ana", "ASSIGNED", null, null],
      ["bia", "OFFER", "PENDING", 140],
      ["cris", "OFFER", "INTERESTED", null],
    ]);
  });

  it("never treats a v2 Job-level payout as one cleaner's offered amount", () => {
    expect(offeredCompensationFor({}, job())).toBeNull();
    expect(offeredCompensationFor({}, { cleanerPayout: 120 })).toBe(120);
    expect(offeredCompensationFor({ offeredCompensation: -1 }, job())).toBeNull();
  });

  it("plans honest change notices: new, moved, removed and cancelled", () => {
    const before = new Map([["ana", { kind: "ASSIGNED", jobId: "j", propertyName: "Maple", scheduledDate: "2026-11-06", scheduledStart: "10:30" }],
      ["bia", { kind: "ASSIGNED", jobId: "j", propertyName: "Maple", scheduledDate: "2026-11-06", scheduledStart: "10:30" }],
      ["cris", { kind: "OFFER", jobId: "j" }]]);
    const after = new Map([["ana", { kind: "ASSIGNED", jobId: "j", propertyName: "Maple", scheduledDate: "2026-11-08", scheduledStart: "13:00" }],
      ["cris", { kind: "ASSIGNED", jobId: "j", propertyName: "Maple", scheduledDate: "2026-11-08", scheduledStart: "13:00" }]]);
    const changes = planAgendaChanges(before, after, { job: job() });
    expect(changes.map((change) => [change.cleanerId, change.change, change.openJobId])).toEqual([
      ["ana", "RESCHEDULED", "j"], ["bia", "UNASSIGNED", null], ["cris", "ASSIGNED", "j"],
    ]);
    expect(planAgendaChanges(before, new Map(), { job: job({ archivedAt: {} }) }).map((change) => change.change)).toEqual(["CANCELLED", "CANCELLED"]);
    expect(planAgendaChanges(before, new Map(), { job: null, suppressNotices: true })).toEqual([]);
  });

  it("detects unchanged entries so syncs do not rewrite them", () => {
    const entry = computeAgendaEntries({ organizationId: "o", jobId: "j", job: job() }).get("ana");
    expect(sameEntry({ ...entry, syncedAt: "x" }, entry)).toBe(true);
    expect(sameEntry({ ...entry, scheduledStart: "11:00" }, entry)).toBe(false);
    expect(sameEntry(undefined, entry)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  computeAgendaEntries,
  offeredCompensationFor,
  checklistAgendaSummary,
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
      checklist: { status: "NONE", started: false }, checklistStatus: "NONE", checklistStarted: false,
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
      { cleanerId: "gia", status: "PENDING", publicOfferExpiresAt: { toMillis: () => NaN } },
      { cleanerId: "ana", status: "INTERESTED", publicOfferExpiresAt: future },
    ];
    const entries = computeAgendaEntries({ organizationId: "o", jobId: "j", job: job({ operationalStatus: "OFFERED", assignedCleanerIds: ["ana"], requiredCleanerCount: 3 }), offers, now });
    expect([...entries.entries()].map(([id, entry]) => [id, entry.kind, entry.offerStatus, entry.offeredCompensation])).toEqual([
      ["ana", "ASSIGNED", null, null],
      ["bia", "OFFER", "PENDING", 140],
      ["cris", "OFFER", "INTERESTED", null],
    ]);
    // FB08: with the default single spot filled, the live invites read as taken.
    const filled = computeAgendaEntries({ organizationId: "o", jobId: "j", job: job({ operationalStatus: "ASSIGNED", assignedCleanerIds: ["ana"] }), offers, now });
    expect([...filled.entries()].map(([id, entry]) => [id, entry.kind, entry.offerStatus])).toEqual([
      ["ana", "ASSIGNED", null], ["bia", "OFFER", "ALREADY_TAKEN"], ["cris", "OFFER", "ALREADY_TAKEN"],
    ]);
    expect(entries.get("bia").offerExpiresAtMs).toBe(future.toMillis());
    expect(sameEntry(entries.get("bia"), { ...entries.get("bia"), offerExpiresAtMs: future.toMillis() + 1 })).toBe(false);
  });


  it("keeps a non-actionable automatic offer for the original recipient after another cleaner takes it", () => {
    const offers = [{
      jobId: "j",
      cleanerId: "bia",
      status: "PENDING",
      offerDistributionMode: "FIRST_ACCEPT_WINS",
      offeredChecklistContextRevision: 0,
      offeredPropertyName: "Original Property",
      offeredScheduledDate: "2026-11-05",
      offeredScheduledStart: "09:00",
      publicOfferExpiresAt: future,
      offeredCompensation: 140,
    }];
    const entries = computeAgendaEntries({
      organizationId: "o", jobId: "j",
      job: job({ offerDistributionMode: "FIRST_ACCEPT_WINS", offerDistributionClosedAt: {} }),
      offers, now,
    });
    expect(entries.get("bia")).toMatchObject({
      kind: "OFFER", offerStatus: "ALREADY_TAKEN", offerDistributionMode: "FIRST_ACCEPT_WINS",
      jobStatus: "OFFERED", propertyName: "Original Property", scheduledDate: "2026-11-05",
      scheduledStart: "09:00", scheduleRevision: 0,
    });
    expect(JSON.stringify(entries.get("bia"))).not.toMatch(/ana|250|150|private|Maple|10:30/);
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

  it("FB04: carries the Job's checklist state on assigned entries only", () => {
    expect(checklistAgendaSummary()).toEqual({ status: "NONE", started: false });
    expect(checklistAgendaSummary({ run: { status: "DRAFT" } })).toEqual({ status: "DRAFT", started: false });
    expect(checklistAgendaSummary({ run: { status: "DRAFT" }, draft: { revision: 3 } })).toEqual({ status: "DRAFT", started: true });
    expect(checklistAgendaSummary({ run: { status: "DRAFT" }, evidenceState: { photos: [{}] } })).toEqual({ status: "DRAFT", started: true });
    expect(checklistAgendaSummary({ run: { status: "READY_FOR_REVIEW" }, draft: { revision: 9 } })).toEqual({ status: "READY_FOR_REVIEW", started: false });
    expect(checklistAgendaSummary({ run: { status: "SOMETHING_ELSE" } })).toEqual({ status: "NONE", started: false });
    const checklist = { status: "DRAFT", started: true };
    const entries = computeAgendaEntries({ organizationId: "o", jobId: "j", checklist, now,
      job: job({ operationalStatus: "ASSIGNED", assignedCleanerIds: ["ana"], requiredCleanerCount: 2 }),
      offers: [{ cleanerId: "bia", status: "PENDING", publicOfferExpiresAt: future }] });
    expect(entries.get("ana")).toMatchObject({ checklist, checklistStatus: "DRAFT", checklistStarted: true });
    expect(entries.get("bia")).not.toHaveProperty("checklist");
    expect(sameEntry(entries.get("ana"), { ...entries.get("ana"), checklistStarted: false })).toBe(false);
  });
});

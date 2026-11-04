import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  assignedStatusKey,
  buildCleanerAgenda,
  formatAccessCodeInput,
  freshnessFor,
  localDateKey,
  normalizeAccessCodeInput,
} from "./cleanerAgendaModel.js";

const now = new Date(2026, 10, 3, 9, 0);
const assigned = (id, date, status = "ASSIGNED", start = "10:00") => ({ id, kind: "ASSIGNED", jobId: id, scheduledDate: date, scheduledStart: start, jobStatus: status });

describe("cleaner agenda buckets", () => {
  it("splits today, upcoming and completed; offers and changes stay separate", () => {
    const entries = [
      assigned("later", "2026-11-05", "ASSIGNED", "08:00"),
      assigned("today-b", "2026-11-03", "IN_PROGRESS", "13:00"),
      assigned("today-a", "2026-11-03", "ASSIGNED", "09:00"),
      assigned("overdue", "2026-11-02"),
      assigned("done", "2026-11-01", "COMPLETED"),
      assigned("old-done", "2026-09-01", "COMPLETED"),
      assigned("no-date", null),
      { id: "o1", kind: "OFFER", jobId: "o1", offerStatus: "INTERESTED", scheduledDate: "2026-11-04", offerExpiresAtMs: now.getTime() + 60_000 },
      { id: "o2", kind: "OFFER", jobId: "o2", offerStatus: "DECLINED", scheduledDate: "2026-11-04" },
      { id: "o3", kind: "OFFER", jobId: "o3", offerStatus: "PENDING", scheduledDate: "2026-11-01" },
      { id: "c1", kind: "CHANGE", change: "UNASSIGNED", atMs: now.getTime() - 1000 },
      { id: "c2", kind: "CHANGE", change: "ASSIGNED", atMs: now.getTime() - 9 * 86400000 },
    ];
    const agenda = buildCleanerAgenda(entries, { now });
    expect(agenda.today.map((entry) => entry.id)).toEqual(["overdue", "today-a", "today-b"]);
    expect(agenda.upcoming.map((entry) => entry.id)).toEqual(["later", "no-date"]);
    expect(agenda.completed.map((entry) => entry.id)).toEqual(["done"]);
    expect(agenda.offers.map((entry) => entry.id)).toEqual(["o1"]);
    expect(agenda.changes.map((entry) => entry.id)).toEqual(["c1"]);
    expect(agenda.openCount).toBe(5);
  });

  it("an interested Offer is never counted as confirmed work", () => {
    const agenda = buildCleanerAgenda([{ id: "o", kind: "OFFER", jobId: "o", offerStatus: "INTERESTED", scheduledDate: "2026-11-04", offerExpiresAtMs: now.getTime() + 60_000 }], { now });
    expect(agenda.openCount).toBe(0);
    expect(agenda.today).toEqual([]);
    expect(agenda.upcoming).toEqual([]);
  });

  it("hides expired offers and projections with no confirmed expiry", () => {
    const offer = { kind: "OFFER", offerStatus: "PENDING" };
    const agenda = buildCleanerAgenda([
      { ...offer, id: "expired", offerExpiresAtMs: now.getTime() },
      { ...offer, id: "missing" },
      { ...offer, id: "valid", offerExpiresAtMs: now.getTime() + 1 },
    ], { now });
    expect(agenda.offers.map((entry) => entry.id)).toEqual(["valid"]);
  });

  it("uses the Pacific service day across the UTC date boundary and daylight saving changes", () => {
    expect(localDateKey(new Date("2026-11-01T06:59:00Z"))).toBe("2026-10-31");
    expect(localDateKey(new Date("2026-11-01T07:00:00Z"))).toBe("2026-11-01");
    expect(localDateKey(new Date("2026-11-02T07:59:00Z"))).toBe("2026-11-01");
    expect(localDateKey(new Date("2026-11-02T08:00:00Z"))).toBe("2026-11-02");
  });

  it("maps assignment status without inventing confirmation states", () => {
    expect(assignedStatusKey({ jobStatus: "ASSIGNED" })).toBe("confirmed");
    expect(assignedStatusKey({ jobStatus: "IN_PROGRESS" })).toBe("progress");
    expect(assignedStatusKey({ jobStatus: "COMPLETED" })).toBe("done");
  });

  it("adds days across month ends in local date keys", () => {
    expect(addDaysToKey("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("freshness", () => {
  const at = new Date();
  it("drops a stalled stream out of live without changing its last verified time", () => {
    expect(freshnessFor({ hasSnapshot: true, online: true, lastVerifiedAt: at, nowMs: at.getTime() + 30_000, maxAgeMs: 30_000 }))
      .toEqual({ state: "stale", lastVerifiedAt: at, reason: "error" });
  });
  it("claims live only for a server-confirmed snapshot while online", () => {
    expect(freshnessFor({ hasSnapshot: false, online: true })).toEqual({ state: "loading", lastVerifiedAt: null });
    expect(freshnessFor({ hasSnapshot: true, fromCache: false, online: true, lastVerifiedAt: at }).state).toBe("live");
    expect(freshnessFor({ hasSnapshot: true, fromCache: true, online: true, lastVerifiedAt: at })).toMatchObject({ state: "stale", reason: "cache" });
    expect(freshnessFor({ hasSnapshot: true, fromCache: false, online: false, lastVerifiedAt: at })).toMatchObject({ state: "stale", reason: "offline" });
    expect(freshnessFor({ hasSnapshot: true, error: "unavailable", online: true, lastVerifiedAt: at })).toMatchObject({ state: "stale", reason: "error" });
    expect(freshnessFor({ hasSnapshot: false, error: "permission-denied", online: true })).toMatchObject({ state: "error" });
  });
});

describe("access code input", () => {
  it("groups as the person types and strips everything else", () => {
    expect(formatAccessCodeInput("abcdefghjk23")).toBe("ABCD-EFGH-JK23");
    expect(formatAccessCodeInput("ab-cd ef")).toBe("ABCD-EF");
    expect(normalizeAccessCodeInput("abcd-efgh-jk23-zzzz")).toBe("ABCDEFGHJK23");
  });
});

import { agendaMonths, checklistSituation, entriesInMonth, normalizeJobAccess } from "./cleanerAgendaModel.js";

describe("Gabi feedback model rules", () => {
  it("months cover every entry exactly once, undated last", () => {
    const list = [{ scheduledDate: "2027-01-03" }, { scheduledDate: null }, { scheduledDate: "2026-12-30" }, { scheduledDate: "2026-12-01" }];
    const months = agendaMonths(list);
    expect(months).toEqual(["2026-12", "2027-01", ""]);
    expect(months.flatMap((month) => entriesInMonth(list, month))).toHaveLength(list.length);
  });

  it("checklist situation follows only states the model has", () => {
    const open = { jobStatus: "ASSIGNED" };
    expect(checklistSituation(open)).toEqual({ state: "unknown", pending: false });
    expect(checklistSituation({ ...open, checklist: { status: "APPROVED" } }).state).toBe("unknown");
    expect(checklistSituation({ ...open, checklist: { status: "NONE" } })).toEqual({ state: "none", pending: false });
    expect(checklistSituation({ ...open, checklist: { status: "DRAFT" } })).toEqual({ state: "available", pending: true });
    expect(checklistSituation({ ...open, checklist: { status: "DRAFT", started: true } })).toEqual({ state: "started", pending: true });
    expect(checklistSituation({ ...open, checklist: { status: "READY_FOR_REVIEW" } })).toEqual({ state: "submitted", pending: false });
    expect(checklistSituation({ jobStatus: "COMPLETED", checklist: { status: "DRAFT" } }).pending).toBe(false);
  });

  it("access normalisation never invents data", () => {
    expect(normalizeJobAccess(undefined)).toEqual({ state: "unsupported" });
    expect(normalizeJobAccess({ state: "weird" })).toEqual({ state: "unsupported" });
    expect(normalizeJobAccess({ state: "available", items: [{ value: " " }] })).toEqual({ state: "not-provided" });
    expect(normalizeJobAccess({ state: "revoked", items: [{ value: "x" }] })).toEqual({ state: "revoked", availableFromMs: null });
    expect(normalizeJobAccess({ state: "available", items: [{ kind: "door", value: "1" }] }).items).toEqual([{ kind: "door", label: null, value: "1" }]);
  });
});

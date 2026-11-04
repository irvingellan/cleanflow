import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  assignedStatusKey,
  buildCleanerAgenda,
  formatAccessCodeInput,
  freshnessFor,
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
      { id: "o1", kind: "OFFER", jobId: "o1", offerStatus: "INTERESTED", scheduledDate: "2026-11-04" },
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
    const agenda = buildCleanerAgenda([{ id: "o", kind: "OFFER", jobId: "o", offerStatus: "INTERESTED", scheduledDate: "2026-11-04" }], { now });
    expect(agenda.openCount).toBe(0);
    expect(agenda.today).toEqual([]);
    expect(agenda.upcoming).toEqual([]);
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

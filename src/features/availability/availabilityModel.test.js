import { describe, expect, it } from "vitest";
import { assignedBlockConflicts, availabilityDateLabel, blockAtScheduledStart } from "./availabilityModel.js";
import { availabilityMessage } from "./availabilityMessages.js";

const day = { startDate: "2026-12-01", endDate: "2026-12-01" };
const partial = { ...day, startTime: "09:00", endTime: "11:00" };
const range = { ...day, endDate: "2026-12-04" };

describe("availability period display and overlap", () => {
  it("uses the user's date format for single days and inclusive ranges", () => {
    expect(availabilityDateLabel(day, "en")).toBe("Dec 1, 2026");
    expect(availabilityDateLabel(range, "pt")).toMatch(/1 de dez.* – 4 de dez/);
  });
  it.each([
    [range, "2026-11-30", "10:00", "clear"], [range, "2026-12-01", null, "blocked"],
    [range, "2026-12-04", "23:59", "blocked"], [range, "2026-12-05", "", "clear"],
    [range, null, null, "clear"], [partial, "2026-12-01", "08:59", "clear"],
    [partial, "2026-12-01", "09:00", "blocked"], [partial, "2026-12-01", "10:59", "blocked"],
    [partial, "2026-12-01", "11:00", "clear"], [partial, "2026-12-01", null, "unknown"],
    [partial, "2026-12-01", "25:00", "unknown"],
  ])("compares inclusive dates and a half-open range of known starts", (block, date, time, result) => {
    expect(blockAtScheduledStart(block, date, time)).toBe(result);
  });
  it("counts each active assignment once, leaving offers and historical assignments out", () => {
    const job = { jobId: "a", kind: "ASSIGNED", jobStatus: "ASSIGNED", scheduledDate: day.startDate, scheduledStart: "09:00" };
    const entries = [job, job, { ...job, scheduledStart: null }, { ...job, jobId: "b", kind: "OFFER" },
      { ...job, jobId: "c", jobStatus: "COMPLETED" }, { ...job, jobId: "d", jobStatus: "IN_PROGRESS", scheduledStart: null },
      { ...job, jobId: "e", kind: "CHANGE" }, { ...job, jobId: "f", jobStatus: "UNASSIGNED" }];
    expect(assignedBlockConflicts(partial, entries)).toEqual({ blocked: 1, unknown: 1 });
    expect(assignedBlockConflicts(day, entries)).toEqual({ blocked: 2, unknown: 0 });
  });
  it("localizes warning counts in all three supported languages", () => {
    expect(availabilityMessage("en", "conflictMany", { count: 2 })).toMatch(/2 jobs/);
    expect(availabilityMessage("es", "conflictMany", { count: 2 })).toMatch(/2 servicios/);
    expect(availabilityMessage("pt", "conflictMany", { count: 2 })).toMatch(/2 serviços/);
  });
});

import { describe, expect, it } from "vitest";
import {
  cleanerSelectionHistoryLimit, cleanerSelectionScheduleLimit, projectCleanerSelectionContext,
} from "./cleanerSelectionContext.js";

const target = { jobId: "target", propertyId: "demo-property", scheduledDate: "2026-11-13" };
const assigned = {
  id: "other-job", schemaVersion: 2, operationalStatus: "ASSIGNED", scheduledDate: target.scheduledDate,
  scheduledStart: "13:15", assignedCleanerIds: ["cleaner-a", "cleaner-a", "cleaner-b"], assignedCleanerId: "stale-legacy-field",
  managerNotes: "Internal test fixture",
};
const completed = {
  ...assigned, operationalStatus: "COMPLETED", propertyId: target.propertyId,
  completedAt: { toDate: () => new Date("2026-11-13T02:30:00Z") },
};

describe("cleaner selection context", () => {
  it("projects only other commitments and recent completion facts using both roster formats", () => {
    const context = projectCleanerSelectionContext(target, [
      assigned, { ...assigned, id: "legacy", schemaVersion: 1, assignedCleanerId: "cleaner-a", scheduledStart: "08:30" },
      { ...assigned, id: "untimed", assignedCleanerIds: ["cleaner-b"], scheduledStart: null },
      { ...assigned, id: target.jobId, assignedCleanerIds: ["self"] },
      { ...assigned, scheduledDate: "2026-11-14", assignedCleanerIds: ["other-day"] },
      { ...assigned, archivedAt: true, assignedCleanerIds: ["archived"] },
      { ...assigned, operationalStatus: "OFFERED", assignedCleanerIds: ["offered"] },
    ], [
      completed,
      { ...completed, id: "older", assignedCleanerIds: ["cleaner-a"], completedAt: { toDate: () => new Date("2026-11-01T03:00:00Z") } },
      { ...completed, propertyId: "other-property", assignedCleanerIds: ["other-home"] },
      { ...completed, completedAt: undefined, assignedCleanerIds: ["no-completion-date"] },
    ]);
    expect(context).toEqual({
      byCleanerId: {
        "cleaner-a": { sameDayStarts: ["08:30", "13:15"], completedHereCount: 2, lastCompletedHereDate: "2026-11-12" },
        "cleaner-b": { sameDayStarts: ["13:15", null], completedHereCount: 1, lastCompletedHereDate: "2026-11-12" },
      },
      historyPartial: false, schedulePartial: false, historyLimit: cleanerSelectionHistoryLimit,
    });
  });

  it("marks only blocks overlapping the actual start and gives full days precedence in either order", () => {
    const block = { startDate: target.scheduledDate, endDate: target.scheduledDate };
    const first = { ...block, startTime: "09:00", endTime: "12:00" };
    const second = { ...block, startTime: "10:00", endTime: "11:00" };
    const rows = [
      { ...first, cleanerId: "partial" }, { ...second, cleanerId: "partial" }, { ...first, cleanerId: "partial" },
      { ...first, cleanerId: "full-last" }, { ...block, cleanerId: "full-last" },
      { ...block, cleanerId: "full-first" }, { ...first, cleanerId: "full-first" },
      { ...block, cleanerId: "ending", startTime: "07:00", endTime: "10:00" },
      { ...block, cleanerId: "tomorrow", startDate: "2026-11-14", endDate: "2026-11-14" },
      { ...block, cleanerId: "yesterday", startDate: "2026-11-12", endDate: "2026-11-12" },
    ];
    const options = projectCleanerSelectionContext({ ...target, scheduledStart: "10:00" }, [], [], rows).byCleanerId;
    expect(Object.keys(options).sort()).toEqual(["full-first", "full-last", "partial"]);
    expect(options.partial.unavailability).toEqual({ state: "blocked", periods: [
      { startTime: "09:00", endTime: "12:00" }, { startTime: "10:00", endTime: "11:00" },
    ] });
    expect(options["full-first"].unavailability).toEqual({ state: "blocked", periods: [] });
    expect(options["full-last"].unavailability).toEqual(options["full-first"].unavailability);
    expect(options.partial.sameDayStarts).toEqual([]);
  });

  it.each([undefined, "", "25:00"])("marks partial periods as uncertain for an unset or invalid job start %s", start => {
    const period = { cleanerId: "cleaner-b", startDate: target.scheduledDate, endDate: target.scheduledDate, startTime: "14:00", endTime: "17:30" };
    const result = projectCleanerSelectionContext({ ...target, scheduledStart: start }, [assigned], [completed], [period]);
    expect(result.byCleanerId["cleaner-b"]).toEqual({
      completedHereCount: 1, lastCompletedHereDate: "2026-11-12", sameDayStarts: ["13:15"],
      unavailability: { state: "unknown", periods: [{ startTime: "14:00", endTime: "17:30" }] },
    });
    expect(result.byCleanerId["cleaner-a"].unavailability).toBeUndefined();
  });

  it("keeps the overflow records out of the displayed facts and records partial coverage", () => {
    const schedule = Array.from({ length: cleanerSelectionScheduleLimit }, (_, index) => ({ ...assigned, id: `active-${index}` }));
    const history = Array.from({ length: cleanerSelectionHistoryLimit }, (_, index) => ({ ...completed, id: `done-${index}` }));
    const outside = { assignedCleanerIds: ["beyond-limit"] };
    const context = projectCleanerSelectionContext(target,
      [...schedule, { ...assigned, ...outside }], [...history, { ...completed, ...outside }]);
    expect(context.schedulePartial).toBe(true);
    expect(context.historyPartial).toBe(true);
    expect(context.byCleanerId["beyond-limit"]).toBeUndefined();
    expect(context.byCleanerId["cleaner-a"].completedHereCount).toBe(cleanerSelectionHistoryLimit);
  });
});

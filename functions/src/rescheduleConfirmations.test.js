import { describe, expect, it } from "vitest";
import { projectCleanerReschedule, rosterScheduleConfirmation } from "./rescheduleConfirmations.js";

const cleanerId = "recipient", organizationId = "sample-org", jobId = "sample-job";
const decision = { state: "PENDING", assignmentId: null };
const legacy = {
  organizationId, operationalStatus: "ASSIGNED", assignedCleanerId: cleanerId,
  scheduleRevision: 2, scheduledDate: "2026-11-18", scheduledStart: "09:00",
  scheduleConfirmation: { revision: 2, byCleaner: { [cleanerId]: decision } },
};
const current = { state: "PENDING", scheduleRevision: 2, scheduledDate: "2026-11-18", scheduledStart: "09:00" };
const history = {
  scheduleRevision: 2, previousScheduledDate: "2026-11-17", previousScheduledStart: "11:00",
  newScheduledDate: "2026-11-18", newScheduledStart: "09:00",
};
const project = (changes = {}) => projectCleanerReschedule({ job: legacy, cleanerId, organizationId, jobId, scheduleRevision: 2, history, ...changes });

describe("rostered schedule confirmation", () => {
  it("requires the recipient's current revision and a live roster in the same organization", () => {
    expect(rosterScheduleConfirmation(legacy, cleanerId, 2, organizationId)).toEqual(decision);
    expect(rosterScheduleConfirmation(legacy, cleanerId, 1, organizationId)).toBeNull();
    expect(rosterScheduleConfirmation(legacy, cleanerId, 2, "another-org")).toBeNull();
    for (const change of [{ archivedAt: true }, { startedAt: true }, { operationalStatus: "COMPLETED" },
      { assignedCleanerId: "replacement" }, { schemaVersion: 2, assignedCleanerIds: ["other"] },
      { scheduleConfirmation: { revision: 1, byCleaner: { [cleanerId]: decision } } }]) {
      expect(rosterScheduleConfirmation({ ...legacy, ...change }, cleanerId, 2, organizationId)).toBeNull();
    }
    expect(rosterScheduleConfirmation({ ...legacy, scheduleConfirmation: { revision: 2, byCleaner: {
      [cleanerId]: { state: "DECLINED", assignmentId: null },
    } } }, cleanerId, 2, organizationId)).toBeNull();
  });

  it("projects a previous date only from matching history and omits an absent or invalid time", () => {
    expect(project()).toEqual({ ...current, previousScheduledDate: "2026-11-17", previousScheduledStart: "11:00" });
    for (const previousScheduledStart of [null, "", "25:60"]) {
      expect(project({ history: { ...history, previousScheduledStart } })).toEqual({ ...current, previousScheduledDate: "2026-11-17" });
    }
    for (const source of [null, {}, { ...history, scheduleRevision: 1 }, { ...history, newScheduledStart: "13:00" },
      { ...history, previousScheduledDate: "2026-02-31" }, { ...history, jobId: "different-job" },
      { ...history, organizationId: "different-org" }]) expect(project({ history: source })).toEqual(current);
  });

  it("rejects unrelated, inactive and replaced assignment records", () => {
    const own = { ...decision, assignmentId: "active-row" };
    const job = { ...legacy, schemaVersion: 2, assignedCleanerId: null, assignedCleanerIds: [cleanerId],
      scheduleConfirmation: { revision: 2, byCleaner: { [cleanerId]: own } } };
    const assignment = { id: "active-row", cleanerId, organizationId, jobId, isActive: true };
    expect(project({ job, assignment })).toMatchObject(current);
    for (const change of [{ id: "old-row" }, { cleanerId: "other" }, { organizationId: "other" },
      { jobId: "other" }, { isActive: false }]) {
      expect(project({ job, assignment: { ...assignment, ...change } })).toBeNull();
    }
    expect(project({ job, cleanerId: "other", assignment })).toBeNull();
    expect(project({ job, scheduleRevision: 1, assignment })).toBeNull();
    expect(project({ job: { ...job, scheduleConfirmation: legacy.scheduleConfirmation }, assignment })).toBeNull();
  });
});

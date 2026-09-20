import { describe, expect, it } from "vitest";
import {
  buildAssignmentChecklistContextRevisionUpdate,
  buildChecklistContextRevisionUpdate,
  getChecklistContextRevision,
  hasChecklistContextChanged,
  isChecklistEligibleExecutionState,
} from "./checklistContextRevision.js";

const assignedJob = {
  checklistContextRevision: 0,
  propertyId: "property-a",
  scheduledDate: "2026-09-20",
  scheduledStart: "10:00",
  assignedCleanerId: "cleaner-a",
  assignedCleanerIds: ["cleaner-a"],
  operationalStatus: "ASSIGNED",
  archivedAt: null,
};

describe("Checklist context revision", () => {
  it("treats a missing or malformed revision as legacy revision zero", () => {
    expect(getChecklistContextRevision({})).toBe(0);
    expect(getChecklistContextRevision({ checklistContextRevision: -1 })).toBe(0);
    expect(getChecklistContextRevision({ checklistContextRevision: "1" })).toBe(0);
  });

  it("advances revision zero to one for an access-context change", () => {
    expect(buildChecklistContextRevisionUpdate(assignedJob, {
      scheduledDate: "2026-09-21",
    })).toEqual({ checklistContextRevision: 1 });
  });

  it("keeps archive and restore monotonic without resetting the previous context", () => {
    const archived = { ...assignedJob, archivedAt: "timestamp" };
    expect(buildChecklistContextRevisionUpdate(assignedJob, archived)).toEqual({
      checklistContextRevision: 1,
    });
    expect(buildChecklistContextRevisionUpdate({ ...archived, checklistContextRevision: 1 }, {
      archivedAt: null,
    })).toEqual({ checklistContextRevision: 2 });
  });

  it("never resurrects an earlier property, cleaner, or schedule context", () => {
    const propertyB = { ...assignedJob, propertyId: "property-b", checklistContextRevision: 1 };
    const cleanerB = {
      ...assignedJob,
      assignedCleanerId: "cleaner-b",
      assignedCleanerIds: ["cleaner-b"],
      checklistContextRevision: 2,
    };
    const scheduleB = {
      ...assignedJob,
      scheduledDate: "2026-09-21",
      scheduledStart: "13:00",
      checklistContextRevision: 4,
    };

    expect(buildChecklistContextRevisionUpdate(assignedJob, propertyB)).toEqual({
      checklistContextRevision: 1,
    });
    expect(buildChecklistContextRevisionUpdate(propertyB, { propertyId: "property-a" })).toEqual({
      checklistContextRevision: 2,
    });
    expect(buildChecklistContextRevisionUpdate(assignedJob, cleanerB)).toEqual({
      checklistContextRevision: 1,
    });
    expect(buildChecklistContextRevisionUpdate(cleanerB, {
      assignedCleanerId: "cleaner-a",
      assignedCleanerIds: ["cleaner-a"],
    })).toEqual({ checklistContextRevision: 3 });
    expect(buildChecklistContextRevisionUpdate(assignedJob, scheduleB)).toEqual({
      checklistContextRevision: 1,
    });
    expect(buildChecklistContextRevisionUpdate(scheduleB, {
      scheduledDate: assignedJob.scheduledDate,
      scheduledStart: assignedJob.scheduledStart,
    })).toEqual({ checklistContextRevision: 5 });
  });

  it("advances assignment identity or activity changes through the parent Job", () => {
    expect(buildAssignmentChecklistContextRevisionUpdate(assignedJob)).toEqual({
      checklistContextRevision: 1,
    });
    expect(buildAssignmentChecklistContextRevisionUpdate({
      ...assignedJob,
      checklistContextRevision: 1,
    })).toEqual({ checklistContextRevision: 2 });
  });

  it("does not advance for normal execution transitions inside the eligible set", () => {
    expect(isChecklistEligibleExecutionState(assignedJob)).toBe(true);
    expect(buildChecklistContextRevisionUpdate(assignedJob, {
      operationalStatus: "IN_PROGRESS",
    })).toEqual({});
    expect(buildChecklistContextRevisionUpdate({
      ...assignedJob,
      operationalStatus: "IN_PROGRESS",
    }, { operationalStatus: "COMPLETED" })).toEqual({ checklistContextRevision: 1 });
  });

  it("preserves the revision for prices, payouts, notes, provenance, and checklist answers", () => {
    expect(hasChecklistContextChanged(assignedJob, {
      clientPrice: 300,
      cleanerPayout: 150,
      payoutId: "payout-1",
      notes: "Manager note",
      dataProvenance: "DEMO",
      checklistAnswers: { item: true },
    })).toBe(false);
    expect(buildChecklistContextRevisionUpdate(assignedJob, { notes: "Manager note" })).toEqual({});
  });
});

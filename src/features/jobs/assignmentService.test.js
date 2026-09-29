import { describe, expect, it } from "vitest";
import {
  assignmentRemovalJobUpdate,
  buildAssignmentCreateData,
  canAssignCleanerDirectly,
  canAssignInterestedOffer,
  canEditAssignmentRoster,
  isActionableOffer,
  replacementCleanerIds,
} from "./assignmentService.js";

describe("assignment roster compatibility rules", () => {
  const teamJob = {
    schemaVersion: 2,
    operationalStatus: "ASSIGNED",
    assignedCleanerIds: ["cleaner-a", "cleaner-b"],
  };

  it("keeps another active cleaner assigned when one roster member is removed", () => {
    expect(assignmentRemovalJobUpdate(teamJob, "cleaner-a", true)).toEqual({
      assignedCleanerIds: ["cleaner-b"],
      operationalStatus: "ASSIGNED",
    });
  });

  it("returns the final removal to OFFERED only when a response can still act on it", () => {
    const job = { ...teamJob, assignedCleanerIds: ["cleaner-a"] };

    expect(assignmentRemovalJobUpdate(job, "cleaner-a", true)).toEqual({
      assignedCleanerIds: [],
      operationalStatus: "OFFERED",
    });
    expect(assignmentRemovalJobUpdate(job, "cleaner-a", false)).toEqual({
      assignedCleanerIds: [],
      operationalStatus: "UNASSIGNED",
    });
  });

  it("recognizes only pending and interested offers as actionable", () => {
    expect(isActionableOffer({ status: "PENDING" })).toBe(true);
    expect(isActionableOffer({ status: "INTERESTED" })).toBe(true);
    expect(isActionableOffer({ status: "DECLINED" })).toBe(false);
  });

  it("permits roster changes only for pre-start v2 Jobs and interested unassigned cleaners", () => {
    expect(canEditAssignmentRoster(teamJob)).toBe(true);
    expect(canEditAssignmentRoster({ ...teamJob, operationalStatus: "IN_PROGRESS" })).toBe(false);
    expect(canEditAssignmentRoster({ operationalStatus: "ASSIGNED" })).toBe(false);
    expect(canAssignInterestedOffer(teamJob, { cleanerId: "cleaner-c", status: "INTERESTED" })).toBe(true);
    expect(canAssignInterestedOffer(teamJob, { cleanerId: "cleaner-a", status: "INTERESTED" })).toBe(false);
    expect(canAssignInterestedOffer(teamJob, { cleanerId: "cleaner-c", status: "DECLINED" })).toBe(false);
  });

  it("offers direct assignment for active unassigned Cleaners before work starts", () => {
    const cleaner = { id: "cleaner-c", name: "Sample Cleaner", active: true };
    expect(canAssignCleanerDirectly({ ...teamJob, operationalStatus: "UNASSIGNED", assignedCleanerIds: [] }, cleaner)).toBe(true);
    expect(canAssignCleanerDirectly({ ...teamJob, operationalStatus: "OFFERED" }, cleaner)).toBe(true);
    expect(canAssignCleanerDirectly(teamJob, cleaner)).toBe(true);
    expect(canAssignCleanerDirectly(teamJob, { ...cleaner, id: "cleaner-a" })).toBe(false);
    expect(canAssignCleanerDirectly(teamJob, { ...cleaner, active: false })).toBe(false);
    expect(canAssignCleanerDirectly(teamJob, { ...cleaner, archivedAt: "archive" })).toBe(false);
    expect(canAssignCleanerDirectly({ ...teamJob, archivedAt: "archive" }, cleaner)).toBe(false);
    expect(canAssignCleanerDirectly({ ...teamJob, operationalStatus: "IN_PROGRESS" }, cleaner)).toBe(false);
    expect(canAssignCleanerDirectly({ ...teamJob, operationalStatus: "COMPLETED" }, cleaner)).toBe(false);
    expect(canAssignCleanerDirectly({ ...teamJob, schemaVersion: 1 }, cleaner)).toBe(false);
  });

  it("builds the replacement projection without retaining the removed cleaner", () => {
    expect(replacementCleanerIds(teamJob, "cleaner-a", "cleaner-c")).toEqual([
      "cleaner-c",
      "cleaner-b",
    ]);
  });

  it("keeps direct assignments compatible with removal and Offer-based replacement", () => {
    const directlyAssignedJob = {
      ...teamJob,
      assignedCleanerIds: ["cleaner-a", "cleaner-b"],
    };
    const directAssignment = {
      cleanerId: "cleaner-a",
      source: "MANAGER_DIRECT",
      isActive: true,
    };

    expect(assignmentRemovalJobUpdate(directlyAssignedJob, directAssignment.cleanerId, false))
      .toEqual({ assignedCleanerIds: ["cleaner-b"], operationalStatus: "ASSIGNED" });
    expect(replacementCleanerIds(directlyAssignedJob, directAssignment.cleanerId, "cleaner-c"))
      .toEqual(["cleaner-c", "cleaner-b"]);
  });

  it("builds an assignment with the required Job and interested-offer snapshots only", () => {
    const assignment = buildAssignmentCreateData(
      {
        id: "job-1",
        propertyId: "property-1",
        propertyName: "Team Property",
        scheduledDate: "2026-09-01",
        scheduledStart: "10:00",
      },
      { id: "offer-1", cleanerId: "cleaner-a", cleanerName: "Ana" },
    );

    expect(assignment).toMatchObject({
      schemaVersion: 1,
      organizationId: "cleanflow-demo",
      jobId: "job-1",
      cleanerId: "cleaner-a",
      cleanerNameSnapshot: "Ana",
      source: "OFFER",
      sourceOfferId: "offer-1",
      isActive: true,
      executionStatus: "ASSIGNED",
      propertyId: "property-1",
      propertyName: "Team Property",
      scheduledDate: "2026-09-01",
      scheduledStart: "10:00",
    });
    expect(assignment).not.toHaveProperty("workedHours");
    expect(assignment).not.toHaveProperty("payoutId");
  });
});

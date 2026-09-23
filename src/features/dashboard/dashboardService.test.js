import { describe, expect, it } from "vitest";
import { filterArchivedRecords } from "../../lib/archiveState.js";
import {
  composeAttentionJobCandidates,
  filterVisibleActiveJobs,
  visibleDashboardCounts,
} from "./dashboardService.js";

describe("composeAttentionJobCandidates", () => {
  it("keeps bounded stale attention work while adding current assignment candidates", () => {
    const staleAttentionJobs = Array.from({ length: 10 }, (_, index) => ({
      id: `august-${index}`,
      operationalStatus: "UNASSIGNED",
      scheduledDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
    }));
    const next48HoursJobs = [
      {
        id: "today-unassigned",
        operationalStatus: "UNASSIGNED",
        scheduledDate: "2026-09-08",
      },
      {
        id: "tomorrow-offered",
        operationalStatus: "OFFERED",
        scheduledDate: "2026-09-09",
      },
      {
        id: "today-assigned",
        operationalStatus: "ASSIGNED",
        scheduledDate: "2026-09-08",
      },
      staleAttentionJobs[0],
    ];

    const candidates = composeAttentionJobCandidates(staleAttentionJobs, next48HoursJobs);

    expect(candidates).toHaveLength(12);
    expect(candidates.map((job) => job.id)).toEqual([
      ...staleAttentionJobs.map((job) => job.id),
      "today-unassigned",
      "tomorrow-offered",
    ]);
    expect(candidates).not.toContainEqual(
      expect.objectContaining({ id: "today-assigned" }),
    );
  });

  it("uses one active-Job boundary for Dashboard rows and counts", () => {
    const activeJob = { id: "active", propertyId: "active-property", operationalStatus: "UNASSIGNED" };
    const archivedJob = { id: "archived-job", propertyId: "active-property", archivedAt: {}, operationalStatus: "UNASSIGNED" };
    const archivedPropertyJob = { id: "archived-property-job", propertyId: "archived-property", operationalStatus: "UNASSIGNED" };
    const orphanedJob = { id: "orphaned-job", propertyId: "missing-property", operationalStatus: "UNASSIGNED" };
    const propertiesById = {
      "active-property": { id: "active-property" },
      "archived-property": { id: "archived-property", archivedAt: {} },
    };

    const visibleJobs = filterVisibleActiveJobs(
      [activeJob, archivedJob, archivedPropertyJob, orphanedJob],
      propertiesById,
    );

    expect(visibleJobs).toEqual([activeJob]);
    expect(visibleDashboardCounts({
      todayJobs: visibleJobs,
      openJobs: visibleJobs,
      inProgressJobs: [],
      completedTodayJobs: [],
    })).toMatchObject({ today: 1, needsAssignment: 1, inProgress: 0, completedToday: 0 });
    expect(filterArchivedRecords([archivedJob], true)).toEqual([archivedJob]);
  });
});

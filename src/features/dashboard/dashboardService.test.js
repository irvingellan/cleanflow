import { describe, expect, it } from "vitest";
import { composeAttentionJobCandidates } from "./dashboardService.js";

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
});

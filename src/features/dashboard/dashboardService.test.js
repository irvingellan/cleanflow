import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getCleanerNamesById: vi.fn(),
  getOpenJobIssues: vi.fn(),
  getInterestedJobOffers: vi.fn(),
  getPendingJobOffers: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: services.getDocs,
  orderBy: vi.fn(),
  query: vi.fn(),
  Timestamp: { fromDate: vi.fn((date) => date) },
  where: vi.fn(),
}));
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));
vi.mock("../cleaners/cleanerService.js", () => ({
  getCleanerNamesById: services.getCleanerNamesById,
}));
vi.mock("../issues/issueService.js", () => ({
  getOpenJobIssues: services.getOpenJobIssues,
}));
vi.mock("../jobs/jobOfferService.js", () => ({
  getInterestedJobOffers: services.getInterestedJobOffers,
  getPendingJobOffers: services.getPendingJobOffers,
}));

import { filterArchivedRecords } from "../../lib/archiveState.js";
import { assignedCleanerSummary } from "../jobs/assignmentPresentation.js";
import {
  composeAttentionJobCandidates,
  filterVisibleActiveJobs,
  getOperationalDashboard,
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

describe("Dashboard cleaner names across Job schemas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 12));
    services.getOpenJobIssues.mockResolvedValue([]);
    services.getInterestedJobOffers.mockResolvedValue([]);
    services.getPendingJobOffers.mockResolvedValue([]);
    services.getCleanerNamesById.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function loadDashboard({ upcoming = [], completed = [], names = {} }) {
    const snapshot = (records) => ({
      docs: records.map(({ id, ...data }) => ({ id, data: () => data })),
    });
    const jobs = (records) => records.map((job) => ({
      propertyId: "property-a",
      scheduledDate: "2026-09-30",
      scheduledStart: "13:00",
      operationalStatus: "ASSIGNED",
      ...job,
    }));
    for (const records of [
      [{ id: "property-a" }],
      [],
      [],
      jobs(upcoming),
      jobs(completed),
      [],
      [],
    ]) {
      services.getDocs.mockResolvedValueOnce(snapshot(records));
    }
    // Mirrors the existing batched name lookup: absent records are simply absent.
    services.getCleanerNamesById.mockImplementation(async (ids) =>
      Object.fromEntries([...new Set(ids)].filter((id) => names[id])
        .map((id) => [id, names[id]])));

    return getOperationalDashboard();
  }

  const translate = (key, { count }) => `${key}:${count}`;
  const summary = (job, dashboard) => assignedCleanerSummary(
    job, dashboard.cleanerNamesById, translate, "Not assigned",
  );

  it("resolves a v2 roster name in one existing batched lookup", async () => {
    const dashboard = await loadDashboard({
      upcoming: [{ id: "job-v2", schemaVersion: 2, assignedCleanerIds: ["cleaner-a"] }],
      names: { "cleaner-a": "Cleaner Alpha" },
    });

    expect(summary(dashboard.next48HoursJobs[0], dashboard)).toBe("Cleaner Alpha");
    expect(services.getCleanerNamesById).toHaveBeenCalledTimes(1);
    expect(services.getCleanerNamesById).toHaveBeenCalledWith(expect.arrayContaining(["cleaner-a"]));
    expect(services.getDocs).toHaveBeenCalledTimes(7);
  });

  it("renders current multi-cleaner roster names once each using existing presentation", async () => {
    const dashboard = await loadDashboard({
      upcoming: [{
        id: "job-team", schemaVersion: 2,
        assignedCleanerIds: ["cleaner-a", "cleaner-b", "cleaner-a"],
      }],
      completed: [{
        id: "job-completed", schemaVersion: 2,
        operationalStatus: "COMPLETED", assignedCleanerIds: ["cleaner-b"],
      }],
      names: { "cleaner-a": "Cleaner Alpha", "cleaner-b": "Cleaner Beta" },
    });

    expect(summary(dashboard.next48HoursJobs[0], dashboard)).toBe("Cleaner Alpha · Cleaner Beta");
    expect(summary(dashboard.recentlyCompletedJobs[0], dashboard)).toBe("Cleaner Beta");
    expect(services.getCleanerNamesById).toHaveBeenCalledTimes(1);
    expect(services.getCleanerNamesById).toHaveBeenCalledWith(expect.arrayContaining([
      "cleaner-a", "cleaner-b",
    ]));
  });

  it("preserves singular legacy current-name and historical snapshot fallbacks", async () => {
    const dashboard = await loadDashboard({
      upcoming: [{ id: "job-legacy", assignedCleanerId: "cleaner-a", assignedCleanerName: "Old name" }],
      completed: [{ id: "legacy-history", operationalStatus: "COMPLETED", assignedCleanerName: "Historical name" }],
      names: { "cleaner-a": "Cleaner Alpha" },
    });

    expect(summary(dashboard.next48HoursJobs[0], dashboard)).toBe("Cleaner Alpha");
    expect(summary(dashboard.recentlyCompletedJobs[0], dashboard)).toBe("Historical name");
  });

  it("retains the graceful assigned-count fallback when a v2 Cleaner record is missing", async () => {
    const dashboard = await loadDashboard({
      upcoming: [{ id: "missing-cleaner", schemaVersion: 2, assignedCleanerIds: ["missing"] }],
    });

    expect(summary(dashboard.next48HoursJobs[0], dashboard)).toBe("jobs.cleanerAssignedOne:1");
    expect(services.getCleanerNamesById).toHaveBeenCalledTimes(1);
  });
});

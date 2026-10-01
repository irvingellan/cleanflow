import { describe, expect, it } from "vitest";
import { buildPilotScorecard } from "../../scripts/pilotScorecardCore.mjs";

const timestamp = (date) => new Date(`${date}T12:00:00.000Z`);

function realJob(overrides = {}) {
  return {
    id: "job-a",
    dataProvenance: "REAL",
    schemaVersion: 1,
    createdAt: timestamp("2026-09-20"),
    scheduledDate: "2026-09-22",
    completedAt: timestamp("2026-09-23"),
    clientPrice: 250,
    cleanerPayout: 120,
    offers: [],
    assignments: [],
    checklistRuns: [],
    ...overrides,
  };
}

const period = { from: "2026-09-20", to: "2026-09-26" };

describe("buildPilotScorecard", () => {
  it("counts only explicitly REAL Jobs and excludes demo and missing provenance", () => {
    const report = buildPilotScorecard({
      ...period,
      jobs: [
        realJob(),
        realJob({ id: "demo", dataProvenance: "DEMO" }),
        realJob({ id: "test", dataProvenance: "TEST" }),
        realJob({ id: "unknown", dataProvenance: undefined }),
      ],
    });

    expect(report.jobs).toMatchObject({ created: 1, scheduled: 1, completed: 1 });
  });

  it("returns zero counts and distinguishes omitted from zero expected denominator", () => {
    const empty = buildPilotScorecard({ ...period, jobs: [] });
    expect(empty.jobs.scheduled).toBe(0);
    expect(empty.offers.created).toBe(0);
    expect(empty.checklists.readyForReviewRuns).toBe(0);
    expect(empty.expectedJobs).toEqual({ supplied: false, actualScheduledJobs: 0 });

    const zeroExpected = buildPilotScorecard({ ...period, jobs: [], expectedJobs: 0 });
    expect(zeroExpected.expectedJobs).toMatchObject({ supplied: true, expected: 0, coveragePercent: null });
  });

  it("excludes archived REAL Jobs and their funnel data from all active totals", () => {
    const funnel = {
      offers: [{ createdAt: timestamp("2026-09-21"), respondedAt: timestamp("2026-09-22"),
        status: "INTERESTED", offeredCompensation: 100 }],
      assignments: [{ isActive: true }],
      checklistRuns: [{ status: "READY_FOR_REVIEW",
        evidence: [{ status: "SAVED", contentType: "image/jpeg" }],
        clientReportCapabilities: [{ createdAt: timestamp("2026-09-23") }] }],
    };
    const active = realJob(funnel);
    const report = buildPilotScorecard({ ...period, expectedJobs: 2, jobs: [
      active,
      realJob({ ...funnel, id: "archived", archivedAt: timestamp("2026-09-24") }),
      realJob({ id: "archived-outside", archivedAt: timestamp("2026-09-24"), scheduledDate: "2026-09-19" }),
      realJob({ id: "archived-demo", dataProvenance: "DEMO", archivedAt: timestamp("2026-09-24") }),
      realJob({ id: "archived-unknown", dataProvenance: undefined, archivedAt: timestamp("2026-09-24") }),
    ] });
    const activeOnly = buildPilotScorecard({ ...period, expectedJobs: 2, jobs: [active] });

    expect(report.jobs).toEqual(activeOnly.jobs);
    expect(report.offers).toEqual(activeOnly.offers);
    expect(report.checklists).toEqual(activeOnly.checklists);
    expect(report.clientReports).toEqual(activeOnly.clientReports);
    expect(report.expectedJobs).toEqual({ supplied: true, expected: 2, actualScheduledJobs: 1, coveragePercent: 50 });
    expect(report.archivedJobs).toEqual({ scheduled: 1 });
  });

  it("keeps legacy missing and restored null archive fields active", () => {
    const report = buildPilotScorecard({ ...period, jobs: [realJob(), realJob({ archivedAt: null })] });
    expect(report.jobs).toMatchObject({ created: 2, scheduled: 2, completed: 2 });
    expect(report.archivedJobs.scheduled).toBe(0);
  });

  it("counts offer creation and response timestamps without treating a status as a dated response", () => {
    const report = buildPilotScorecard({
      ...period,
      jobs: [realJob({ offers: [
        { createdAt: timestamp("2026-09-21"), respondedAt: timestamp("2026-09-24"), status: "INTERESTED", offeredCompensation: 0 },
        { createdAt: timestamp("2026-09-22"), respondedAt: timestamp("2026-09-26"), status: "DECLINED" },
        { createdAt: timestamp("2026-09-22"), status: "INTERESTED" },
      ] })],
    });

    expect(report.jobs.scheduledWithOffers).toBe(1);
    expect(report.offers).toMatchObject({ created: 3, interestedResponses: 1, declinedResponses: 1 });
    expect(report.offers.scheduledJobOffersWithIndividualCompensation).toBe(1);
  });

  it("counts active Assignments, checklist states, saved photos and latest report-capability records", () => {
    const report = buildPilotScorecard({
      ...period,
      jobs: [realJob({
        assignments: [{ isActive: true }, { isActive: false }],
        checklistRuns: [
          { status: "DRAFT", evidence: [{ status: "SAVED", contentType: "image/jpeg" }] },
          { status: "READY_FOR_REVIEW", evidence: [{ status: "PENDING", contentType: "image/png" }],
            clientReportCapabilities: [{ createdAt: timestamp("2026-09-25"), status: "REVOKED" }] },
        ],
      })],
    });

    expect(report.jobs.scheduledWithActiveAssignments).toBe(1);
    expect(report.checklists).toEqual({ draftRuns: 1, readyForReviewRuns: 1, runsWithSavedEvidencePhoto: 1 });
    expect(report.clientReports).toEqual({ latestCapabilityRecordsCreated: 1, opened: null });
  });

  it("keeps v2 Job cleanerPayout out of assignment compensation and computes source coverage", () => {
    const report = buildPilotScorecard({
      ...period,
      expectedJobs: 10,
      jobs: [
        ...Array.from({ length: 7 }, (_, index) => realJob({ id: `legacy-${index}` })),
        realJob({ id: "v2", schemaVersion: 2, cleanerPayout: 200 }),
      ],
    });

    expect(report.jobs.scheduledWithLegacyCleanerPayout).toBe(7);
    expect(report.expectedJobs).toMatchObject({ actualScheduledJobs: 8, expected: 10, coveragePercent: 80 });
  });

  it("returns aggregate-only output without copying any source identity fields", () => {
    const report = buildPilotScorecard({
      ...period,
      jobs: [realJob({ id: "private-id", propertyName: "Private property", clientName: "Private client" })],
    });

    expect(JSON.stringify(report)).not.toContain("private-id");
    expect(JSON.stringify(report)).not.toContain("Private property");
    expect(JSON.stringify(report)).not.toContain("Private client");
  });
});

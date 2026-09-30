import { describe, expect, it } from "vitest";
import { buildCompatibilityAudit } from "../../scripts/pilotCompatibilityAuditCore.mjs";

// Synthetic fixtures mirroring Job generations observed in the pilot audit.
// Every identifier and label here is fictitious.
const now = new Date("2026-09-30T12:00:00.000Z");
const today = "2026-09-30";
const future = { toMillis: () => now.getTime() + 86_400_000 };
const past = { toMillis: () => now.getTime() - 86_400_000 };
const stamp = { toMillis: () => now.getTime() - 3_600_000 };

function v2Job(overrides = {}) {
  return {
    id: "synthetic-job",
    dataProvenance: "REAL",
    schemaVersion: 2,
    operationalStatus: "ASSIGNED",
    scheduledDate: "2026-10-05",
    checklistContextRevision: 1,
    assignedCleanerIds: ["cleaner-a"],
    propertyId: "property-a",
    property: { archived: false },
    offers: [{ id: "cleaner-a", cleanerId: "cleaner-a", status: "INTERESTED", offeredCompensation: 90, publicOfferExpiresAt: future }],
    assignments: [{ id: "assignment-a", cleanerId: "cleaner-a", isActive: true, source: "OFFER", sourceOfferId: "cleaner-a" }],
    checklistRuns: [],
    ...overrides,
  };
}

function draftRun({ revision = 0, evidence = [], capability = null } = {}) {
  return {
    id: "initial",
    status: "DRAFT",
    drafts: revision ? [{ id: "current", revision }] : [],
    evidence,
    capabilities: capability ? [{ id: "active", ...capability }] : [],
  };
}

const savedPhoto = [{ status: "SAVED", contentType: "image/jpeg" }];

describe("buildCompatibilityAudit", () => {
  it("treats a current schema-v2 Offer-sourced Job without a Run as healthy", () => {
    const report = buildCompatibilityAudit({ jobs: [v2Job()], today, now });

    expect(report.inventory.realBySchema).toEqual({ legacyVersionless: 0, singularV1: 0, assignmentAwareV2: 1 });
    expect(report.realOperational).toMatchObject({ jobs: 1, upcomingOpenWithoutRun: 1, pastDueOpen: 0, rosterMismatch: 0 });
    expect(report.childRecords).toMatchObject({ realOfferAssignmentsWithSourceField: 1, realOffersWithoutCompensationSnapshotV2: 0 });
    expect(report.managerReview).toBe(0);
  });

  it("recognizes pre-Fast-Path Assignments by source Offer and v2 Offers without an amount snapshot", () => {
    const report = buildCompatibilityAudit({
      jobs: [v2Job({
        offers: [{ id: "cleaner-a", cleanerId: "cleaner-a", status: "INTERESTED", publicOfferExpiresAt: past }],
        assignments: [{ id: "assignment-a", cleanerId: "cleaner-a", isActive: true, sourceOfferId: "cleaner-a" }],
      })],
      today,
      now,
    });

    expect(report.childRecords).toMatchObject({
      realOfferAssignmentsWithoutSourceField: 1,
      realAssignmentsWithoutSourceOrOffer: 0,
      realOffersWithoutCompensationSnapshotV2: 1,
      realOffersWithoutCompensationSnapshotLegacyFallback: 0,
    });
    expect(report.managerReview).toBe(0);
  });

  it("flags a direct Assignment that coexists with the same Cleaner's open Offer link", () => {
    const report = buildCompatibilityAudit({
      jobs: [v2Job({
        offers: [{ id: "cleaner-a", cleanerId: "cleaner-a", status: "PENDING", offeredCompensation: 90, publicOfferExpiresAt: future }],
        assignments: [{ id: "assignment-a", cleanerId: "cleaner-a", isActive: true, source: "MANAGER_DIRECT" }],
      })],
      today,
      now,
    });

    expect(report.realOperational.directAssignmentWithOpenSameCleanerOffer).toBe(1);
    expect(report.childRecords.realManagerDirectAssignments).toBe(1);
  });

  it("names the stale-revision link left after the same Cleaner was removed and reassigned", () => {
    const report = buildCompatibilityAudit({
      jobs: [v2Job({
        scheduledDate: today,
        checklistContextRevision: 3,
        assignments: [
          { id: "assignment-old", cleanerId: "cleaner-a", isActive: false, sourceOfferId: "cleaner-a" },
          { id: "assignment-new", cleanerId: "cleaner-a", isActive: true, source: "OFFER", sourceOfferId: "cleaner-a" },
        ],
        checklistRuns: [draftRun({
          revision: 44,
          capability: { status: "ACTIVE", cleanerId: "cleaner-a", contextRevision: 1, expiresAt: future },
        })],
      })],
      today,
      now,
    });

    expect(report.realOperational.draftRunLinkState).toEqual({ STALE_REVISION: 1 });
    expect(report.realOperational.upcomingOpenScheduleLockedByRun).toBe(1);
    expect(report.realOperational.rosterMismatch).toBe(0);
  });

  it("separates past-due open Jobs by what the cleaner actually saved", () => {
    const pastDue = (run) => v2Job({ scheduledDate: "2026-09-23", checklistRuns: run ? [run] : [] });
    const report = buildCompatibilityAudit({
      jobs: [
        pastDue(draftRun({ revision: 45, capability: { status: "ACTIVE", cleanerId: "cleaner-a", contextRevision: 1, expiresAt: future } })),
        pastDue(draftRun({ capability: { status: "ACTIVE", cleanerId: "cleaner-a", contextRevision: 1, expiresAt: past } })),
        pastDue(draftRun({ revision: 12, evidence: savedPhoto })),
        pastDue({ id: "initial", status: "READY_FOR_REVIEW", drafts: [{ revision: 40 }], evidence: savedPhoto, capabilities: [] }),
        pastDue(null),
      ],
      today,
      now,
    });

    expect(report.realOperational.pastDueOpen).toBe(5);
    expect(report.realOperational.pastDueByChecklist).toEqual({
      draftSavedWithoutEvidence: 1,
      draftUntouched: 1,
      draftWithEvidence: 1,
      readyForReview: 1,
      noRun: 1,
    });
    expect(report.realOperational.draftRunLinkState).toEqual({ ACTIVE: 1, EXPIRED: 1, NONE: 1 });
    expect(report.managerReview).toBe(5);
  });

  it("counts an untouched future Run as a schedule lock, not as manager review", () => {
    const report = buildCompatibilityAudit({ jobs: [v2Job({ checklistRuns: [draftRun()] })], today, now });

    expect(report.realOperational).toMatchObject({ upcomingOpenScheduleLockedByRun: 1, draftRunLinkState: { NONE: 1 } });
    expect(report.managerReview).toBe(0);
  });

  it("keeps completed history separate and flags only a missing completion timestamp", () => {
    const report = buildCompatibilityAudit({
      jobs: [
        v2Job({ operationalStatus: "COMPLETED", completedAt: stamp, scheduledDate: "2026-09-28" }),
        v2Job({ operationalStatus: "COMPLETED", scheduledDate: "2026-09-28" }),
      ],
      today,
      now,
    });

    expect(report.realOperational).toMatchObject({ completedWithCompletedAt: 1, completedWithoutCompletedAt: 1, pastDueOpen: 0 });
    expect(report.financial.realCompletedAssignmentAwareWithoutPayoutPath).toBe(2);
    expect(report.managerReview).toBe(1);
  });

  it("flags roster drift and an assigned v2 Job without an active Assignment", () => {
    const report = buildCompatibilityAudit({
      jobs: [
        v2Job({ assignedCleanerIds: ["cleaner-a", "cleaner-b"] }),
        v2Job({ assignedCleanerIds: [], assignments: [] }),
      ],
      today,
      now,
    });

    expect(report.realOperational).toMatchObject({ rosterMismatch: 1, assignedWithoutActiveAssignment: 1 });
    expect(report.managerReview).toBe(2);
  });

  it("keeps archived and non-REAL legacy history out of operational counts", () => {
    const report = buildCompatibilityAudit({
      jobs: [
        {
          id: "legacy-a",
          operationalStatus: "COMPLETED",
          assignedCleanerId: "cleaner-a",
          cleanerPayout: 80,
          payoutId: "payout-a",
          completedAt: stamp,
          archivedAt: stamp,
          offers: [{ id: "cleaner-a", cleanerId: "cleaner-a", status: "INTERESTED" }],
        },
        { id: "demo-a", dataProvenance: "DEMO", schemaVersion: 2, operationalStatus: "UNASSIGNED", property: { archived: true } },
        v2Job({
          archivedAt: stamp,
          operationalStatus: "ASSIGNED",
          property: { archived: true },
          offers: [],
          checklistRuns: [{ id: "initial", status: "READY_FOR_REVIEW", drafts: [{ revision: 15 }], evidence: savedPhoto, capabilities: [] }],
        }),
        v2Job({
          archivedAt: stamp,
          operationalStatus: "OFFERED",
          assignedCleanerIds: [],
          assignments: [],
          offers: [{ id: "cleaner-b", cleanerId: "cleaner-b", status: "PENDING", offeredCompensation: 70, publicOfferExpiresAt: future }],
        }),
      ],
      today,
      now,
    });

    expect(report.inventory).toMatchObject({
      provenance: { REAL: 2, DEMO: 1, UNKNOWN: 1 },
      realArchived: 2,
      nonRealArchived: 1,
      nonRealOperational: 1,
      nonRealLegacySchema: 1,
    });
    expect(report.realOperational.jobs).toBe(0);
    expect(report.archived).toEqual({
      realWithSubmittedChecklistEvidence: 1,
      realWithOpenOfferLink: 1,
      nonRealOperationalOnArchivedProperty: 1,
    });
    expect(report.financial.legacyPayoutLinkedJobs).toBe(1);
    expect(report.managerReview).toBe(1);
  });

  it("flags any REAL legacy singular-cleaner or invalid-revision Job that reappears", () => {
    const report = buildCompatibilityAudit({
      jobs: [
        v2Job({ schemaVersion: 1, assignedCleanerIds: undefined, assignedCleanerId: "cleaner-a", assignments: [] }),
        v2Job({ checklistContextRevision: "3" }),
      ],
      today,
      now,
    });

    expect(report.inventory.realBySchema).toEqual({ legacyVersionless: 0, singularV1: 1, assignmentAwareV2: 1 });
    expect(report.realOperational).toMatchObject({ legacySingularCleaner: 1, invalidChecklistContextRevision: 1 });
    expect(report.managerReview).toBe(2);
  });

  it("is deterministic and never echoes identifiers", () => {
    const jobs = [v2Job({ id: "secret-job-id", scheduledDate: "2026-09-23", checklistRuns: [draftRun({ revision: 3 })] })];
    const first = buildCompatibilityAudit({ jobs, today, now });

    expect(buildCompatibilityAudit({ jobs, today, now })).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/secret-job-id|cleaner-a|property-a|assignment-a/);
    expect(() => buildCompatibilityAudit({ jobs, today: "2026-02-30", now })).toThrow("YYYY-MM-DD");
  });
});

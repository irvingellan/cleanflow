import { describe, expect, it } from "vitest";
import {
  CURRENT_JOB_SCHEMA_VERSION,
  ASSIGNMENT_AWARE_JOB_SCHEMA_VERSION,
  LEGACY_JOB_SCHEMA_VERSION,
  SINGULAR_JOB_SCHEMA_VERSION,
  buildCurrentJobCreateData,
  canManageAssignmentAwareOffers,
  getAssignedCleanerIds,
  getJobGrossMargin,
  getJobSchemaVersion,
  isLegacyJob,
  normalizeJobRecord,
  optionalJobPrice,
} from "./jobCompatibility.js";

describe("Job compatibility", () => {
  it("keeps versionless legacy singular-cleaner and payout fields readable", () => {
    const legacyJob = normalizeJobRecord({
      assignedCleanerId: "cleaner-1",
      assignedCleanerName: "Legacy Cleaner",
      cleanerPayout: 150,
      payoutId: "payout-1",
      operationalStatus: "COMPLETED",
    }, "legacy-job");

    expect(getJobSchemaVersion(legacyJob)).toBe(LEGACY_JOB_SCHEMA_VERSION);
    expect(isLegacyJob(legacyJob)).toBe(true);
    expect(legacyJob).toMatchObject({
      id: "legacy-job",
      assignedCleanerId: "cleaner-1",
      assignedCleanerName: "Legacy Cleaner",
      cleanerPayout: 150,
      payoutId: "payout-1",
      operationalStatus: "COMPLETED",
    });
  });

  it("treats invalid schema versions as legacy without modifying legacy fields", () => {
    const job = normalizeJobRecord({
      schemaVersion: "1",
      assignedCleanerId: "cleaner-1",
      cleanerPayout: 150,
    }, "legacy-invalid-version");

    expect(getJobSchemaVersion(job)).toBe(LEGACY_JOB_SCHEMA_VERSION);
    expect(job).toMatchObject({
      assignedCleanerId: "cleaner-1",
      cleanerPayout: 150,
    });
  });

  it("keeps singular schema v1 identity snapshots and optional guest context", () => {
    const job = normalizeJobRecord({
      schemaVersion: SINGULAR_JOB_SCHEMA_VERSION,
      clientId: " client-1 ",
      clientName: "Client Snapshot",
      guestName: " Jordan Lee ",
    }, "job-1");

    expect(job).toMatchObject({
      id: "job-1",
      schemaVersion: SINGULAR_JOB_SCHEMA_VERSION,
      clientId: "client-1",
      clientName: "Client Snapshot",
      guestName: "Jordan Lee",
    });
  });

  it("builds an assignment-aware v2 Job without inferring a Client ID or keeping a blank guest name", () => {
    const job = buildCurrentJobCreateData({
      organizationId: "cleanflow-demo",
      propertyId: "property-1",
      propertyName: "Linked Property",
      clientName: "Snapshot Client",
      scheduledDate: "2026-09-01",
      clientPrice: 250,
      cleanerPayout: 150,
      notes: "",
      guestName: "   ",
    });

    expect(job).toMatchObject({
      schemaVersion: CURRENT_JOB_SCHEMA_VERSION,
      clientName: "Snapshot Client",
      operationalStatus: "UNASSIGNED",
      assignedCleanerIds: [],
      checklistContextRevision: 0,
    });
    expect(job).not.toHaveProperty("clientId");
    expect(job).not.toHaveProperty("guestName");
  });

  it("copies only an explicitly supplied canonical Client ID", () => {
    const job = buildCurrentJobCreateData({
      organizationId: "cleanflow-demo",
      propertyId: "property-1",
      propertyName: "Linked Property",
      clientId: " client-1 ",
      clientName: "Client Snapshot",
      scheduledDate: "2026-09-01",
      clientPrice: null,
      cleanerPayout: null,
      notes: "",
      guestName: "Guest Name",
    });

    expect(job).toMatchObject({
      clientId: "client-1",
      clientName: "Client Snapshot",
      guestName: "Guest Name",
    });
    expect(job).not.toHaveProperty("clientPrice");
    expect(job).not.toHaveProperty("cleanerPayout");
  });

  it("keeps optional Job prices absent and derives a margin only when both snapshots exist", () => {
    expect(optionalJobPrice("")).toBeUndefined();
    expect(optionalJobPrice(null)).toBeUndefined();
    expect(optionalJobPrice("250.50")).toBe(250.5);
    expect(optionalJobPrice("-1")).toBeNull();
    expect(getJobGrossMargin({ clientPrice: 350, cleanerPayout: 200 })).toBe(150);
    expect(getJobGrossMargin({ clientPrice: 350 })).toBeNull();
  });

  it("keeps a created Job price snapshot independent of later Property defaults", () => {
    const job = buildCurrentJobCreateData({
      organizationId: "cleanflow-demo",
      propertyId: "property-1",
      propertyName: "Linked Property",
      clientName: "Client Snapshot",
      scheduledDate: "2026-09-01",
      clientPrice: 350,
      cleanerPayout: 200,
      notes: "",
    });
    const laterPropertyDefaults = { defaultClientPrice: 400, defaultCleanerPrice: 250 };

    expect(job.clientPrice).toBe(350);
    expect(job.cleanerPayout).toBe(200);
    expect(laterPropertyDefaults).toEqual({ defaultClientPrice: 400, defaultCleanerPrice: 250 });
  });

  it("keeps a v2 roster projection normalized without fabricating assignments", () => {
    const job = normalizeJobRecord({
      schemaVersion: ASSIGNMENT_AWARE_JOB_SCHEMA_VERSION,
      assignedCleanerIds: [" cleaner-1 ", "cleaner-1", "cleaner-2", ""],
    }, "team-job");

    expect(getAssignedCleanerIds(job)).toEqual(["cleaner-1", "cleaner-2"]);
    expect(job).not.toHaveProperty("assignments");
  });

  it("allows v2 offer management only before work starts", () => {
    for (const operationalStatus of ["UNASSIGNED", "OFFERED", "ASSIGNED"]) {
      expect(
        canManageAssignmentAwareOffers({ schemaVersion: 2, operationalStatus }),
      ).toBe(true);
    }

    expect(
      canManageAssignmentAwareOffers({ schemaVersion: 2, operationalStatus: "IN_PROGRESS" }),
    ).toBe(false);
    expect(canManageAssignmentAwareOffers({ operationalStatus: "OFFERED" })).toBe(false);
  });
});

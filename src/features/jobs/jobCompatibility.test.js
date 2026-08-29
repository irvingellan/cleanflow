import { describe, expect, it } from "vitest";
import {
  CURRENT_JOB_SCHEMA_VERSION,
  LEGACY_JOB_SCHEMA_VERSION,
  buildCurrentJobCreateData,
  getJobSchemaVersion,
  isLegacyJob,
  normalizeJobRecord,
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

  it("keeps current compatible identity snapshots and optional guest context", () => {
    const job = normalizeJobRecord({
      schemaVersion: CURRENT_JOB_SCHEMA_VERSION,
      clientId: " client-1 ",
      clientName: "Client Snapshot",
      guestName: " Jordan Lee ",
    }, "job-1");

    expect(job).toMatchObject({
      id: "job-1",
      schemaVersion: CURRENT_JOB_SCHEMA_VERSION,
      clientId: "client-1",
      clientName: "Client Snapshot",
      guestName: "Jordan Lee",
    });
  });

  it("builds a v1-compatible Job without inferring a Client ID or keeping a blank guest name", () => {
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
  });
});

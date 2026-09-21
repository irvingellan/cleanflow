import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  checklistCapabilityState,
  projectChecklistCapabilityForManager,
} from "./checklistCapabilityService.js";

const now = new Date("2026-09-20T12:00:00Z");
const activeCapability = {
  status: "ACTIVE", cleanerId: "cleaner-a", contextRevision: 2,
  expiresAt: Timestamp.fromMillis(now.getTime() + 60_000),
};
const job = { operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a"], checklistContextRevision: 2 };
const run = { status: "DRAFT" };

describe("Checklist capability state", () => {
  it("treats a matching eligible DRAFT context as active", () => {
    expect(checklistCapabilityState(activeCapability, job, run, now)).toBe("ACTIVE");
    expect(checklistCapabilityState(activeCapability, job, { status: "READY_FOR_REVIEW" }, now)).toBe("ACTIVE");
  });

  it("invalidates expiry, revision, archive, cleaner and Run state without revealing a token", () => {
    expect(checklistCapabilityState({ ...activeCapability, expiresAt: Timestamp.fromMillis(now.getTime()) }, job, run, now)).toBe("EXPIRED");
    expect(checklistCapabilityState(activeCapability, { ...job, checklistContextRevision: 3 }, run, now)).toBe("STALE");
    expect(checklistCapabilityState(activeCapability, { ...job, archivedAt: true }, run, now)).toBe("STALE");
    expect(checklistCapabilityState(activeCapability, { ...job, assignedCleanerIds: ["cleaner-b"] }, run, now)).toBe("STALE");
    expect(checklistCapabilityState(activeCapability, job, { status: "SUBMITTED" }, now)).toBe("STALE");
  });

  it("keeps manager summaries free of the bearer hash and raw record context", () => {
    const summary = projectChecklistCapabilityForManager({ ...activeCapability, tokenHash: "secret", jobId: "job" }, job, run, now);
    expect(summary).toEqual(expect.objectContaining({ state: "ACTIVE", cleanerId: "cleaner-a" }));
    expect(JSON.stringify(summary)).not.toContain("secret");
    expect(JSON.stringify(summary)).not.toContain("job");
  });
});

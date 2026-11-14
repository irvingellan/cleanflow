import { describe, expect, it } from "vitest";
import {
  automaticOfferBatch, automaticOfferCapacity, automaticOfferState, FIRST_ACCEPT_WINS, rosterMatchesActiveAssignments,
} from "./firstAcceptWins.js";

const now = new Date("2026-11-14T10:00:00Z");
const expires = new Date("2026-11-15T10:00:00Z");
const job = {
  schemaVersion: 2, offerDistributionMode: FIRST_ACCEPT_WINS, operationalStatus: "OFFERED",
  requiredCleanerCount: 2, assignedCleanerIds: [], checklistContextRevision: 4,
  automaticOfferBatch: { version: 2, capacity: 2, openingContextRevision: 4, currentContextRevision: 4 },
};
const invite = {
  cleanerId: "second", offerDistributionMode: FIRST_ACCEPT_WINS, status: "PENDING",
  automaticOfferBatchVersion: 2, offeredChecklistContextRevision: 4,
  publicOfferExpiresAt: { toMillis: () => expires.getTime() },
};
const partial = {
  ...job, operationalStatus: "ASSIGNED", assignedCleanerIds: ["first"], checklistContextRevision: 5,
  automaticOfferBatch: { ...job.automaticOfferBatch, currentContextRevision: 5 },
};

describe("first accept wins batch", () => {
  it("keeps the second spot open after the first accepted Assignment changed the checklist revision", () => {
    expect(automaticOfferState(invite, job, now)).toBe("available");
    expect(automaticOfferState(invite, partial, now)).toBe("available");
    expect(automaticOfferState({ ...invite, cleanerId: "first" }, partial, now)).toBe("unavailable");
  });

  it("cannot reopen a closed batch after a later roster reduction", () => {
    const closed = { ...partial, offerDistributionClosedAt: now };
    expect(automaticOfferState(invite, closed, now)).toBe("already-taken");
    expect(automaticOfferState(invite, { ...closed, assignedCleanerIds: [], operationalStatus: "UNASSIGNED" }, now)).toBe("already-taken");
  });

  it("rejects unmatched, missing or future batch schemas and external checklist revisions", () => {
    expect(automaticOfferState({ ...invite, automaticOfferBatchVersion: 3 }, job, now)).toBe("unavailable");
    expect(automaticOfferState({ ...invite, offeredChecklistContextRevision: 5 }, partial, now)).toBe("unavailable");
    expect(automaticOfferState(invite, { ...partial, checklistContextRevision: 6 }, now)).toBe("unavailable");
    expect(automaticOfferState(invite, { ...job, automaticOfferBatch: null }, now)).toBe("unavailable");
    expect(automaticOfferState(invite, { ...job, requiredCleanerCount: 3 }, now)).toBe("unavailable");
    expect(automaticOfferState(invite, { ...job, requiredCleanerCount: null }, now)).toBe("unavailable");
  });

  it("preserves withdrawn, expired and declined states without suggesting a finished batch reopened", () => {
    expect(automaticOfferState({ ...invite, status: "REVOKED" }, partial, now)).toBe("unavailable");
    expect(automaticOfferState({ ...invite, revokedAt: now }, partial, now)).toBe("unavailable");
    expect(automaticOfferState(invite, partial, expires)).toBe("expired");
    expect(automaticOfferState({ ...invite, status: "DECLINED" }, partial, now)).toBe("available");
  });

  it("keeps the issued single-spot schema on its original open and claimed rules", () => {
    const { automaticOfferBatch: _batch, ...rest } = job;
    const { automaticOfferBatchVersion: _version, ...legacyInvite } = invite;
    const legacy = { ...rest, requiredCleanerCount: 1 };
    expect(automaticOfferState(legacyInvite, legacy, now)).toBe("available");
    expect(automaticOfferState(legacyInvite, { ...legacy, firstAcceptClaim: { cleanerId: "other" } }, now)).toBe("already-taken");
    expect(automaticOfferState(legacyInvite, { ...legacy, requiredCleanerCount: 2 }, now)).toBe("unavailable");
    expect(automaticOfferState(invite, legacy, now)).toBe("unavailable");
  });

  it("keeps the historical single claim projection for a versioned one-spot close", () => {
    const single = { ...job, requiredCleanerCount: 1,
      automaticOfferBatch: { ...job.automaticOfferBatch, capacity: 1 } };
    const claimed = { ...single, firstAcceptClaim: { cleanerId: "first" } };
    expect(automaticOfferState(invite, claimed, now)).toBe("unavailable");
    expect(automaticOfferState(invite, { ...claimed, offerDistributionClosedAt: now }, now)).toBe("already-taken");
  });

  it("accepts only explicit counts in the supported range or a missing legacy count of one", () => {
    expect(automaticOfferCapacity({})).toBe(1);
    expect(automaticOfferCapacity({ requiredCleanerCount: 10 })).toBe(10);
    for (const value of [0, 11, null, "3", 2.5]) {
      expect(automaticOfferCapacity({ requiredCleanerCount: value })).toBeNull();
    }
    expect(automaticOfferBatch(partial)).toEqual(partial.automaticOfferBatch);
  });

  it("requires a bijection between the roster and the active same-organization Assignments", () => {
    const assignment = { organizationId: "demo-org", jobId: "job-a", isActive: true, cleanerId: "first" };
    expect(rosterMatchesActiveAssignments(partial, [assignment], "demo-org", "job-a")).toBe(true);
    expect(rosterMatchesActiveAssignments(partial, [], "demo-org", "job-a")).toBe(false);
    expect(rosterMatchesActiveAssignments(partial, [assignment, assignment], "demo-org", "job-a")).toBe(false);
    expect(rosterMatchesActiveAssignments(partial, [{ ...assignment, organizationId: "other-org" }], "demo-org", "job-a")).toBe(false);
  });
});

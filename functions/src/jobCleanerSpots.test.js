import { describe, expect, it } from "vitest";
import { assignmentAllowsAutomaticAcceptance, automaticOfferBatch } from "./firstAcceptWins.js";
import { setJobCleanerSpotsForManager } from "./jobCleanerSpots.js";

describe("manager spot changes", () => {
  it.each([0, 11, -1, 1.5, "2", undefined])("rejects invalid counts before reaching Firestore", async count => {
    await expect(setJobCleanerSpotsForManager(null, { organizationId: "demo", actorUid: "manager", jobId: "job", count }))
      .rejects.toHaveProperty("code", "invalid-argument");
  });

  it("requires the reopening notice to refer to a real revision within this batch", () => {
    const batch = { version: 2, capacity: 2, openingContextRevision: 1, currentContextRevision: 5 };
    for (const revision of [null, "2", 0, 6]) {
      expect(automaticOfferBatch({ requiredCleanerCount: 2, automaticOfferBatch: { ...batch, reopenedAtContextRevision: revision } })).toBeNull();
    }
    expect(automaticOfferBatch({ requiredCleanerCount: 2, automaticOfferBatch: batch })).toEqual(batch);
  });

  it("keeps the original automatic-only guard until a manager explicitly reopens the batch", () => {
    const direct = { source: "MANAGER_DIRECT" };
    expect(assignmentAllowsAutomaticAcceptance(direct, {})).toBe(false);
    const reopened = { reopenedAtContextRevision: 0 };
    expect(assignmentAllowsAutomaticAcceptance(direct, reopened)).toBe(true);
    expect(assignmentAllowsAutomaticAcceptance({ assignmentMethod: "FIRST_ACCEPT_WINS" }, {})).toBe(true);
    expect(assignmentAllowsAutomaticAcceptance({ source: "OFFER", replacementOfferId: "r", sourceOfferId: "r" }, reopened)).toBe(true);
    expect(assignmentAllowsAutomaticAcceptance({ source: "OFFER", replacementOfferId: "other", sourceOfferId: "r" }, reopened)).toBe(false);
    expect(assignmentAllowsAutomaticAcceptance({ source: "unknown" }, reopened)).toBe(false);
  });
});

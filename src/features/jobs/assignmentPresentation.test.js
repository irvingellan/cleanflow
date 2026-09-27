import { describe, expect, it } from "vitest";
import {
  assignedCleanerSummary,
  getAssignmentAcknowledgmentState,
} from "./assignmentPresentation.js";

const translate = (key, values = {}) =>
  `${key}:${values.count ?? ""}`;
const fallback = "Not assigned";

describe("assignedCleanerSummary", () => {
  it("uses the fallback for a v2 Job without assigned cleaners", () => {
    expect(
      assignedCleanerSummary(
        { schemaVersion: 2, assignedCleanerIds: [] },
        {},
        translate,
        fallback,
      ),
    ).toBe(fallback);
  });

  it("prefers the current cleaner display name for a v2 Job", () => {
    expect(
      assignedCleanerSummary(
        { schemaVersion: 2, assignedCleanerIds: ["cleaner-1"] },
        { "cleaner-1": "Current Cleaner" },
        translate,
        fallback,
      ),
    ).toBe("Current Cleaner");
  });

  it("summarizes multiple assigned cleaners for a v2 Job", () => {
    expect(
      assignedCleanerSummary(
        {
          schemaVersion: 2,
          assignedCleanerIds: ["cleaner-1", "cleaner-2", "cleaner-1"],
        },
        {},
        translate,
        fallback,
      ),
    ).toBe("jobs.cleanersAssignedMany:2");
  });

  it("keeps the count fallback when v2 cleaner names are unavailable", () => {
    expect(
      assignedCleanerSummary(
        { schemaVersion: 2, assignedCleanerIds: ["cleaner-1"] },
        {},
        translate,
        fallback,
      ),
    ).toBe("jobs.cleanerAssignedOne:1");
  });

  it("keeps the legacy cleaner-name fallback behavior", () => {
    expect(
      assignedCleanerSummary(
        {
          assignedCleanerId: "cleaner-1",
          assignedCleanerName: "Legacy Cleaner",
        },
        { "cleaner-1": "Current Cleaner" },
        translate,
        fallback,
      ),
    ).toBe("Current Cleaner");
  });
});

describe("assignment acknowledgment presentation", () => {
  it("shows awaiting and confirmed only for an acknowledgment tied to its source Offer", () => {
    const offers = [{ id: "offer-a", cleanerId: "cleaner-a", status: "INTERESTED" }];
    expect(getAssignmentAcknowledgmentState({
      sourceOfferId: "offer-a",
      cleanerId: "cleaner-a",
      isActive: true,
    }, offers))
      .toBe("AWAITING_CONFIRMATION");
    expect(getAssignmentAcknowledgmentState({
      isActive: true,
      cleanerId: "cleaner-a",
      sourceOfferId: "offer-a",
      cleanerAcknowledgedOfferId: "offer-a",
      cleanerAcknowledgedAt: { seconds: 10 },
    }, offers)).toBe("CONFIRMED");
    expect(getAssignmentAcknowledgmentState({
      isActive: true,
      cleanerId: "cleaner-a",
      sourceOfferId: "offer-b",
      cleanerAcknowledgedOfferId: "offer-a",
      cleanerAcknowledgedAt: { seconds: 10 },
    }, offers)).toBeNull();
    expect(getAssignmentAcknowledgmentState({ sourceOfferId: "offer-a", cleanerId: "cleaner-b", isActive: true }, offers)).toBeNull();
    expect(getAssignmentAcknowledgmentState({ sourceOfferId: "offer-a", cleanerId: "cleaner-a", isActive: false }, offers)).toBeNull();
    expect(getAssignmentAcknowledgmentState({})).toBeNull();
  });
});

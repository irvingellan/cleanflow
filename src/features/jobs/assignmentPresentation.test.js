import { describe, expect, it } from "vitest";
import { assignedCleanerSummary } from "./assignmentPresentation.js";

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

  it("summarizes one assigned cleaner for a v2 Job", () => {
    expect(
      assignedCleanerSummary(
        { schemaVersion: 2, assignedCleanerIds: ["cleaner-1"] },
        {},
        translate,
        fallback,
      ),
    ).toBe("jobs.cleanerAssignedOne:1");
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

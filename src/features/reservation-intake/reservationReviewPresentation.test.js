import { describe, expect, it } from "vitest";
import { intakeDate, matchesIntakeTriage } from "./reservationReviewPresentation.js";
import { acceptanceMessages } from "./reservationAcceptanceMessages.js";
describe("operator presentation", () => {
  it.each(["en", "pt", "es"])("%s keeps calendar dates without invented time and marks instants UTC", language => {
    expect(intakeDate("2026-10-12", language)).not.toContain("UTC");
    expect(intakeDate("2026-10-12T00:00:00Z", language)).toContain("UTC");
    expect(intakeDate("invalid", language)).toBe("—");
    expect(Object.keys(acceptanceMessages[language]).sort()).toEqual(Object.keys(acceptanceMessages.en).sort());
  });
  it("unread observations do not fabricate promoted/ignored decisions", () => {
    const row = { changeType: "NEW" };
    expect(matchesIntakeTriage(row, null, "PROMOTED")).toBe(false);
    expect(matchesIntakeTriage(row, { state: "PROMOTED" }, "NEW")).toBe(false);
    expect(matchesIntakeTriage(row, { state: "PROMOTED" }, "PROMOTED")).toBe(true);
    expect(matchesIntakeTriage(row, { state: "IGNORED" }, "IGNORED")).toBe(true);
    expect(matchesIntakeTriage(row, null, "PROPERTY_REQUIRED")).toBe(true);
    expect(matchesIntakeTriage(row, { propertyId: "house" }, "PROPERTY_REQUIRED")).toBe(false);
    expect(matchesIntakeTriage({ changeType: "SOURCE_DISAPPEARED" }, null, "POSSIBLE_CANCELLED")).toBe(true);
    expect(matchesIntakeTriage(row, { discrepancy: { reviewRequired: true } }, "NEEDS_REVIEW")).toBe(true);
  });
});

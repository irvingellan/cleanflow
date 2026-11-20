import { describe, expect, it } from "vitest";
import { isEligibleForLegacyPayout } from "./payoutService.js";

describe("legacy payout eligibility", () => {
  it("keeps compatible singular Jobs eligible while excluding v2 team Jobs", () => {
    const legacyJob = {
      operationalStatus: "COMPLETED",
      assignedCleanerId: "cleaner-1",
      cleanerPayout: 100,
    };

    expect(isEligibleForLegacyPayout(legacyJob)).toBe(true);
    expect(isEligibleForLegacyPayout({ ...legacyJob, schemaVersion: 2 })).toBe(false);
  });
});

it.each([
  { pay: { mode: "HOURLY", rateCents: 2000 } },
  { billing: { mode: "HOURLY", hourlyRateCents: 3000, hours: { approved: false, approvedMinutes: 60 } } },
])("refuses to pay an hourly job awaiting hours even with stale fixed dollars", (pricing) => {
  expect(isEligibleForLegacyPayout({ operationalStatus: "COMPLETED",
    assignedCleanerId: "cleaner-1", cleanerPayout: 100, ...pricing })).toBe(false);
});

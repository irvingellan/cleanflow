import { describe, expect, it } from "vitest";
import { payoutNeedsHoursReview, payoutShares, unpaidPayoutShares } from "./payoutShares.js";

const team = {
  id: "synthetic-job", schemaVersion: 2, operationalStatus: "COMPLETED",
  assignedCleanerIds: ["a", "b", "c"], pay: { mode: "HOURLY", rateCents: 2875 }, cleanerPayout: 165,
  billing: { mode: "HOURLY", hourlyRateCents: 3750 },
  payoutApprovedWorkByCleaner: { a: { minutes: 120, payoutCents: 5750 }, c: { minutes: 0, payoutCents: 0 } },
};

describe("approved pay", () => {
  it("uses only the approved individual amount and leaves unreported hours visible", () => {
    expect(payoutNeedsHoursReview(team)).toBe(true);
    expect(payoutShares(team)).toEqual([{ cleanerId: "a", cents: 5750 },
      { cleanerId: "b", cents: null }, { cleanerId: "c", cents: 0 }]);
    expect(unpaidPayoutShares(team)).toEqual([{ cleanerId: "a", cents: 5750 }]);
  });
  it("does not offer a payment for a linked receipt or a rounded zero", () => {
    expect(unpaidPayoutShares({ ...team, payoutIdsByCleaner: { a: "receipt-a" } })).toEqual([]);
  });
});

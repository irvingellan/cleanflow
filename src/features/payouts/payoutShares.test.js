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
  it("keeps the approved amount of a paid cleaner after the Job switches to fixed pay", () => {
    const job = { ...team, pay: { mode: "FIXED", perCleanerCents: 4300 }, payoutIdsByCleaner: { a: "receipt-a" },
      billing: { mode: "FIXED" } };
    expect(payoutShares(job)).toEqual([{ cleanerId: "a", cents: 5750 },
      { cleanerId: "b", cents: 4300 }, { cleanerId: "c", cents: 4300 }]);
  });

  it("does not offer a payment for a linked receipt or a rounded zero", () => {
    expect(unpaidPayoutShares({ ...team, payoutIdsByCleaner: { a: "receipt-a" } })).toEqual([]);
  });
});

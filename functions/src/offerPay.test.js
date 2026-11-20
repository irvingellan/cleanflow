import { describe, expect, it } from "vitest";
import { canSuggestDefaultCleanerPrice, hourlyOfferSnapshot, newOfferPay, offerPayForRecipient } from "./offerPay.js";

describe("offer pricing snapshots", () => {
  it("keeps fixed offers on the legacy path; invalid hourly rates cannot become a fixed amount", () => {
    expect(hourlyOfferSnapshot()).toBeNull();
    expect(hourlyOfferSnapshot({ mode: "FIXED" })).toBeNull();
    for (const rateCents of [null, -1, 0.5, "3200", Infinity]) {
      expect(hourlyOfferSnapshot({ mode: "HOURLY", rateCents })).toEqual({ offeredCompensation: null });
    }
    expect(hourlyOfferSnapshot({ mode: "HOURLY", rateCents: 0, internal: true }))
      .toEqual({ offeredPay: { mode: "HOURLY", rateCents: 0 } });
  });
  it("retains a legacy property default, but does not invent a missing rate on a configured property", () => {
    const other = { serviceType: "DEEP_CLEANING" };
    expect(canSuggestDefaultCleanerPrice(other, { defaultCleanerPrice: 10 })).toBe(true);
    expect(canSuggestDefaultCleanerPrice(other, { serviceRates: {} })).toBe(false);
    expect(canSuggestDefaultCleanerPrice({}, { serviceRates: { DEEP_CLEANING: {} } })).toBe(true);
    expect(canSuggestDefaultCleanerPrice({}, { serviceRates: { STANDARD: { client: {} } } })).toBe(false);
  });
});

describe("fixed recipient terms", () => {
  const job = { schemaVersion: 2, requiredCleanerCount: 3, cleanerPayout: 100 };
  it("freezes one recipient's terms regardless of how many were invited or who accepts", () => {
    const quote = newOfferPay(job);
    expect(quote).toEqual({ offeredCompensation: 33.33, offeredFirstSlotExtraCents: 1, fixedHousePay: { totalCents: 10000, teamSize: 3 } });
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect(offerPayForRecipient(quote, job, id)).toEqual({ offeredCompensation: 33.33, offeredFirstSlotExtraCents: 1, offeredPayEstimated: true });
    }
    const assigned = { ...job, cleanerPayout: 999, assignedCleanerIds: ["d", "b", "e"] };
    const shares = ["d", "b", "e"].map(id => offerPayForRecipient(quote, assigned, id));
    expect(shares).toEqual([{ offeredCompensation: 33.34 }, { offeredCompensation: 33.33 }, { offeredCompensation: 33.33 }]);
    expect(offerPayForRecipient(quote, assigned, "a")).toEqual({ offeredCompensation: 33.33 });
    expect(offerPayForRecipient(quote, null, "a")).toEqual({ offeredCompensation: 33.33 });
    expect(offerPayForRecipient({ offeredCompensation: 100 }, assigned, "d")).toEqual({ offeredCompensation: 100 });
  });
  it("settles only agreed house totals on the final roster, including underfilled, overfilled and reordered crews", () => {
    const quote = newOfferPay({ ...job, cleanerPayout: 120 });
    const incomplete = { ...job, assignedCleanerIds: ["b", "a"], cleanerPayout: 800, operationalStatus: "ASSIGNED" };
    expect(offerPayForRecipient(quote, incomplete, "a")).toEqual({ offeredCompensation: 40, offeredPayEstimated: true });
    const done = { ...incomplete, operationalStatus: "COMPLETED" };
    expect(offerPayForRecipient(quote, done, "a")).toEqual({ offeredCompensation: 60 });
    expect(offerPayForRecipient({ offeredCompensation: 77 }, done, "a")).toEqual({ offeredCompensation: 77 });
    expect(offerPayForRecipient({ offeredCompensation: null }, done, "a")).toEqual({ offeredCompensation: null });
    const another = newOfferPay(job);
    const reordered = { ...done, assignedCleanerIds: ["a", "b", "c"] };
    expect(offerPayForRecipient(another, reordered, "a")).toEqual({ offeredCompensation: 33.34 });
    expect(offerPayForRecipient(another, reordered, "b")).toEqual({ offeredCompensation: 33.33 });
    expect(offerPayForRecipient(another, { ...done, assignedCleanerIds: ["a", "b", "c", "d"] }, "d"))
      .toEqual({ offeredCompensation: 25 });
  });
  it("handles zero, all remainder cents, frozen overrides, hourly rates and the legacy Property default", () => {
    expect(newOfferPay({ ...job, cleanerPayout: 0.02 })).toEqual({ offeredCompensation: 0, offeredFirstSlotExtraCents: 2, fixedHousePay: { totalCents: 2, teamSize: 3 } });
    expect(newOfferPay({ ...job, pay: { mode: "FIXED", perCleanerCents: 4200 } })).toEqual({ offeredCompensation: 42 });
    expect(newOfferPay({ ...job, pay: { mode: "HOURLY", rateCents: 2899 } })).toEqual({ offeredPay: { mode: "HOURLY", rateCents: 2899 } });
    expect(newOfferPay({ ...job, cleanerPayout: null }, { defaultCleanerPrice: 60 })).toEqual({ offeredCompensation: 20, fixedHousePay: { totalCents: 6000, teamSize: 3 } });
    expect(newOfferPay({ ...job, cleanerPayout: null, organizationId: "a" }, { defaultCleanerPrice: 60, organizationId: "b" }))
      .toEqual({ offeredCompensation: null });
    expect(offerPayForRecipient({}, { assignedCleanerId: "a", requiredCleanerCount: 3, cleanerPayout: 2 }, "a")).toEqual({ offeredCompensation: 0.68, offeredPayEstimated: true });
    expect(offerPayForRecipient({ offeredCompensation: null }, job, "d")).toEqual({ offeredCompensation: null });
  });
});

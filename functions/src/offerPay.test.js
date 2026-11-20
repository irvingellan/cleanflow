import { describe, expect, it } from "vitest";
import { canSuggestDefaultCleanerPrice, hourlyOfferSnapshot } from "./offerPay.js";

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

import { describe, expect, it } from "vitest";
import { fixedCleanerShares as serverShares, resolveJobPricing as serverPricing } from "../../../functions/src/pricingModel.js";
import { fixedCleanerShares, resolveJobPricing } from "./pricingModel.js";
import { formatPricingRate } from "./pricingMessages.js";

const property = {
  defaultClientPrice: 250, defaultCleanerPrice: 125,
  serviceRates: {
    DEEP_CLEANING: {
      client: { mode: "HOURLY", amountCents: 4400 },
      cleaner: { mode: "FIXED", amountCents: 12500, byCleanerCount: { 1: 12800, 2: 7200 } },
    },
    POST_CONSTRUCTION: { cleaner: { mode: "HOURLY", amountCents: 3800, byCleanerCount: { 2: 3400 } } },
  },
};
const fixed = (amountCents) => ({ mode: "FIXED", amountCents, state: "ready", reason: null });
const hourly = (rateCents) => ({ mode: "HOURLY", rateCents, state: "ready", reason: null });

describe.each([["manager", resolveJobPricing, fixedCleanerShares], ["Functions", serverPricing, serverShares]])("%s pricing contract", (_, resolve, shares) => {
  it("reads legacy Job dollars and never updates missing or paid snapshots from the Property", () => {
    const paid = { id: "job-1", payoutId: "paid-1", clientPrice: 180, cleanerPayout: 19.99 };
    expect(resolve(paid, { property, cleanerCount: 2 })).toEqual({ client: fixed(18000), cleaner: fixed(1999) });
    expect(resolve({ id: "job-2" }, { property }).client).toEqual({
      mode: "FIXED", amountCents: null, state: "needs_review", reason: "missing_rate",
    });
    expect(resolve({ billing: { additionalFees: [] }, clientPrice: 0 }).client).toEqual(fixed(0));
    expect(resolve({ cleanerPayout: 125 }, { property }).client.reason).toBe("missing_rate");
  });

  it("resolves standard defaults only if the entire service entry is absent", () => {
    expect(resolve({}, { property })).toEqual({ client: fixed(25000), cleaner: fixed(12500) });
    const partial = { ...property, serviceRates: { STANDARD: { cleaner: { mode: "FIXED", amountCents: 0 } } } };
    expect(resolve({}, { property: partial })).toEqual({
      client: { mode: "FIXED", amountCents: null, state: "needs_review", reason: "missing_rate" }, cleaner: fixed(0),
    });
    expect(resolve({ serviceType: "AIRBNB_TOUCH_UP" }, { property }).client.reason).toBe("missing_rate");
  });

  it("resolves fixed and hourly per-person rates for the selected team size", () => {
    const deep = { serviceType: "DEEP_CLEANING" };
    expect(resolve(deep, { property })).toEqual({ client: hourly(4400), cleaner: { ...fixed(12800), perCleaner: true } });
    expect(resolve({ ...deep, requiredCleanerCount: 2 }, { property }).cleaner).toEqual({ ...fixed(7200), perCleaner: true });
    expect(resolve(deep, { property, cleanerCount: 3 }).cleaner).toEqual(fixed(12500));
    expect(resolve({ serviceType: "POST_CONSTRUCTION" }, { property, cleanerCount: 2 }).cleaner).toEqual(hourly(3400));
  });

  it.each([
    [20_000, 2, 10_000, 10_000], [10_000, 3, 3334, 3333], [10_001, 3, 3335, 3333],
    [4, 6, 4, 0], [0, 3, 0, 0], [1234, 1, 1234, 1234],
  ])("distributes %i house cents across %i slots without losing cents", (total, size, first, other) => {
    const sources = [
      resolve({ clientPrice: 340, cleanerPayout: total / 100 }),
      resolve({}, { property: { defaultClientPrice: 340, defaultCleanerPrice: total / 100 }, cleanerCount: size }),
      resolve({}, { property: { serviceRates: { STANDARD: {
        client: { mode: "FIXED", amountCents: 34000 }, cleaner: { mode: "FIXED", amountCents: total },
      } } }, cleanerCount: size }),
    ];
    for (const pricing of sources) {
      expect(pricing.client).toEqual(fixed(34000));
      expect(pricing.cleaner).toEqual(fixed(total));
      const allocation = shares(pricing, size);
      expect(allocation).toEqual({ totalCents: total, firstCents: first, otherCents: other });
      expect(allocation.firstCents + allocation.otherCents * (size - 1)).toBe(total);
    }
  });

  it("preserves fixed team overrides, including a known zero and an aggregate above the individual rate limit", () => {
    for (const cents of [0, 7200, 10_000_000]) {
      const row = { mode: "FIXED", amountCents: 14000, byCleanerCount: { 3: cents } };
      const selected = resolve({}, { property: { serviceRates: { STANDARD: { cleaner: row } } }, cleanerCount: 3 });
      const stored = resolve({ pay: { mode: "FIXED", perCleanerCents: cents }, cleanerPayout: 99 }, { property, cleanerCount: 3 });
      expect(stored.cleaner).toEqual({ ...fixed(cents), perCleaner: true });
      for (const pricing of [selected, stored]) {
        expect(shares(pricing, 3)).toEqual({ totalCents: cents * 3, firstCents: cents, otherCents: cents });
      }
    }
    expect(resolve({ pay: { mode: "FIXED" }, cleanerPayout: 99 }).cleaner).toEqual(fixed(9900));
    expect(shares(resolve({ pay: { mode: "FIXED", perCleanerCents: -1 }, cleanerPayout: 99 }), 3)).toBeNull();
  });

  it("never splits hourly pay, client prices, invalid rates or unsupported team sizes", () => {
    const hourlyPricing = resolve({ serviceType: "POST_CONSTRUCTION" }, { property, cleanerCount: 2 });
    expect(hourlyPricing.cleaner).toEqual(hourly(3400));
    expect(shares(hourlyPricing, 2)).toBeNull();
    expect(shares(resolve({ clientPrice: 100 }), 2)).toBeNull();
    expect(shares(resolve({ cleanerPayout: 1.001 }), 2)).toBeNull();
    for (const size of [undefined, null, 0, -1, 1.5, 11, "2"]) {
      expect(shares(resolve({ cleanerPayout: 50 }), size)).toBeNull();
    }
  });

  it("uses explicit snapshots ahead of edited Property rates or stale fixed dollars", () => {
    const job = { id: "j", serviceType: "DEEP_CLEANING", clientPrice: 180, cleanerPayout: 125,
      billing: { mode: "HOURLY", hourlyRateCents: 3000 }, pay: { mode: "HOURLY", rateCents: 2250 } };
    expect(resolve(job, { property, cleanerCount: 2 })).toEqual({ client: hourly(3000), cleaner: hourly(2250) });
    expect(resolve({ ...job, pay: { mode: "HOURLY" } }).cleaner).toEqual({
      mode: "HOURLY", rateCents: null, state: "needs_review", reason: "missing_rate",
    });
  });

  it.each([null, "", undefined])("preserves missing legacy prices (%s)", (clientPrice) => {
    expect(resolve({ clientPrice }).client.reason).toBe("missing_rate");
  });
  it.each([-1, NaN, Infinity, "4.50", 1.005, 100000.01])("rejects invalid legacy prices (%s)", (clientPrice) => {
    expect(resolve({ clientPrice }).client).toMatchObject({ reason: "invalid_rate", amountCents: null });
  });
  it.each([0, 0.01, 0.29, 19.99, 100000])("handles valid dollar-to-cent boundaries (%s)", (clientPrice) => {
    expect(resolve({ clientPrice }).client).toEqual(fixed(Math.round(clientPrice * 100)));
  });
  it.each([-1, NaN, Infinity, "499", 3.5, 10000001])("rejects invalid cents (%s)", (rateCents) => {
    expect(resolve({ pay: { mode: "HOURLY", rateCents } }).cleaner).toMatchObject({ rateCents: null, reason: "invalid_rate" });
  });
  it("refuses an unknown mode or invalid team override", () => {
    const invalid = { serviceRates: { STANDARD: { cleaner: { mode: "FIXED", amountCents: 2500, byCleanerCount: { 1: -1 } } } } };
    expect(resolve({}, { property: invalid }).cleaner.reason).toBe("invalid_rate");
    expect(resolve({ pay: { mode: "UNKNOWN" }, cleanerPayout: 0 }).cleaner.reason).toBe("invalid_rate");
  });
});

it("formats each supported language, keeping a known zero distinct from a missing rate", () => {
  for (const [language, suffix] of [["en", "per hour"], ["pt", "por hora"], ["es", "por hora"]]) {
    expect(formatPricingRate(hourly(4500), language)).toContain(suffix);
    expect(formatPricingRate(fixed(0), language)).toContain("0");
    expect(formatPricingRate(resolveJobPricing({}).cleaner, language)).not.toMatch(/\d/);
  }
});

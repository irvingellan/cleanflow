import { describe, expect, it } from "vitest";
import { resolveJobPricing as serverPricing } from "../../../functions/src/pricingModel.js";
import { resolveJobPricing } from "./pricingModel.js";
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

describe.each([["manager", resolveJobPricing], ["Functions", serverPricing]])("%s pricing contract", (_, resolve) => {
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
    expect(resolve(deep, { property })).toEqual({ client: hourly(4400), cleaner: fixed(12800) });
    expect(resolve({ ...deep, requiredCleanerCount: 2 }, { property }).cleaner).toEqual(fixed(7200));
    expect(resolve(deep, { property, cleanerCount: 3 }).cleaner).toEqual(fixed(12500));
    expect(resolve({ serviceType: "POST_CONSTRUCTION" }, { property, cleanerCount: 2 }).cleaner).toEqual(hourly(3400));
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

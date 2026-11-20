import { describe, expect, it } from "vitest";
import { cleanerHistoryPay, getJobGrossMargin } from "./jobCompatibility.js";
import { resolveJobPricing } from "../pricing/pricingModel.js";
import { jobPriceFormValues, jobPriceSnapshot, readJobPriceForm } from "./jobPricingForm.js";

describe("job price fields", () => {
  const fixed = { clientMode: "FIXED", cleanerMode: "FIXED", clientPrice: "0", cleanerPayout: "" };
  it("distinguishes explicit zero, cents, and an empty field", () => {
    expect(readJobPriceForm(fixed)).toEqual({ clientPrice: 0, cleanerPayout: undefined });
    expect(readJobPriceForm({ ...fixed, clientPrice: " ", cleanerMode: "HOURLY", cleanerPayout: "0.29" }))
      .toEqual({ clientPrice: undefined, cleanerPayout: undefined, pay: { mode: "HOURLY", rateCents: 29 } });
    expect(jobPriceFormValues(resolveJobPricing({ clientPrice: 0, pay: { mode: "HOURLY", rateCents: 29 } })))
      .toEqual({ clientMode: "FIXED", clientPrice: "0", cleanerMode: "HOURLY", cleanerPayout: "0.29", fixedPerCleaner: false });
  });

  it("keeps a fixed team-size override per cleaner across a property default, form edit and Job write", () => {
    const property = { serviceRates: { STANDARD: { cleaner: { mode: "FIXED", amountCents: 6001, byCleanerCount: { 3: 1729 } } } } };
    const values = jobPriceFormValues(resolveJobPricing({}, { property, cleanerCount: 3 }));
    expect(values).toMatchObject({ fixedPerCleaner: true, cleanerPayout: "17.29" });
    const entered = readJobPriceForm({ ...values, cleanerPayout: "18.47" });
    const snapshot = jobPriceSnapshot(entered);
    expect(snapshot).toEqual({ pay: { mode: "FIXED", perCleanerCents: 1847 } });
    expect(jobPriceFormValues(resolveJobPricing(snapshot))).toMatchObject({ fixedPerCleaner: true, cleanerPayout: "18.47" });
  });

  it("shows the individual history share and computes the manager margin against the entire team", () => {
    const job = { schemaVersion: 2, operationalStatus: "COMPLETED", assignedCleanerIds: ["first", "other", "third"],
      clientPrice: 125, cleanerPayout: 100 };
    expect(cleanerHistoryPay(job, "first")).toBe(33.34);
    expect(cleanerHistoryPay(job, "other")).toBe(33.33);
    expect(cleanerHistoryPay(job, "absent")).toBeNull();
    expect(getJobGrossMargin({ ...job, pay: { mode: "FIXED", perCleanerCents: 1250 } })).toBe(87.5);
  });

  it.each([{ cleanerMode: "missing" }, { cleanerMode: "HOURLY" }, { clientPrice: "1.001" },
    { cleanerPayout: -1 }, { cleanerPayout: "100000.01" }, { clientPrice: false }])(
    "rejects an incomplete or invalid price field", (change) => {
      expect(readJobPriceForm({ ...fixed, ...change })).toBeNull();
    },
  );
});

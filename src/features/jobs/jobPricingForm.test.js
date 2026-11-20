import { describe, expect, it } from "vitest";
import { resolveJobPricing } from "../pricing/pricingModel.js";
import { jobPriceFormValues, readJobPriceForm } from "./jobPricingForm.js";

describe("job price fields", () => {
  const fixed = { clientMode: "FIXED", cleanerMode: "FIXED", clientPrice: "0", cleanerPayout: "" };
  it("distinguishes explicit zero, cents, and an empty field", () => {
    expect(readJobPriceForm(fixed)).toEqual({ clientPrice: 0, cleanerPayout: undefined });
    expect(readJobPriceForm({ ...fixed, clientPrice: " ", cleanerMode: "HOURLY", cleanerPayout: "0.29" }))
      .toEqual({ clientPrice: undefined, cleanerPayout: undefined, pay: { mode: "HOURLY", rateCents: 29 } });
    expect(jobPriceFormValues(resolveJobPricing({ clientPrice: 0, pay: { mode: "HOURLY", rateCents: 29 } })))
      .toEqual({ clientMode: "FIXED", clientPrice: "0", cleanerMode: "HOURLY", cleanerPayout: "0.29" });
  });

  it.each([{ cleanerMode: "missing" }, { cleanerMode: "HOURLY" }, { clientPrice: "1.001" },
    { cleanerPayout: -1 }, { cleanerPayout: "100000.01" }, { clientPrice: false }])(
    "rejects an incomplete or invalid price field", (change) => {
      expect(readJobPriceForm({ ...fixed, ...change })).toBeNull();
    },
  );
});

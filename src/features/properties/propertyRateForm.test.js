import { describe, expect, it } from "vitest";
import { parseRateRow, propertyRateChanges, rateRowDraft } from "./propertyRateForm.js";

describe("Property service rate fields", () => {
  it("round-trips partial rows, zero and team overrides", () => {
    const row = { cleaner: { mode: "HOURLY", amountCents: 0, byCleanerCount: { 2: 2729 } } };
    expect(parseRateRow(rateRowDraft(row))).toEqual({ row });
    const draft = rateRowDraft();
    draft.client.amount = "22,10";
    expect(parseRateRow(draft)).toEqual({ row: { client: { mode: "FIXED", amountCents: 2210 } } });
  });

  it("omits untouched fields and removes a cleared service without changing other types", () => {
    const existing = { DEEP_CLEANING: { cleaner: { mode: "FIXED", amountCents: 2900 } }, STANDARD: {} };
    expect(propertyRateChanges({}, existing)).toEqual({ fields: {} });
    expect(propertyRateChanges({ STANDARD: rateRowDraft() }, existing)).toEqual({
      fields: { serviceRates: { DEEP_CLEANING: existing.DEEP_CLEANING }, changedRateTypes: ["STANDARD"] },
    });
  });

  it.each(["4.125", "-1", "10e3", "100000.01", "x"])("rejects invalid input (%s)", (amount) => {
    const draft = rateRowDraft();
    draft.cleaner.amount = amount;
    expect(propertyRateChanges({ DEEP_CLEANING: draft })).toEqual({ error: "invalid", type: "DEEP_CLEANING" });
  });
  it("rejects invalid modes, team sizes and overrides without a base", () => {
    const draft = rateRowDraft();
    draft.cleaner.byCleanerCount["2"] = "25";
    expect(parseRateRow(draft).error).toBe("baseRequired");
    draft.cleaner.amount = "25";
    draft.cleaner.byCleanerCount["11"] = "30";
    expect(parseRateRow(draft).error).toBe("invalid");
    draft.cleaner.mode = "bad";
    expect(parseRateRow(draft).error).toBe("invalid");
  });
});

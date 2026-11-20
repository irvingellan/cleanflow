import { PRICING_FIXED, PRICING_HOURLY, centsFromDollars } from "../billing/billingStatementModel.js";
import { maxCleanersPerJob } from "../jobs/offerSlots.js";

const dollars = (cents) => Number.isSafeInteger(cents) ? String(cents / 100) : "";

export function rateRowDraft(row) {
  return {
    client: { mode: row?.client?.mode ?? PRICING_FIXED, amount: dollars(row?.client?.amountCents) },
    cleaner: {
      mode: row?.cleaner?.mode ?? PRICING_FIXED, amount: dollars(row?.cleaner?.amountCents),
      byCleanerCount: Object.fromEntries(Object.entries(row?.cleaner?.byCleanerCount ?? {}).map(
        ([size, cents]) => [size, dollars(cents)],
      )),
    },
  };
}

function parseAmount(input) {
  const value = input.trim();
  if (!value) return undefined;
  if (!/^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/.test(value)) return null;
  return centsFromDollars(Number(value.replace(",", ".")));
}

export function parseRateRow(draft) {
  const row = {};
  for (const side of ["client", "cleaner"]) {
    const { amount, mode } = draft[side];
    const amountCents = parseAmount(amount);
    if (amountCents === null || ![PRICING_FIXED, PRICING_HOURLY].includes(mode)) return { error: "invalid" };
    if (amountCents !== undefined) row[side] = { mode, amountCents };
  }
  const byCleanerCount = {};
  for (const [count, amount] of Object.entries(draft.cleaner.byCleanerCount)) {
    const cents = parseAmount(amount);
    if (cents === undefined) continue;
    if (cents === null || !/^[1-9]\d*$/.test(count) || Number(count) > maxCleanersPerJob) return { error: "invalid" };
    if (!row.cleaner) return { error: "baseRequired" };
    byCleanerCount[count] = cents;
  }
  if (Object.keys(byCleanerCount).length) row.cleaner.byCleanerCount = byCleanerCount;
  return { row };
}

export function propertyRateChanges(drafts, original = {}) {
  const changedRateTypes = Object.keys(drafts);
  if (!changedRateTypes.length) return { fields: {} };
  const serviceRates = { ...original };
  for (const type of changedRateTypes) {
    const { row, error } = parseRateRow(drafts[type]);
    if (error) return { error, type };
    if (Object.keys(row).length) serviceRates[type] = row;
    else delete serviceRates[type];
  }
  return { fields: { serviceRates, changedRateTypes } };
}

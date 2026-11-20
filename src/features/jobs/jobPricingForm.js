import { centsFromDollars, PRICING_FIXED, PRICING_HOURLY } from "../billing/billingStatementModel.js";
import { resolveJobPricing } from "../pricing/pricingModel.js";

function inputAmount(rate, fixedAmount, storedMode, hourlyCents) {
  if (rate.state === "ready") return String((rate.rateCents ?? rate.amountCents) / 100);
  // Keep an invalid stored number in view so editing the other side cannot erase it.
  if (storedMode != null && storedMode !== rate.mode) return "";
  const rawAmount = rate.mode === PRICING_HOURLY ? hourlyCents : fixedAmount;
  if (rate.reason === "invalid_rate" && Number.isFinite(rawAmount)) {
    return String(rate.mode === PRICING_HOURLY ? rawAmount / 100 : rawAmount);
  }
  return "";
}

export function jobPriceFormValues({ client, cleaner }, job = {}) {
  return {
    clientMode: client.mode,
    clientPrice: inputAmount(client, job.clientPrice, job.billing?.mode, job.billing?.hourlyRateCents),
    cleanerMode: cleaner.mode,
    cleanerPayout: inputAmount(cleaner, job.cleanerPayout, job.pay?.mode, job.pay?.rateCents),
  };
}

function inputCents(value) {
  if (value == null || typeof value === "string" && !value.trim()) return undefined;
  if (typeof value !== "string" && typeof value !== "number") return null;
  return centsFromDollars(Number(value));
}

// Blank fixed amounts are optional snapshots. An hourly selection requires an explicit rate.
export function readJobPriceForm({ clientMode, clientPrice, cleanerMode, cleanerPayout }) {
  const hourlyClient = clientMode === PRICING_HOURLY;
  const hourlyCleaner = cleanerMode === PRICING_HOURLY;
  if ((!hourlyClient && clientMode !== PRICING_FIXED) || (!hourlyCleaner && cleanerMode !== PRICING_FIXED)) return null;
  const clientCents = inputCents(clientPrice);
  const cleanerCents = inputCents(cleanerPayout);
  if (clientCents === null || cleanerCents === null ||
      (hourlyClient && clientCents === undefined) || (hourlyCleaner && cleanerCents === undefined)) return null;
  return {
    clientPrice: hourlyClient || clientCents === undefined ? undefined : clientCents / 100,
    cleanerPayout: hourlyCleaner || cleanerCents === undefined ? undefined : cleanerCents / 100,
    ...(hourlyClient ? { billing: { mode: PRICING_HOURLY, hourlyRateCents: clientCents } } : {}),
    ...(hourlyCleaner ? { pay: { mode: PRICING_HOURLY, rateCents: cleanerCents } } : {}),
  };
}

export function jobPricesLocked(job) {
  return Boolean(job?.payoutId || job?.payoutPaidAt || job?.billing?.hours?.approved === true);
}

// Validate a manager's pricing write independently of the form. Only copy rate fields;
// approved hours, fees and other billing metadata are owned by their respective flows.
export function jobPriceSnapshot({ clientPrice, cleanerPayout, billing, pay }) {
  const { client, cleaner } = resolveJobPricing({ clientPrice, cleanerPayout, billing, pay });
  if ((billing != null || clientPrice != null && clientPrice !== "") && client.state !== "ready" ||
      (pay != null || cleanerPayout != null && cleanerPayout !== "") && cleaner.state !== "ready") {
    throw new Error("Invalid Job price.");
  }
  return snapshotFromResolvedPricing({ client, cleaner });
}

export function snapshotFromResolvedPricing({ client, cleaner }) {
  return {
    ...(client.amountCents != null ? { clientPrice: client.amountCents / 100 } : {}),
    ...(cleaner.amountCents != null ? { cleanerPayout: cleaner.amountCents / 100 } : {}),
    ...(client.rateCents != null ? { billing: { mode: client.mode, hourlyRateCents: client.rateCents } } : {}),
    ...(cleaner.rateCents != null ? { pay: { mode: cleaner.mode, rateCents: cleaner.rateCents } } : {}),
  };
}

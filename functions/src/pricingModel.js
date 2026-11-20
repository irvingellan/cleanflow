import { defaultServiceType } from "./serviceTypes.js";
import { requiredCleanerCount } from "./offerSlots.js";

// Functions are packaged independently from the browser billing model. The
// browser supplies its existing converter; parity tests cover both entry points.
function centsFromDollars(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  return Math.abs(value * 100 - cents) <= 1e-6 && cents <= 10_000_000 ? cents : null;
}

function rate(mode, value, inDollars, convert) {
  const hourly = mode === "HOURLY";
  let cents = null;
  if (mode === "FIXED" || hourly) {
    if (inDollars) cents = convert(value);
    else if (Number.isSafeInteger(value) && convert(value / 100) === value) cents = value;
  }
  const missing = (value == null || value === "") && (mode === "FIXED" || hourly);
  return {
    mode: hourly ? "HOURLY" : "FIXED",
    [hourly ? "rateCents" : "amountCents"]: cents,
    state: cents === null ? "needs_review" : "ready",
    reason: cents !== null ? null : missing ? "missing_rate" : "invalid_rate",
  };
}

function resolveSide({ job, property, cleanerCount, convert, side }) {
  const isClient = side === "client";
  const snapshot = isClient ? job.billing : job.pay;
  const fixedField = isClient ? "clientPrice" : "cleanerPayout";
  if (snapshot?.mode != null && snapshot.mode !== "FIXED") {
    return rate(snapshot.mode, isClient ? snapshot.hourlyRateCents : snapshot.rateCents, false, convert);
  }
  // An existing Job always owns its snapshot, even when the amount is missing.
  if (!property) {
    return rate("FIXED", job[fixedField], true, convert);
  }

  const serviceType = job.serviceType || defaultServiceType;
  if (Object.hasOwn(property.serviceRates ?? {}, serviceType)) {
    const configured = property.serviceRates[serviceType]?.[side];
    if (configured == null) return rate("FIXED", undefined, false, convert);
    let amount = configured.amountCents;
    if (!isClient && Number.isSafeInteger(cleanerCount) && cleanerCount > 0
      && Object.hasOwn(configured.byCleanerCount ?? {}, cleanerCount)) {
      amount = configured.byCleanerCount[cleanerCount];
    }
    return rate(configured.mode, amount, false, convert);
  }
  const legacy = isClient ? property.defaultClientPrice : property.defaultCleanerPrice;
  return rate("FIXED", serviceType === defaultServiceType ? legacy : undefined, true, convert);
}

/** A ready hourly result is a rate, never a payable or billable total. */
export function resolveJobPricing(job = {}, { property, cleanerCount = requiredCleanerCount(job) } = {}, convert = centsFromDollars) {
  const stored = job.id || job.operationalStatus || job.schemaVersion != null
    || ["clientPrice", "cleanerPayout", "billing", "pay"].some((field) => Object.hasOwn(job, field));
  const context = { job, property: stored ? undefined : property, cleanerCount, convert };
  return {
    client: resolveSide({ ...context, side: "client" }),
    cleaner: resolveSide({ ...context, side: "cleaner" }),
  };
}

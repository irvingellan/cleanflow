import { defaultServiceType } from "./serviceTypes.js";
import { maxCleanersPerJob, requiredCleanerCount } from "./offerSlots.js";

const maxRateCents = 10_000_000;

// Functions are packaged independently from the browser billing model. The
// browser supplies its existing converter; parity tests cover both entry points.
function centsFromDollars(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  return Math.abs(value * 100 - cents) <= 1e-6 && cents <= maxRateCents ? cents : null;
}

function rate(mode, value, inDollars, convert, perCleaner = false) {
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
    ...(perCleaner && mode === "FIXED" ? { perCleaner: true } : {}),
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
  if (!isClient && snapshot?.mode === "FIXED" && Object.hasOwn(snapshot, "perCleanerCents")) {
    return rate("FIXED", snapshot.perCleanerCents, false, convert, true);
  }
  // An existing Job always owns its snapshot, even when the amount is missing.
  if (!property) {
    return rate("FIXED", job[fixedField], true, convert);
  }

  const serviceType = job.serviceType || defaultServiceType;
  if (Object.hasOwn(property.serviceRates ?? {}, serviceType)) {
    const configured = property.serviceRates[serviceType]?.[side];
    if (configured == null) return rate("FIXED", undefined, false, convert);
    if (!isClient && validTeamSize(cleanerCount) && Object.hasOwn(configured.byCleanerCount ?? {}, cleanerCount)) {
      return rate(configured.mode, configured.byCleanerCount[cleanerCount], false, convert, true);
    }
    return rate(configured.mode, configured.amountCents, false, convert);
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

function validTeamSize(count) {
  return Number.isInteger(count) && count >= 1 && count <= maxCleanersPerJob;
}

/** A house total is split in whole cents. Only the first assigned slot receives the remainder. */
export function fixedCleanerShares(pricing, cleanerCount) {
  const cleaner = pricing?.cleaner;
  if (!validTeamSize(cleanerCount) || cleaner?.mode !== "FIXED" || cleaner.state !== "ready") return null;
  const amount = cleaner.amountCents;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > maxRateCents) return null;
  if (cleaner.perCleaner === true) {
    return { totalCents: amount * cleanerCount, firstCents: amount, otherCents: amount };
  }
  const otherCents = Math.floor(amount / cleanerCount);
  return { totalCents: amount, firstCents: otherCents + amount % cleanerCount, otherCents };
}

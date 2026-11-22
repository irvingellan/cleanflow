import { defaultServiceType } from "./serviceTypes.js";
import { maxCleanersPerJob, requiredCleanerCount, rosterCleanerIds } from "./offerSlots.js";
import { fixedCleanerShares, resolveJobPricing } from "./pricingModel.js";

/** Freeze only the cleaner's rate. Extra fields on the Job or Offer stay private. */
export function hourlyOfferSnapshot(pay) {
  if (pay?.mode !== "HOURLY") return null;
  const { cleaner } = resolveJobPricing({ pay });
  return cleaner.state === "ready"
    ? { offeredPay: { mode: "HOURLY", rateCents: cleaner.rateCents } }
    : { offeredCompensation: null };
}

export function canSuggestDefaultCleanerPrice(job, property) {
  // Legacy properties only had a single default, used by every kind of offer.
  return !property?.serviceRates || ((!job?.serviceType || job.serviceType === defaultServiceType)
    && !Object.hasOwn(property.serviceRates, defaultServiceType));
}

/** The offer freezes a personal amount. Before the first slot is filled, its extra cents are conditional. */
export function newOfferPay(job, property, cleanerCount = requiredCleanerCount(job)) {
  const hourly = hourlyOfferSnapshot(job?.pay);
  if (hourly) return hourly;
  let pricing = resolveJobPricing(job);
  if (pricing.cleaner.reason === "missing_rate" && !job?.pay && canSuggestDefaultCleanerPrice(job, property)
    && (property?.organizationId == null || job?.organizationId == null || property.organizationId === job.organizationId)) {
    pricing = resolveJobPricing({ cleanerPayout: property?.defaultCleanerPrice });
  }
  const shares = fixedCleanerShares(pricing, cleanerCount);
  if (!shares) return { offeredCompensation: null };
  const extra = shares.firstCents - shares.otherCents;
  return {
    offeredCompensation: shares.otherCents / 100,
    ...(extra > 0 && { offeredFirstSlotExtraCents: extra }),
    ...(!pricing.cleaner.perCleaner && { fixedHousePay: { totalCents: shares.totalCents, teamSize: cleanerCount } }),
  };
}

/** Manager-side terms for a generated link. House totals never reach a cleaner-facing projection. */
export function storedOfferPay(offer) {
  const hourly = hourlyOfferSnapshot(offer?.offeredPay);
  if (hourly) return hourly;
  const value = offer?.offeredCompensation;
  const offeredCompensation = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const terms = { offeredCompensation };
  if (offeredCompensation === null) return terms;
  const extra = offer?.offeredFirstSlotExtraCents;
  if (Number.isInteger(extra) && extra > 0 && extra < maxCleanersPerJob) terms.offeredFirstSlotExtraCents = extra;
  const house = offer?.fixedHousePay;
  if (house && Number.isSafeInteger(house.totalCents)) {
    const quoted = fixedCleanerShares(resolveJobPricing({ cleanerPayout: house.totalCents / 100 }), house.teamSize);
    if (quoted && quoted.otherCents / 100 === offeredCompensation &&
        quoted.firstCents - quoted.otherCents === (terms.offeredFirstSlotExtraCents ?? 0)) {
      terms.fixedHousePay = { totalCents: house.totalCents, teamSize: house.teamSize };
    }
  }
  return terms;
}

/** Project only the recipient's amount. A missing Job means this is a closed invitation. */
export function offerPayForRecipient(offer, job, cleanerId = offer?.cleanerId) {
  const legacy = !(Number.isInteger(job?.schemaVersion) && job.schemaVersion >= 2);
  const missing = !offer?.offeredPay && !Object.hasOwn(offer || {}, "offeredCompensation");
  let terms = storedOfferPay(offer);
  if (missing && job && legacy) {
    const count = requiredCleanerCount(job);
    terms = count === 1 ? storedOfferPay({ offeredCompensation: job.cleanerPayout })
      : newOfferPay({ cleanerPayout: job.cleanerPayout, requiredCleanerCount: count });
  }
  if (terms.offeredPay) return { offeredPay: terms.offeredPay };
  const { offeredCompensation, offeredFirstSlotExtraCents: extra, fixedHousePay } = terms;
  const roster = rosterCleanerIds(job);
  const index = roster.indexOf(cleanerId);
  if (fixedHousePay && job) {
    // The manager can revise planned spots. The original house total stays frozen.
    // A preview with no recipient already carries the form's chosen team size.
    const planned = cleanerId && Number.isInteger(job.requiredCleanerCount)
      ? job.requiredCleanerCount : fixedHousePay.teamSize;
    const started = ["IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus);
    const finalRoster = index >= 0 && (roster.length >= planned || started);
    const shares = fixedCleanerShares(resolveJobPricing({ cleanerPayout: fixedHousePay.totalCents / 100 }),
      finalRoster ? roster.length : planned);
    if (shares) {
      const remainder = shares.firstCents - shares.otherCents;
      return {
        offeredCompensation: (index === 0 ? shares.firstCents : shares.otherCents) / 100,
        ...(!roster.length && remainder > 0 && { offeredFirstSlotExtraCents: remainder }),
        ...(!started && roster.length < planned && planned > 1 && { offeredPayEstimated: true }),
      };
    }
  }
  if (!extra || !job) return { offeredCompensation };
  if (!roster.length) return { offeredCompensation, offeredFirstSlotExtraCents: extra };
  const amount = index === 0 ? (Math.round(offeredCompensation * 100) + extra) / 100 : offeredCompensation;
  return { offeredCompensation: amount };
}

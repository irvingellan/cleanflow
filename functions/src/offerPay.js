import { defaultServiceType } from "./serviceTypes.js";
import { resolveJobPricing } from "./pricingModel.js";

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

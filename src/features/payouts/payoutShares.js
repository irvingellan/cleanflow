import { getAssignedCleanerIds, isAssignmentAwareJob } from "../jobs/jobCompatibility.js";
import { billableMinutes } from "../billing/billingStatementModel.js";
import { fixedCleanerShares, resolveJobPricing } from "../pricing/pricingModel.js";

function unresolvedClientHours(job) {
  return job.billing?.mode === "HOURLY" && billableMinutes(job.billing.hours) === null;
}

function payoutRoster(job) {
  if (!isAssignmentAwareJob(job)) return [job.assignedCleanerId].filter(id => typeof id === "string" && id.trim());
  const ids = getAssignedCleanerIds(job);
  if (!Array.isArray(job.assignedCleanerIds) || ids.length !== job.assignedCleanerIds.length
    || ids.some((id, index) => job.assignedCleanerIds[index] !== id)) return [];
  return ids;
}

function savedFixedCents(agreement) {
  const value = agreement?.offeredCompensation;
  if (agreement?.offeredPay || typeof value !== "number" || value < 0) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && Math.abs(cents - value * 100) <= 0.000001 ? cents : null;
}

export function payoutNeedsHoursReview(job) {
  if (unresolvedClientHours(job)) return true;
  const roster = payoutRoster(job);
  const agreements = job.payoutAgreementsByCleaner ?? {};
  return roster.length ? roster.some(id => Object.hasOwn(agreements, id)
    ? agreements[id]?.offeredPay?.mode === "HOURLY" : job.pay?.mode === "HOURLY") : job.pay?.mode === "HOURLY";
}

/** A saved personal agreement owns the amount, including explicit zero or unknown. */
export function fixedPayoutShares(job) {
  const ids = payoutRoster(job);
  const amounts = fixedCleanerShares(resolveJobPricing(job), ids.length);
  const agreements = job.payoutAgreementsByCleaner ?? {};
  return ids.map((cleanerId, index) => {
    let cents = null;
    if (!unresolvedClientHours(job)) {
      if (Object.hasOwn(agreements, cleanerId)) cents = savedFixedCents(agreements[cleanerId]);
      else if (amounts) cents = index === 0 ? amounts.firstCents : amounts.otherCents;
    }
    return { cleanerId, cents };
  });
}

export function missingAgreementReview(job) {
  return fixedPayoutShares(job).some(({ cleanerId, cents }) => cents === null
    && Object.hasOwn(job.payoutAgreementsByCleaner ?? {}, cleanerId)
    && !Object.hasOwn(job.payoutIdsByCleaner ?? {}, cleanerId));
}

export function unpaidPayoutShares(job) {
  if (job.archivedAt || job.payoutId || job.payoutPaidAt) return [];
  const shares = fixedPayoutShares(job);
  const links = job.payoutIdsByCleaner;
  if (links != null && (typeof links !== "object" || Array.isArray(links)
    || Object.entries(links).some(([id, value]) => !(typeof value === "string" && value.trim())
      || !shares.some(share => share.cleanerId === id)))) return [];
  return shares.filter(share => share.cents > 0 && !Object.hasOwn(links ?? {}, share.cleanerId));
}

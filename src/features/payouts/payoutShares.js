import { getAssignedCleanerIds, isAssignmentAwareJob } from "../jobs/jobCompatibility.js";
import { billableJobMinutes } from "../billing/billingStatementModel.js";
import { fixedCleanerShares, resolveJobPricing } from "../pricing/pricingModel.js";

function unresolvedClientHours(job) {
  return job.billing?.mode === "HOURLY" && billableJobMinutes(job) === null;
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

function hourlyAgreement(job, cleanerId) {
  const agreements = job.payoutAgreementsByCleaner ?? {};
  return Object.hasOwn(agreements, cleanerId)
    ? agreements[cleanerId]?.offeredPay?.mode === "HOURLY"
    : job.pay?.mode === "HOURLY";
}

function approvedPayoutCents(job, cleanerId) {
  const amount = job.payoutApprovedWorkByCleaner?.[cleanerId]?.payoutCents;
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function payoutRecordedFor(job, cleanerId) {
  return Boolean(job.payoutId || job.payoutPaidAt || job.payoutIdsByCleaner?.[cleanerId]);
}

export function payoutNeedsHoursReview(job) {
  if (unresolvedClientHours(job)) return true;
  const roster = payoutRoster(job);
  return roster.length ? roster.some(id => !payoutRecordedFor(job, id) && hourlyAgreement(job, id) && approvedPayoutCents(job, id) === null)
    : job.pay?.mode === "HOURLY";
}

/** Fixed terms use the original allocation. Hourly terms use the approved Assignment amount. */
export function payoutShares(job) {
  const ids = payoutRoster(job);
  const amounts = fixedCleanerShares(resolveJobPricing(job), ids.length);
  const agreements = job.payoutAgreementsByCleaner ?? {};
  return ids.map((cleanerId, index) => {
    const recordedApproval = payoutRecordedFor(job, cleanerId) ? approvedPayoutCents(job, cleanerId) : null;
    let cents = recordedApproval;
    if (recordedApproval !== null) return { cleanerId, cents };
    if (hourlyAgreement(job, cleanerId)) {
      cents = approvedPayoutCents(job, cleanerId);
    } else if (!unresolvedClientHours(job)) {
      if (Object.hasOwn(agreements, cleanerId)) cents = savedFixedCents(agreements[cleanerId]);
      else if (amounts) cents = index === 0 ? amounts.firstCents : amounts.otherCents;
    }
    return { cleanerId, cents };
  });
}

export function missingAgreementReview(job) {
  return payoutShares(job).some(({ cleanerId, cents }) => cents === null
    && Object.hasOwn(job.payoutAgreementsByCleaner ?? {}, cleanerId)
    && !Object.hasOwn(job.payoutIdsByCleaner ?? {}, cleanerId));
}

export function unpaidPayoutShares(job) {
  if (job.archivedAt || job.payoutId || job.payoutPaidAt) return [];
  const shares = payoutShares(job);
  const links = job.payoutIdsByCleaner;
  if (links != null && (typeof links !== "object" || Array.isArray(links)
    || Object.entries(links).some(([id, value]) => !(typeof value === "string" && value.trim())
      || !shares.some(share => share.cleanerId === id)))) return [];
  return shares.filter(share => share.cents > 0 && !Object.hasOwn(links ?? {}, share.cleanerId));
}

/**
 * True when the Job document alone proves that no agreement can make this Job payable or
 * reviewable: a fixed-pay team Job where every cleaner on the roster has a recorded payout.
 * Hourly Jobs and legacy Jobs always return false and keep the full agreement check.
 */
export function payoutSettledOnJobRecord(job) {
  if (!isAssignmentAwareJob(job) || job.pay?.mode === "HOURLY" || job.billing?.mode === "HOURLY") return false;
  const roster = payoutRoster(job);
  const links = job.payoutIdsByCleaner;
  if (!roster.length || links == null || typeof links !== "object" || Array.isArray(links)) return false;
  const linked = Object.entries(links);
  return linked.length === roster.length
    && linked.every(([id, value]) => roster.includes(id) && typeof value === "string" && value.trim());
}

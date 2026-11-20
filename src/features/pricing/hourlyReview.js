import { billableMinutes, PRICING_HOURLY } from "../billing/billingStatementModel.js";

// Payable time belongs to each Assignment. Client hours cannot approve a cleaner's pay.
export function needsHoursReview(job) {
  return job.pay?.mode === PRICING_HOURLY ||
    (job.billing?.mode === PRICING_HOURLY && billableMinutes(job.billing.hours) === null);
}

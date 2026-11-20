import { resolveJobPricing as resolve } from "../../../functions/src/pricingModel.js";
import { centsFromDollars } from "../billing/billingStatementModel.js";

/** Pass a new service selection and Property for defaults, or the Job for its recorded pricing. */
export function resolveJobPricing(job, options) {
  return resolve(job, options, centsFromDollars);
}

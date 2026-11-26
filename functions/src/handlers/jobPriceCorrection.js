import { updateJobPricingForManager } from "../jobPricingUpdate.js";
import { correctJobPricesForManager } from "../jobPriceCorrection.js";
import { db, organizationId } from "../runtime/firebase.js";

export function correctJobPrices(request) {
  return correctJobPricesForManager(db, request, organizationId);
}

export function updateJobPricing(request) {
  return updateJobPricingForManager(db, request, organizationId);
}

import { correctJobPricesForManager } from "../jobPriceCorrection.js";
import { db, organizationId } from "../runtime/firebase.js";

export function correctJobPrices(request) {
  return correctJobPricesForManager(db, request, organizationId);
}

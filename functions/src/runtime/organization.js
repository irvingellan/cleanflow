import { HttpsError } from "firebase-functions/v2/https";

export const defaultOrganizationId = "cleanflow-demo";
const organizationIdPattern = /^[a-z0-9][a-z0-9-]{2,62}$/;

/** Selects the caller's organization. Membership is still verified by the handler. */
export function organizationIdForRequest(request) {
  const token = request.auth?.token;
  const claimed = token?.organizationId ?? token?.cleanerHub?.organizationId;
  if (claimed === undefined || claimed === null) return defaultOrganizationId;
  if (typeof claimed !== "string" || !organizationIdPattern.test(claimed)) {
    throw new HttpsError("permission-denied", "Organization access is required.");
  }
  return claimed;
}

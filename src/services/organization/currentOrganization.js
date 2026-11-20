export const defaultOrganizationId = "cleanflow-demo";
const organizationIdPattern = /^[a-z0-9][a-z0-9-]{2,62}$/;
let currentId = defaultOrganizationId;

export function isOrganizationId(value) {
  return typeof value === "string" && organizationIdPattern.test(value);
}

/** The organization every client data path is built from. */
export function currentOrganizationId() {
  return currentId;
}

/** A claim selects the organization; membership documents and rules still authorize it. */
export function organizationIdFromClaims(claims) {
  return isOrganizationId(claims?.organizationId) ? claims.organizationId : defaultOrganizationId;
}

export function setCurrentOrganizationId(value) {
  currentId = isOrganizationId(value) ? value : defaultOrganizationId;
}

export function resetCurrentOrganizationId() {
  currentId = defaultOrganizationId;
}

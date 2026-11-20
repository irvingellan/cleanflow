import { cleanerUnavailabilityForRequest } from "../cleanerUnavailability.js";
import { db, organizationId } from "../runtime/firebase.js";

export function listMyUnavailability(request) {
  return cleanerUnavailabilityForRequest(db, { organizationId, request, role: "CLEANER", action: "list" });
}

export function setMyUnavailability(request) {
  return cleanerUnavailabilityForRequest(db, { organizationId, request, role: "CLEANER", action: "set" });
}

export function removeMyUnavailability(request) {
  return cleanerUnavailabilityForRequest(db, { organizationId, request, role: "CLEANER", action: "remove" });
}

export function setCleanerUnavailability(request) {
  return cleanerUnavailabilityForRequest(db, { organizationId, request, role: "MANAGER", action: "set" });
}

export function removeCleanerUnavailability(request) {
  return cleanerUnavailabilityForRequest(db, { organizationId, request, role: "MANAGER", action: "remove" });
}

import { HttpsError } from "firebase-functions/v2/https";

export function developerUidsFromSecret(value) {
  return (value || "")
    .split(",")
    .map((uid) => uid.trim())
    .filter(Boolean);
}

export function isAuthorizedDeveloper(request, allowedUids) {
  return Boolean(request.auth?.uid && allowedUids.includes(request.auth.uid));
}

export function requireAuthorizedDeveloper(request, allowedUids) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  if (!isAuthorizedDeveloper(request, allowedUids)) {
    throw new HttpsError("permission-denied", "Developer access is required.");
  }
}

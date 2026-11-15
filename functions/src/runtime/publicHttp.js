import { createHash, randomBytes } from "node:crypto";

export const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function validToken(token) {
  return typeof token === "string" && tokenPattern.test(token);
}

export function newChecklistCapabilityToken() {
  return randomBytes(32).toString("base64url");
}

export function configureResponse(response) {
  response.set("Cache-Control", "no-store, private");
  response.set("Referrer-Policy", "no-referrer");
  response.set("X-Content-Type-Options", "nosniff");
}

export function sendPublicError(response, status, error, diagnostics = null, requirements = null) {
  configureResponse(response);
  response.status(status).json({
    error,
    ...(diagnostics ? { diagnostics } : {}),
    ...(requirements ? { requirements } : {}),
  });
}

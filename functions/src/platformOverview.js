import { createHash } from "node:crypto";
import { addCalendarDays, localDateKey } from "./managerReminders.js";

export const operationKinds = ["offers", "issues", "assignments", "checklist-run", "checklist-capability", "cleaners"];

// These labels are the only free text in the DTO. Never use an email, UID,
// profile object, or arbitrary operation kind as a display-name fallback.
const sensitiveLabel = /(?:\b(?:bearer|password|passcode|secret|token|(?:access|door|garage|alarm|lock)[ -]?code)\b|[a-z\d_-]{32,})/i;

export function displayLabel(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 100 || sensitiveLabel.test(text) || !/^[\p{L}\p{M}\p{N} '&’.,()-]+$/u.test(text)
    || /[\p{L}\d]\.[\p{L}\d]{2,}|\d(?:[(). -]*\d){6,}/u.test(text)) return null;
  return text;
}

export function organizationKey(id) {
  // Preserve normal slugs. Imported arbitrary document names can contain
  // contact details or URLs. Reserve this prefix so aliases cannot collide.
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) && !id.startsWith("org-ref-") && !/\d{7}/.test(id)
    && !/\b(?:bearer|password|passcode|secret|token)\b/i.test(id)
    ? id : "org-ref-" + createHash("sha256").update(id).digest("hex");
}

export function isoDate(value) {
  const date = value?.toDate?.() ?? (value instanceof Date ? value : typeof value === "string" ? new Date(value) : null);
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function reportingWindow(now) {
  const day = 86_400_000;
  const today = localDateKey(now);
  return { now, since30: new Date(now.getTime() - 30 * day), since7: new Date(now.getTime() - 7 * day),
    today, endDate: addCalendarDays(today, 7) };
}

// Match Manager Page Load Diagnostics: capped visits are background tabs,
// median averages the middle pair, and p95 uses the nearest rank.
export function summarizeHealth(pageLoads, timings, failures, failedPageLoads = 0) {
  const durations = timings.filter((n) => Number.isFinite(n) && n >= 0 && n < 600_000).sort((a, b) => a - b);
  const n = durations.length;
  const medianMs = n ? Math.round((durations[Math.floor((n - 1) / 2)] + durations[Math.floor(n / 2)]) / 2) : null;
  const p95Ms = n ? durations[Math.ceil(n * 0.95) - 1] : null;
  const failedOperations = Object.fromEntries(operationKinds.filter((key) => failures[key] > 0)
    .map((key) => [key, failures[key]]));
  let status = "unknown";
  if (failedPageLoads || Object.keys(failedOperations).length) status = "errors";
  else if (p95Ms !== null) status = p95Ms > 3000 ? "slow" : "ok";
  return { pageLoads, failedPageLoads, medianMs, p95Ms, failedOperations, status };
}

export function directoryPerson(role, profile, account) {
  return {
    displayName: displayLabel(profile.displayName) ?? displayLabel(profile.name) ?? displayLabel(account?.displayName),
    role,
    active: role === "MANAGER" ? profile.active === true : profile.active !== false && !profile.archivedAt,
    lastSignInAt: isoDate(account?.metadata?.lastSignInTime),
  };
}

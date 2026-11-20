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

export const platformHealthThresholds = Object.freeze({
  failureRate: 0.05, minimumPageLoads: 20, minimumOperationAttempts: 10, slowP95Ms: 3000,
});

// Match Manager Page Load Diagnostics: capped visits are background tabs,
// median averages the middle pair, and p95 uses the nearest rank.
export function summarizeHealth(pageLoads, timings, failures, failedPageLoads = 0, attempts = {}) {
  const durations = timings.filter((n) => Number.isFinite(n) && n >= 0 && n < 600_000).sort((a, b) => a - b);
  const timedLoads = durations.length;
  const middle = Math.floor(timedLoads / 2);
  const medianMs = timedLoads ? Math.round((durations[Math.floor((timedLoads - 1) / 2)] + durations[middle]) / 2) : null;
  const p95Ms = timedLoads ? durations[Math.ceil(timedLoads * 0.95) - 1] : null;
  const failedOperations = {}, operationAttempts = {}, operationFailureRates = {};
  const pageFailureRate = pageLoads ? failedPageLoads / pageLoads : null;
  const rules = platformHealthThresholds;
  let hasSample = pageLoads >= rules.minimumPageLoads;
  let hasErrors = hasSample && pageFailureRate >= rules.failureRate;
  for (const kind of operationKinds) {
    if (!(attempts[kind] > 0)) continue;
    const failed = failures[kind] || 0;
    if (failed) failedOperations[kind] = failed;
    operationAttempts[kind] = attempts[kind];
    operationFailureRates[kind] = failed / attempts[kind];
    if (attempts[kind] >= rules.minimumOperationAttempts) {
      hasSample = true;
      if (operationFailureRates[kind] >= rules.failureRate) hasErrors = true;
    }
  }
  let status = hasSample ? "ok" : "no-data";
  if (hasErrors) status = "errors";
  else if (timedLoads >= rules.minimumPageLoads && p95Ms > rules.slowP95Ms) status = "slow";
  return { pageLoads, timedLoads, failedPageLoads, pageFailureRate, medianMs, p95Ms,
    failedOperations, operationAttempts, operationFailureRates, status };
}

export function maskedManagerLabel(email) {
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(email)) return null;
  const local = email.split("@")[0];
  const prefix = local.match(/^[\p{L}\p{N}]{1,2}/u)?.[0] || "";
  return prefix + "•••@";
}

export function directoryPerson(role, profile, account, activity = {}) {
  const manager = role === "MANAGER";
  const name = displayLabel(profile.displayName) ?? displayLabel(profile.name) ?? displayLabel(account?.displayName);
  const lastSignInAt = manager ? isoDate(account?.metadata?.lastSignInTime) : null;
  return {
    displayName: name ?? (manager ? maskedManagerLabel(account?.email) : null),
    role,
    active: manager ? profile.active === true : profile.active !== false && !profile.archivedAt,
    lastSignInAt,
    lastActivityAt: manager ? lastSignInAt : activity.lastActivityAt ?? null,
    activitySource: manager ? (lastSignInAt ? "signIn" : null) : activity.activitySource ?? null,
  };
}

/**
 * Pure presentation rules for the cleaner's own agenda. Input is the
 * server-written cleanerAgenda projection; nothing here decides authorization.
 */

export const completedWindowDays = 30;
export const changesWindowDays = 7;
const openStatuses = ["ASSIGNED", "IN_PROGRESS"];

const serviceDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
});

export function localDateKey(date = new Date()) {
  const parts = serviceDateFormatter.formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDaysToKey(key, days) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sortKey(entry) {
  return `${entry.scheduledDate || "9999-12-31"}T${entry.scheduledStart || "99:99"}`;
}

const byTime = (first, second) => sortKey(first).localeCompare(sortKey(second));

/**
 * @returns {{today: object[], upcoming: object[], completed: object[], offers: object[], changes: object[], openCount: number}}
 */
export function buildCleanerAgenda(entries = [], { now = new Date() } = {}) {
  const today = localDateKey(now);
  const completedFrom = addDaysToKey(today, -completedWindowDays);
  const assigned = entries.filter((entry) => entry.kind === "ASSIGNED");
  const open = assigned.filter((entry) => openStatuses.includes(entry.jobStatus));

  // Earlier days still open are shown under Today with their own date, so the
  // cleaner never mistakes an unfinished past job for a future one.
  const todayList = open.filter((entry) => entry.scheduledDate && entry.scheduledDate <= today).sort(byTime);
  const upcoming = open.filter((entry) => !entry.scheduledDate || entry.scheduledDate > today).sort(byTime);
  const completed = assigned
    .filter((entry) => entry.jobStatus === "COMPLETED" && (!entry.scheduledDate || entry.scheduledDate >= completedFrom))
    .sort((first, second) => byTime(second, first));
  const offers = entries
    .filter((entry) => entry.kind === "OFFER" && ["PENDING", "INTERESTED"].includes(entry.offerStatus))
    .filter((entry) => Number.isFinite(entry.offerExpiresAtMs) && entry.offerExpiresAtMs > now.getTime())
    .filter((entry) => !entry.scheduledDate || entry.scheduledDate >= today)
    .sort(byTime);
  const changesFrom = now.getTime() - changesWindowDays * 24 * 60 * 60 * 1000;
  const changes = entries
    .filter((entry) => entry.kind === "CHANGE" && Number(entry.atMs) >= changesFrom)
    .sort((first, second) => Number(second.atMs) - Number(first.atMs));

  return { today: todayList, upcoming, completed, offers, changes, openCount: todayList.length + upcoming.length };
}

export function findAgendaEntry(entries, jobId) {
  return entries.find((entry) => entry.jobId === jobId && entry.kind !== "CHANGE") || null;
}

/** Card status for an assigned Job. Interest or acknowledgment never upgrades an Offer. */
export function assignedStatusKey(entry) {
  if (entry.jobStatus === "COMPLETED") return "done";
  if (entry.jobStatus === "IN_PROGRESS") return "progress";
  return "confirmed";
}

/**
 * Freshness the screen may claim. "live" only after a server-confirmed snapshot;
 * cached or failed reads keep the last confirmed time and say so.
 */
export function freshnessFor({ hasSnapshot, fromCache, error, online, lastVerifiedAt, nowMs, maxAgeMs }) {
  if (!hasSnapshot) {
    return error ? { state: "error", lastVerifiedAt, reason: "error" } : { state: "loading", lastVerifiedAt: null };
  }
  if (!online) return { state: "stale", lastVerifiedAt, reason: "offline" };
  if (error || nowMs - lastVerifiedAt?.getTime() >= maxAgeMs) return { state: "stale", lastVerifiedAt, reason: "error" };
  if (fromCache) return { state: "stale", lastVerifiedAt, reason: "cache" };
  return { state: "live", lastVerifiedAt };
}

/** Normalises what a person may type or paste: groups, spaces, lower case. */
export function normalizeAccessCodeInput(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

export function formatAccessCodeInput(value) {
  const code = normalizeAccessCodeInput(value);
  return code.match(/.{1,4}/g)?.join("-") || "";
}

/* ---------- Gabi feedback 2026-11-04 (FB02, FB04, FB01) ---------- */

/** "YYYY-MM" for a dated entry, "" when the date is not set yet. */
export function monthKeyOf(entry) {
  return entry?.scheduledDate ? entry.scheduledDate.slice(0, 7) : "";
}

/**
 * Months that hold at least one of the given entries, in date order; undated
 * entries ("") come last. Every entry belongs to exactly one month, so
 * navigating month by month can never skip or duplicate a Job.
 */
export function agendaMonths(entries = []) {
  const keys = [...new Set(entries.map(monthKeyOf))];
  return keys.filter(Boolean).sort().concat(keys.includes("") ? [""] : []);
}

export function entriesInMonth(entries = [], month) {
  return entries.filter((entry) => monthKeyOf(entry) === month);
}

const runStatuses = ["NONE", "DRAFT", "READY_FOR_REVIEW", "ABANDONED"];

/**
 * Cleaner-facing checklist situation for an assigned agenda entry.
 *
 * Reads the optional server-written `entry.checklist` summary proposed in
 * docs/GABI_FEEDBACK_UX_V1.md ({status, started}). The current projection does
 * not write it yet, so the honest answer is "unknown": the screen then offers
 * the existing "Abrir checklist" path, where the server decides. Nothing here
 * creates, starts or submits a Run, and saving answers is never "sent".
 *
 * @returns {{state: "unknown"|"none"|"available"|"started"|"submitted"|"closed", pending: boolean}}
 */
export function checklistSituation(entry) {
  const summary = entry?.checklist;
  const open = openStatuses.includes(entry?.jobStatus);
  if (!summary || typeof summary !== "object" || !runStatuses.includes(summary.status)) {
    return { state: "unknown", pending: false };
  }
  if (summary.status === "READY_FOR_REVIEW") return { state: "submitted", pending: false };
  if (summary.status === "ABANDONED") return { state: "closed", pending: false };
  if (summary.status === "NONE") return { state: "none", pending: false };
  // DRAFT: the cleaner still owes it while the Job is open. Not "late": a Run
  // created for a Job that has not started is simply available.
  const state = summary.started === true ? "started" : "available";
  return { state, pending: open };
}

const accessStates = ["available", "not-provided", "not-yet", "revoked", "denied"];

/**
 * Normalises what the proposed `getMyJobAccess` read returns (see contract).
 * Anything unexpected becomes "unsupported", which shows a neutral note and
 * never a fabricated code or instruction.
 */
export function normalizeJobAccess(result) {
  if (!result || !accessStates.includes(result.state)) return { state: "unsupported" };
  if (result.state !== "available") return { state: result.state, availableFromMs: Number.isFinite(result.availableFromMs) ? result.availableFromMs : null };
  const clean = (value, max) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  const items = (Array.isArray(result.items) ? result.items : [])
    .map((item) => ({ kind: clean(item?.kind, 32) || "note", label: clean(item?.label, 80), value: clean(item?.value, 400) }))
    .filter((item) => item.value)
    .slice(0, 12);
  const address = clean(result.address, 240);
  const instructions = clean(result.houseInstructions, 4000);
  if (!items.length && !address && !instructions) return { state: "not-provided" };
  return { state: "available", address, items, instructions };
}

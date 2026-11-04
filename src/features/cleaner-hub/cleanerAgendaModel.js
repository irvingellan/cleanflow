/**
 * Pure presentation rules for the cleaner's own agenda. Input is the
 * server-written cleanerAgenda projection; nothing here decides authorization.
 */

export const completedWindowDays = 30;
export const changesWindowDays = 7;
const openStatuses = ["ASSIGNED", "IN_PROGRESS"];

export function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addDaysToKey(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days, 12));
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
export function freshnessFor({ hasSnapshot, fromCache, error, online, lastVerifiedAt }) {
  if (!hasSnapshot && !error) return { state: "loading", lastVerifiedAt: null };
  if (error) return { state: lastVerifiedAt || hasSnapshot ? "stale" : "error", lastVerifiedAt, reason: "error" };
  if (!online || fromCache) return { state: lastVerifiedAt || hasSnapshot ? "stale" : "loading", lastVerifiedAt, reason: online ? "cache" : "offline" };
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

import { rosterCleanerIds } from "./cleanerAgenda.js";

// FB01: practical access details for the cleaner who is on a Job's roster.
// Only what the manager explicitly shares in Property.cleanerAccess (plus the
// address and cleaner instructions, when that sharing is switched on) leaves
// the server. Internal Property fields such as keyCodeInfo, accessInstructions
// or additionalNotes are never read here. The result is returned to the
// authenticated cleaner only: no push, Inbox, URL, log or projection.

export const cleanerAccessFieldKinds = Object.freeze({
  door: "door", gate: "gate", lockbox: "lockbox", parking: "parking", wifi: "wifi", alarm: "alarm", note: "note",
});
const openStatuses = new Set(["ASSIGNED", "IN_PROGRESS"]);
const dayMs = 24 * 60 * 60 * 1000;

function text(value, maximum) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : null;
}

/** Calendar date (YYYY-MM-DD) in the organization's operating time zone. */
export function operatingDate(nowMs, timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(nowMs));
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** UTC instant of 00:00 on `date` in `timeZone`. */
export function zonedMidnight(date, timeZone = "America/Los_Angeles") {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return guess + (guess - wall);
}

function shiftDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * dayMs).toISOString().slice(0, 10);
}

/**
 * Conservative window pending the manager's decision: from the day before the
 * service through the service day, and always while the Job is in progress.
 */
export function accessWindow(job, nowMs, timeZone) {
  if (job?.operationalStatus === "IN_PROGRESS") return { open: true };
  if (typeof job?.scheduledDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(job.scheduledDate)) return { open: false };
  const today = operatingDate(nowMs, timeZone);
  const from = shiftDate(job.scheduledDate, -1);
  if (today < from) return { open: false, availableFrom: from };
  return { open: today <= job.scheduledDate };
}

/** Pure projection of what one authorized cleaner may read for one Job. */
export function projectCleanerJobAccess({ job, property, cleanerId, nowMs = Date.now(), timeZone }) {
  if (!job || job.archivedAt || !rosterCleanerIds(job).includes(cleanerId)) return { state: "revoked" };
  if (!openStatuses.has(job.operationalStatus)) return { state: "revoked" };
  const shared = property?.cleanerAccess;
  if (!shared || shared.shared !== true) return { state: "not-provided" };
  const window = accessWindow(job, nowMs, timeZone);
  if (!window.open) {
    return window.availableFrom
      ? { state: "not-yet", availableFromMs: zonedMidnight(window.availableFrom, timeZone) }
      : { state: "revoked" };
  }
  const items = Object.values(cleanerAccessFieldKinds)
    .map((kind) => ({ kind, value: text(shared[kind], 400) }))
    .filter((item) => item.value);
  const address = text(property.address, 240);
  const houseInstructions = text(property.cleanerInstructions, 4000);
  if (!items.length && !address && !houseInstructions) return { state: "not-provided" };
  return {
    state: "available", items,
    ...(address ? { address } : {}),
    ...(houseInstructions ? { houseInstructions } : {}),
  };
}

/** Reads the Job and its Property for an already authenticated active cleaner. */
export async function loadCleanerJobAccess(database, { organizationId, cleanerId, jobId, nowMs = Date.now(), timeZone }) {
  if (typeof jobId !== "string" || !jobId || jobId.includes("/") || jobId.length > 256) return { state: "denied" };
  const organization = database.collection("organizations").doc(organizationId);
  const jobSnapshot = await organization.collection("jobs").doc(jobId).get();
  const job = jobSnapshot.exists ? jobSnapshot.data() : null;
  if (!job || (job.organizationId != null && job.organizationId !== organizationId)) return { state: "denied" };
  if (!rosterCleanerIds(job).includes(cleanerId)) return { state: "denied" };
  const propertyId = typeof job.propertyId === "string" && job.propertyId && !job.propertyId.includes("/") ? job.propertyId : null;
  const propertySnapshot = propertyId ? await organization.collection("properties").doc(propertyId).get() : null;
  const property = propertySnapshot?.exists ? propertySnapshot.data() : null;
  if (property && property.organizationId != null && property.organizationId !== organizationId) return { state: "denied" };
  return projectCleanerJobAccess({ job, property, cleanerId, nowMs, timeZone });
}

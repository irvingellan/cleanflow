import { openSpots, requiredCleanerCount, rosterCleanerIds } from "../jobs/offerSlots.js";

// Cleaner Agenda: the manager's compact views of one service period —
// each cleaner's schedule, services still missing a cleaner, and completed
// services per cleaner for the weekly payment. Pure; no Firestore.

const text = (value) => (typeof value === "string" ? value.trim() : "");
const excludedProvenance = new Set(["DEMO", "SANDBOX", "TEST"]);

function inPeriod(job, period) {
  const date = text(job?.scheduledDate);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= period.start && date <= period.end;
}

/** Real, live services in the period. Cancelled and archived ones never appear. */
function eligible(job, period) {
  return inPeriod(job, period) && !job.archivedAt && job.operationalStatus !== "CANCELLED"
    && !excludedProvenance.has(job.dataProvenance);
}

function row(job, propertyById) {
  const property = propertyById.get(job.propertyId);
  return {
    jobId: job.id,
    date: job.scheduledDate,
    start: /^\d{2}:\d{2}$/.test(text(job.scheduledStart)) ? text(job.scheduledStart) : "",
    propertyName: text(property?.name) || text(job.propertyName),
    address: text(property?.address),
    status: job.operationalStatus,
  };
}

const byTime = (a, b) => a.date.localeCompare(b.date) || (a.start || "99").localeCompare(b.start || "99")
  || a.propertyName.localeCompare(b.propertyName) || String(a.jobId).localeCompare(String(b.jobId));

function cleanerGroups(jobs, cleanerById, propertyById, makeRow) {
  const groups = new Map();
  for (const job of jobs) {
    for (const cleanerId of rosterCleanerIds(job)) {
      if (!groups.has(cleanerId)) {
        const cleaner = cleanerById.get(cleanerId);
        groups.set(cleanerId, {
          cleanerId,
          name: text(cleaner?.name),
          phone: text(cleaner?.phone),
          preferredLanguage: text(cleaner?.preferredLanguage),
          rows: [],
        });
      }
      groups.get(cleanerId).rows.push(makeRow(job, cleanerId, propertyById));
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, rows: group.rows.sort(byTime) }))
    .sort((a, b) => (a.name || "￿").localeCompare(b.name || "￿") || a.cleanerId.localeCompare(b.cleanerId));
}

/**
 * Cleaner payout for one completed service, only when the record says it
 * unambiguously: a stored amount on a service done by exactly one cleaner.
 * A shared service keeps one Job-level amount today, so its split is unknown.
 */
export function cleanerPayoutFor(job) {
  if (rosterCleanerIds(job).length !== 1) return null;
  const amount = job?.cleanerPayout;
  return typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function buildCleanerAgenda({ period, jobs = [], cleaners = [], properties = [] }) {
  if (!period?.start || !period?.end || period.start > period.end) throw new RangeError("A valid period is required.");
  const cleanerById = new Map(cleaners.map((cleaner) => [cleaner.id, cleaner]));
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const live = jobs.filter((job) => eligible(job, period));

  const schedule = cleanerGroups(live, cleanerById, propertyById, (job) => row(job, propertyById));

  const unassigned = live
    .filter((job) => job.operationalStatus !== "COMPLETED" && job.operationalStatus !== "IN_PROGRESS" && openSpots(job) > 0)
    .map((job) => ({
      ...row(job, propertyById),
      required: requiredCleanerCount(job),
      filled: rosterCleanerIds(job).length,
      cleanerNames: rosterCleanerIds(job).map((id) => text(cleanerById.get(id)?.name)).filter(Boolean),
    }))
    .sort(byTime);

  const completed = cleanerGroups(
    live.filter((job) => job.operationalStatus === "COMPLETED"),
    cleanerById, propertyById,
    (job) => ({ ...row(job, propertyById), payout: cleanerPayoutFor(job), shared: rosterCleanerIds(job).length > 1 }),
  ).map((group) => {
    const known = group.rows.filter((entry) => entry.payout !== null);
    const knownCents = known.reduce((sum, entry) => sum + Math.round(entry.payout * 100), 0);
    return {
      ...group,
      knownTotal: knownCents / 100,
      unknownCount: group.rows.length - known.length,
      total: known.length === group.rows.length ? knownCents / 100 : null,
    };
  });

  return { period: { start: period.start, end: period.end }, schedule, unassigned, completed };
}

/**
 * A short, ready-to-send schedule for one cleaner: date, time, house and
 * address. Never includes door, gate, lockbox or other access details.
 */
export function agendaMessage({ group, period, copy, formatDate, formatWeekday }) {
  const lines = group.rows.map((entry) => {
    const when = [`${formatWeekday(entry.date)} ${formatDate(entry.date)}`, entry.start].filter(Boolean).join(" · ");
    const where = [entry.propertyName, entry.address].filter(Boolean).join(" — ");
    return `• ${when} · ${where || copy.unnamedProperty}`;
  });
  return [
    copy.greeting.replace("{name}", group.name || "").replace(/\s+!/, "!"),
    copy.intro.replace("{start}", formatDate(period.start)).replace("{end}", formatDate(period.end)),
    "",
    ...lines,
    "",
    copy.closing,
  ].join("\n");
}

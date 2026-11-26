import { openSpots, requiredCleanerCount, rosterCleanerIds } from "../jobs/offerSlots.js";
import { currentScheduleRevision } from "../jobs/scheduleConfirmation.js";
import { serviceTypeLabel } from "../jobs/serviceTypeMessages.js";
import { payoutShares } from "../payouts/payoutShares.js";
import { normalizeServiceType } from "../../../functions/src/serviceTypes.js";

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

function clientIdFor(job, propertyById) {
  return text(propertyById.get(job.propertyId)?.clientId) || text(job.clientId);
}

/** Optional house and client filters; an empty value keeps every service. */
function matchesFilters(job, propertyById, { propertyId = "", clientId = "" } = {}) {
  return (!propertyId || job.propertyId === propertyId)
    && (!clientId || clientIdFor(job, propertyById) === clientId);
}

function row(job, propertyById) {
  const property = propertyById.get(job.propertyId);
  return {
    jobId: job.id,
    date: job.scheduledDate,
    start: /^\d{2}:\d{2}$/.test(text(job.scheduledStart)) ? text(job.scheduledStart) : "",
    serviceType: normalizeServiceType(job.serviceType),
    scheduleRevision: currentScheduleRevision(job),
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

/** An explicitly linked receipt owns the amount already paid; an unreadable receipt stays unknown. */
export function cleanerPayoutFor(job, cleanerId, paidCents = null) {
  const roster = rosterCleanerIds(job);
  const id = cleanerId ?? (roster.length === 1 ? roster[0] : null);
  if (!id || !roster.includes(id)) return null;
  if (job.payoutId || job.payoutPaidAt || Object.hasOwn(job.payoutIdsByCleaner ?? {}, id)) {
    return Number.isSafeInteger(paidCents) && paidCents >= 0 ? paidCents / 100 : null;
  }
  const share = payoutShares(job).find(item => item.cleanerId === id);
  return share?.cents == null ? null : share.cents / 100;
}

/** House and client choices for the period, from the services it contains. */
export function agendaFilterOptions({ period, jobs = [], properties = [], clients = [] }) {
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const houses = new Map();
  const owners = new Map();
  for (const job of jobs.filter((entry) => eligible(entry, period))) {
    if (text(job.propertyId)) houses.set(job.propertyId, text(propertyById.get(job.propertyId)?.name) || text(job.propertyName));
    const clientId = clientIdFor(job, propertyById);
    if (clientId) owners.set(clientId, text(clientById.get(clientId)?.name));
  }
  const sorted = (map) => [...map.entries()].sort((a, b) => (a[1] || "￿").localeCompare(b[1] || "￿") || a[0].localeCompare(b[0]));
  return { properties: sorted(houses), clients: sorted(owners) };
}

export function buildCleanerAgenda({ period, jobs = [], cleaners = [], properties = [], filters = {}, receiptAmounts = new Map() }) {
  if (!period?.start || !period?.end || period.start > period.end) throw new RangeError("A valid period is required.");
  const cleanerById = new Map(cleaners.map((cleaner) => [cleaner.id, cleaner]));
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const live = jobs.filter((job) => eligible(job, period) && matchesFilters(job, propertyById, filters));

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
    (job, cleanerId) => {
      const paid = receiptAmounts.get(agendaScheduleKey(cleanerId, job.id));
      return { ...row(job, propertyById), payout: cleanerPayoutFor(job, cleanerId, paid), paid: paid != null };
    },
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

export function agendaScheduleKey(cleanerId, jobId) {
  return JSON.stringify([cleanerId, jobId]);
}

/**
 * A short schedule with the cleaner's service types and verified changes.
 * Previous schedules come only from successful copies in this manager session.
 */
export function agendaMessage({ group, period, copy, formatDate, formatWeekday,
  language = group.preferredLanguage, copiedSchedules = new Map() }) {
  const when = (entry) => [`${formatWeekday(entry.date)} ${formatDate(entry.date)}`, entry.start || copy.noTime]
    .filter(Boolean).join(" · ");
  const lines = group.rows.map((entry) => {
    const previous = copiedSchedules.get(agendaScheduleKey(group.cleanerId, entry.jobId));
    const changed = previous && (previous.date !== entry.date || previous.start !== entry.start);
    let change = "";
    if (changed) {
      const sameDay = previous.date === entry.date;
      const from = sameDay ? previous.start || copy.noTime : when(previous);
      const to = sameDay ? entry.start || copy.noTime : when(entry);
      change = `${copy.rescheduled}: ${from} → ${to}`;
    } else if (!previous && entry.scheduleRevision > 0) {
      change = `${copy.rescheduled}: ${when(entry)}`;
    }
    const where = [entry.propertyName, entry.address].filter(Boolean).join(" — ");
    return `• ${when(entry)} · ${serviceTypeLabel(language, entry.serviceType)} · ${where || copy.unnamedProperty}`
      + (change ? `\n  ${change}` : "");
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

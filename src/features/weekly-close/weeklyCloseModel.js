import { normalizeDataProvenance } from "../../lib/dataProvenance.js";
import { getAssignedCleanerIds, isAssignmentAwareJob } from "../jobs/jobCompatibility.js";

const dayMilliseconds = 86_400_000;
const text = (value) => typeof value === "string" ? value.trim() : "";

function dateNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const number = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(number) && new Date(number).toISOString().slice(0, 10) === value
    ? number : null;
}

const dateString = (value) => new Date(value).toISOString().slice(0, 10);

/** Service dates are date-only values; completion timestamps do not select a week. */
export function serviceWeekForDate(value) {
  const number = dateNumber(value);
  if (number === null) throw new RangeError("A valid service date is required.");
  const start = number - ((new Date(number).getUTCDay() + 6) % 7) * dayMilliseconds;
  return { start: dateString(start), end: dateString(start + 6 * dayMilliseconds) };
}

export function shiftServiceWeek(start, delta) {
  if (!Number.isInteger(delta)) throw new RangeError("A whole week offset is required.");
  const week = serviceWeekForDate(start);
  return serviceWeekForDate(dateString(dateNumber(week.start) + delta * 7 * dayMilliseconds));
}

export function previousServiceWeek(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError("A valid clock is required.");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return shiftServiceWeek(`${part("year")}-${part("month")}-${part("day")}`, -1);
}

function money(value) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    return { cents: null, state: "missing" };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { cents: null, state: "invalid" };
  }
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 0.000001) {
    return { cents: null, state: "invalid" };
  }
  return { cents, state: "valid" };
}

const dollars = (cents) => cents === null ? null : cents / 100;

function timestamp(value) {
  try {
    let milliseconds;
    if (value instanceof Date) milliseconds = value.getTime();
    else if (typeof value?.toMillis === "function") milliseconds = value.toMillis();
    else if (Number.isFinite(value?.seconds)) milliseconds = value.seconds * 1000;
    else if (typeof value === "string" && value.trim()) milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : null;
  } catch {
    return null;
  }
}

// Only reconciliation-relevant fields participate in duplicate comparison;
// private notes/contacts/access information never enter this projection.
function jobFingerprint(job) {
  return JSON.stringify([
    job.organizationId, normalizeDataProvenance(job), Boolean(job.archivedAt),
    job.operationalStatus, job.scheduledDate, job.clientId, job.clientName,
    job.propertyId, job.propertyName, job.schemaVersion, job.assignedCleanerId,
    job.assignedCleanerName, getAssignedCleanerIds(job).sort(),
    money(job.clientPrice), money(job.cleanerPayout), job.payoutId,
    Boolean(job.payoutPaidAt), timestamp(job.payoutPaidAt), job.legacyPayoutEligible === true,
  ]);
}

function payoutFingerprint(payout) {
  return JSON.stringify([
    payout.organizationId, payout.cleanerId, payout.status, payout.jobIds,
    money(payout.amount), timestamp(payout.paidAt),
  ]);
}

function payoutIndex(payouts) {
  const byId = new Map();
  const conflicts = new Set();
  const byJob = new Map();
  for (const payout of payouts) {
    const id = text(payout?.id);
    const key = id || `missing-id:${byId.size}`;
    const previous = byId.get(key);
    if (previous && payoutFingerprint(previous) !== payoutFingerprint(payout)) conflicts.add(key);
    if (!previous) byId.set(key, payout);
    for (const jobId of Array.isArray(payout?.jobIds) ? new Set(payout.jobIds) : []) {
      if (!byJob.has(jobId)) byJob.set(jobId, new Set());
      byJob.get(jobId).add(key);
    }
  }
  return { byId, byJob, conflicts };
}

function payoutEvidence(job, payoutCents, index, organizationId, complete) {
  const unknown = (reason) => ({ status: "UNKNOWN", paidCents: null, outstandingCents: null, reason });
  if (isAssignmentAwareJob(job)) return unknown("v2_payout_untracked");
  if (!complete) return unknown("payout_lookup_incomplete");
  const references = [...(index.byJob.get(job.id) || [])];
  const linkedId = text(job.payoutId);
  if (!linkedId && references.length === 0) {
    if (job.payoutPaidAt) return unknown("payout_link_missing");
    if (job.legacyPayoutEligible === true && payoutCents !== null) {
      return { status: "OUTSTANDING", paidCents: 0, outstandingCents: payoutCents };
    }
    return unknown("payout_status_unknown");
  }
  if (!linkedId) return unknown("payout_link_conflict");
  if (references.length > 1 || index.conflicts.has(linkedId)) return unknown("payout_link_conflict");
  const payout = index.byId.get(linkedId);
  if (!payout) return unknown("payout_link_missing");
  if (references.length !== 1 || references[0] !== linkedId || !Array.isArray(payout.jobIds)
    || payout.jobIds.filter((id) => id === job.id).length !== 1) {
    return unknown("payout_link_conflict");
  }
  // Existing payouts can group Jobs but contain no immutable per-Job allocation.
  // Never distribute or multiply a batch amount to manufacture a paid line item.
  if (payout.jobIds.length !== 1) return unknown("payout_batch_allocation_unknown");
  if (payout.organizationId !== organizationId || !text(job.assignedCleanerId)
    || payout.cleanerId !== job.assignedCleanerId || payout.status !== "PAID"
    || timestamp(payout.paidAt) === null) return unknown("payout_evidence_invalid");
  const recordedAmount = money(payout.amount).cents;
  if (recordedAmount === null || payoutCents === null) return unknown("payout_evidence_invalid");
  if (recordedAmount !== payoutCents) return unknown("payout_amount_mismatch");
  return { status: "PAID", paidCents: recordedAmount, outstandingCents: 0 };
}

function totals(rows) {
  const sum = (field) => {
    const total = rows.reduce((value, row) => value + (row[field] ?? 0), 0);
    return Number.isSafeInteger(total) ? total : null;
  };
  const clientComplete = rows.every((row) => row.clientCents !== null);
  const payoutComplete = rows.every((row) => row.payoutCents !== null);
  const stateComplete = rows.every((row) => row.payoutStatus !== "UNKNOWN");
  return {
    completedServiceCount: rows.length,
    clientCharges: clientComplete ? dollars(sum("clientCents")) : null,
    cleanerPayoutTotal: payoutComplete ? dollars(sum("payoutCents")) : null,
    cleanerPaidTotal: stateComplete ? dollars(sum("paidCents")) : null,
    cleanerOutstandingTotal: stateComplete ? dollars(sum("outstandingCents")) : null,
    grossOperationalMargin: clientComplete && payoutComplete ? dollars(sum("marginCents")) : null,
    knownClientCharges: dollars(sum("clientCents")),
    knownCleanerPayoutTotal: dollars(sum("payoutCents")),
    knownCleanerPaidTotal: dollars(sum("paidCents")),
    knownCleanerOutstandingTotal: dollars(sum("outstandingCents")),
    knownGrossOperationalMargin: dollars(sum("marginCents")),
    missingClientPriceCount: rows.filter((row) => row.clientCents === null).length,
    missingCleanerPayoutCount: rows.filter((row) => row.payoutCents === null).length,
    missingGrossMarginCount: rows.filter((row) => row.clientCents === null || row.payoutCents === null).length,
    unknownPayoutCount: rows.filter((row) => row.payoutStatus === "UNKNOWN").length,
    attentionCount: rows.filter((row) => row.attentionReasons.length > 0).length,
  };
}

function publicRow(row) {
  return {
    id: row.id, clientId: row.clientId, clientName: row.clientName,
    propertyName: row.propertyName, serviceDate: row.serviceDate,
    cleanerNames: row.cleanerNames, clientCharge: dollars(row.clientCents),
    cleanerPayout: dollars(row.payoutCents), payoutStatus: row.payoutStatus,
    paidAmount: dollars(row.paidCents), outstandingAmount: dollars(row.outstandingCents),
    grossOperationalMargin: dollars(row.marginCents), attentionReasons: row.attentionReasons,
  };
}

/** A read-only, allowlisted reconciliation view; it never infers client payments. */
export function buildWeeklyClose({
  weekStart, jobs = [], payouts = [], clients, properties = [], cleanerNamesById = {},
  organizationId = "cleanflow-demo", payoutLookupComplete = true,
}) {
  const week = serviceWeekForDate(weekStart);
  const clientsById = new Map((clients || []).map((client) => [client.id, client]));
  const propertiesById = new Map(properties.map((property) => [property.id, property]));
  const excluded = {
    DEMO: 0, UNKNOWN: 0, archived: 0, nonCompleted: 0, outsideWeek: 0,
    invalidDate: 0, foreignOrganization: 0, missingId: 0, conflictingDuplicate: 0,
  };
  const unique = new Map();
  const conflicts = new Set();
  let duplicateInputCount = 0;
  for (const job of jobs) {
    const id = text(job?.id);
    if (!id) { excluded.missingId += 1; continue; }
    if (unique.has(id)) {
      duplicateInputCount += 1;
      if (jobFingerprint(unique.get(id)) !== jobFingerprint(job)) conflicts.add(id);
    } else unique.set(id, job);
  }
  const index = payoutIndex(payouts);
  const rows = [];
  for (const [id, job] of unique) {
    if (conflicts.has(id)) { excluded.conflictingDuplicate += 1; continue; }
    if (job.organizationId && job.organizationId !== organizationId) {
      excluded.foreignOrganization += 1; continue;
    }
    const provenance = normalizeDataProvenance(job);
    if (provenance !== "REAL") { excluded[provenance] += 1; continue; }
    if (job.archivedAt) { excluded.archived += 1; continue; }
    if (job.operationalStatus !== "COMPLETED") { excluded.nonCompleted += 1; continue; }
    if (dateNumber(job.scheduledDate) === null) { excluded.invalidDate += 1; continue; }
    if (job.scheduledDate < week.start || job.scheduledDate > week.end) {
      excluded.outsideWeek += 1; continue;
    }
    const clientId = text(job.clientId);
    const clientName = text(job.clientName) || text(clientsById.get(clientId)?.name);
    const propertyName = text(job.propertyName) || text(propertiesById.get(job.propertyId)?.name);
    const client = money(job.clientPrice);
    const payout = money(job.cleanerPayout);
    const evidence = payoutEvidence(job, payout.cents, index, organizationId, payoutLookupComplete);
    const cleanerIds = isAssignmentAwareJob(job) ? getAssignedCleanerIds(job)
      : [text(job.assignedCleanerId)].filter(Boolean);
    const cleanerNames = cleanerIds.map((cleanerId) => text(cleanerNamesById[cleanerId])
      || (!isAssignmentAwareJob(job) ? text(job.assignedCleanerName) : "")).filter(Boolean);
    const attentionReasons = [];
    if (client.state !== "valid") attentionReasons.push(`${client.state}_client_price`);
    if (payout.state !== "valid") attentionReasons.push(`${payout.state}_cleaner_payout`);
    if (!clientId) attentionReasons.push("missing_client_association");
    if (clientId && clients && !clientsById.has(clientId)) attentionReasons.push("client_link_unresolved");
    const propertyClientId = text(propertiesById.get(job.propertyId)?.clientId);
    if (clientId && propertyClientId && clientId !== propertyClientId) attentionReasons.push("client_property_link_conflict");
    if (!clientName) attentionReasons.push("missing_client_name");
    if (cleanerNames.length < cleanerIds.length || cleanerIds.length === 0) {
      attentionReasons.push("missing_cleaner_name");
    }
    if (evidence.reason) attentionReasons.push(evidence.reason);
    rows.push({
      id, clientId, clientName, propertyName, serviceDate: job.scheduledDate, cleanerNames,
      clientCents: client.cents, payoutCents: payout.cents,
      marginCents: client.cents === null || payout.cents === null ? null : client.cents - payout.cents,
      payoutStatus: evidence.status, paidCents: evidence.paidCents,
      outstandingCents: evidence.outstandingCents, attentionReasons,
    });
  }
  rows.sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.id.localeCompare(b.id));
  const groups = new Map();
  for (const row of rows) {
    // A legacy name snapshot is never fuzzy-matched to a canonical Client.
    const key = row.clientId ? `id:${row.clientId}` : `snapshot:${row.clientName}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const clientGroups = [...groups.entries()].map(([key, group]) => ({
    key, clientId: group[0].clientId, clientName: group[0].clientName,
    legacySnapshot: !group[0].clientId, ...totals(group), serviceCount: group.length,
    jobs: group.map(publicRow),
  })).sort((a, b) => a.clientName.localeCompare(b.clientName) || a.key.localeCompare(b.key));
  const overall = totals(rows);
  // Contradictory IDs are deliberately omitted, not counted as zero dollars.
  // Known subtotals still reconcile to the displayed rows, but a full-week total
  // cannot be certified until the conflicting source record is reviewed.
  if (excluded.conflictingDuplicate > 0 || excluded.missingId > 0) {
    for (const field of ["clientCharges", "cleanerPayoutTotal", "cleanerPaidTotal",
      "cleanerOutstandingTotal", "grossOperationalMargin"]) overall[field] = null;
  }
  return {
    week, jobs: rows.map(publicRow), clients: clientGroups, overall,
    excluded, duplicateInputCount,
  };
}

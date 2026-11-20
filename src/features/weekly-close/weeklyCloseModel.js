import { normalizeDataProvenance } from "../../lib/dataProvenance.js";
import { getAssignedCleanerIds, isAssignmentAwareJob } from "../jobs/jobCompatibility.js";

import { billableMinutes, hourlyAmountCents, PRICING_HOURLY } from "../billing/billingStatementModel.js";
import { payoutTimestamp, recordedShareCents } from "../payouts/payoutReceipt.js";
import { fixedPayoutShares, payoutNeedsHoursReview } from "../payouts/payoutShares.js";
import { resolveJobPricing } from "../pricing/pricingModel.js";

const dayMilliseconds = 86_400_000;
export const maxServicePeriodDays = 31;
const text = (value) => typeof value === "string" ? value.trim() : "";

function dateNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const number = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(number) && new Date(number).toISOString().slice(0, 10) === value
    ? number : null;
}

const dateString = (value) => new Date(value).toISOString().slice(0, 10);

export function servicePeriod({ start, end }) {
  const firstDay = dateNumber(start);
  const lastDay = dateNumber(end);
  if (firstDay === null || lastDay === null || lastDay < firstDay || lastDay - firstDay >= maxServicePeriodDays * dayMilliseconds) {
    throw new RangeError("A valid service period of up to 31 days is required.");
  }
  return { start, end };
}

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

// Only reconciliation-relevant fields participate in duplicate comparison;
// private notes/contacts/access information never enter this projection.
function jobFingerprint(job) {
  return JSON.stringify([
    job.organizationId, normalizeDataProvenance(job), Boolean(job.archivedAt),
    job.operationalStatus, job.scheduledDate, job.clientId, job.clientName,
    job.propertyId, job.propertyName, job.schemaVersion, job.assignedCleanerId,
    job.assignedCleanerName, getAssignedCleanerIds(job),
    money(job.clientPrice), money(job.cleanerPayout), job.payoutId,
    job.billing?.mode, job.billing?.hourlyRateCents, billableMinutes(job.billing?.hours),
    job.pay?.mode, job.pay?.rateCents, job.pay?.perCleanerCents, sortedEntries(job.payoutIdsByCleaner),
    sortedEntries(job.payoutAgreementsByCleaner),
    Boolean(job.payoutPaidAt), payoutTimestamp(job.payoutPaidAt), job.legacyPayoutEligible === true,
  ]);
}

function sortedEntries(map) {
  return map && typeof map === "object" ? Object.entries(map).sort(([a], [b]) => a.localeCompare(b)) : map;
}

function payoutFingerprint(payout) {
  return JSON.stringify([
    payout.organizationId, payout.cleanerId, payout.status, payout.jobIds,
    money(payout.amount), payoutTimestamp(payout.paidAt), sortedEntries(payout.jobAmountsCents),
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

const unknown = reason => ({ status: "UNKNOWN", paidCents: null, outstandingCents: null, reason });

function teamPayoutEvidence(job, shares, index, organizationId, complete) {
  if (!complete) return unknown("payout_lookup_incomplete");
  const links = job.payoutIdsByCleaner;
  const references = index.byJob.get(job.id) ?? new Set();
  if (!links && !references.size) return unknown("v2_payout_untracked");
  if (!shares.length || !links || typeof links !== "object" || Array.isArray(links)
    || job.payoutId || job.payoutPaidAt) return unknown("payout_link_conflict");
  const linked = Object.entries(links);
  if (!linked.length || linked.length !== references.size
    || linked.some(([cleanerId, id]) => !shares.some(share => share.cleanerId === cleanerId)
      || !references.has(id) || index.conflicts.has(id))) return unknown("payout_link_conflict");
  const paidByCleaner = new Map();
  let paidCents = 0;
  let outstandingCents = 0;
  let mismatch = false;
  let unknownOutstanding = false;
  for (const { cleanerId, cents } of shares) {
    if (!Object.hasOwn(links, cleanerId)) {
      if (cents === null) unknownOutstanding = true;
      else outstandingCents += cents;
      continue;
    }
    const payout = index.byId.get(links[cleanerId]);
    if (!payout || payout.organizationId !== organizationId || payout.cleanerId !== cleanerId
      || payout.status !== "PAID" || payoutTimestamp(payout.paidAt) === null || !payout.jobAmountsCents
      || !Array.isArray(payout.jobIds) || !payout.jobIds.includes(job.id)) return unknown("payout_evidence_invalid");
    const recorded = recordedShareCents(payout, job.id);
    if (recorded === null) return unknown("payout_evidence_invalid");
    paidByCleaner.set(cleanerId, recorded);
    paidCents += recorded;
    if (cents !== null && recorded !== cents) mismatch = true;
  }
  // An edited or inconsistent agreement cannot change what its linked receipt actually paid.
  return { status: mismatch || unknownOutstanding ? "UNKNOWN" : outstandingCents ? "OUTSTANDING" : "PAID",
    paidCents, outstandingCents: unknownOutstanding ? null : outstandingCents, paidByCleaner, ...(mismatch && { reason: "payout_amount_mismatch" }) };
}

function payoutEvidence(job, payoutCents, index, organizationId, complete) {
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
  // Historical batches without explicit line amounts cannot prove a per-Job payment.
  if (payout.jobIds.length !== 1 && !payout.jobAmountsCents) return unknown("payout_batch_allocation_unknown");
  if (payout.organizationId !== organizationId || !text(job.assignedCleanerId)
    || payout.cleanerId !== job.assignedCleanerId || payout.status !== "PAID"
    || payoutTimestamp(payout.paidAt) === null) return unknown("payout_evidence_invalid");
  const recordedAmount = recordedShareCents(payout, job.id);
  if (recordedAmount === null || payoutCents === null) return unknown("payout_evidence_invalid");
  if (recordedAmount !== payoutCents) return unknown("payout_amount_mismatch");
  return { status: "PAID", paidCents: recordedAmount, outstandingCents: 0 };
}

function totals(rows, truncated = false) {
  const onlyPendingHours = rows.length > 0 && rows.every((row) => row.attentionReasons.includes("hours_review"));
  const sum = (field) => {
    if (onlyPendingHours && rows.every((row) => row[field] === null)) return null;
    const total = rows.reduce((value, row) => value + (row[field] ?? 0), 0);
    return Number.isSafeInteger(total) ? total : null;
  };
  const clientComplete = !truncated && rows.every((row) => row.clientCents !== null);
  const payoutComplete = !truncated && rows.every((row) => row.payoutCents !== null);
  const stateComplete = !truncated && rows.every((row) => row.payoutStatus !== "UNKNOWN");
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
    cleanerNames: row.cleanerNames, cleanerShares: row.cleanerShares, clientCharge: dollars(row.clientCents),
    cleanerPayout: dollars(row.payoutCents), payoutStatus: row.payoutStatus,
    paidAmount: dollars(row.paidCents), outstandingAmount: dollars(row.outstandingCents),
    grossOperationalMargin: dollars(row.marginCents), attentionReasons: row.attentionReasons,
  };
}

/** A read-only, allowlisted reconciliation view; it never infers client payments. */
export function buildWeeklyClose({
  weekStart, period = serviceWeekForDate(weekStart), jobs = [], payouts = [], clients, properties = [], cleanerNamesById = {},
  organizationId = "cleanflow-demo", payoutLookupComplete = true, coverage,
}) {
  const dates = servicePeriod(period);
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
    if (job.scheduledDate < dates.start || job.scheduledDate > dates.end) {
      excluded.outsideWeek += 1; continue;
    }
    const clientId = text(job.clientId);
    const clientName = text(job.clientName) || text(clientsById.get(clientId)?.name);
    const propertyName = text(job.propertyName) || text(propertiesById.get(job.propertyId)?.name);
    const pendingHours = payoutNeedsHoursReview(job);
    let client = money(job.clientPrice);
    let payout = money(job.cleanerPayout);
    if (pendingHours) {
      client = payout = { cents: null, state: "pending" };
    } else if (job.billing?.mode === PRICING_HOURLY) {
      const rate = resolveJobPricing(job).client;
      client = {
        cents: hourlyAmountCents(rate.rateCents, billableMinutes(job.billing.hours)),
        state: rate.state === "ready" ? "valid" : "missing",
      };
    }
    const shares = fixedPayoutShares(job);
    if (!pendingHours && shares.length) {
      payout = shares.every(share => share.cents !== null)
        ? { cents: shares.reduce((sum, share) => sum + share.cents, 0), state: "valid" }
        : { cents: null, state: payout.state === "invalid" ? "invalid" : "missing" };
    }
    else if (!pendingHours && job.pay?.mode === "FIXED" && Object.hasOwn(job.pay, "perCleanerCents")) {
      payout = { cents: null, state: "invalid" };
    }
    let evidence;
    if (isAssignmentAwareJob(job) && (!pendingHours || job.payoutIdsByCleaner || index.byJob.has(id))) {
      evidence = teamPayoutEvidence(job, shares, index, organizationId, payoutLookupComplete);
    } else if (pendingHours) {
      evidence = unknown();
    } else {
      evidence = payoutEvidence(job, payout.cents, index, organizationId, payoutLookupComplete);
    }
    const cleanerIds = isAssignmentAwareJob(job) ? getAssignedCleanerIds(job)
      : [text(job.assignedCleanerId)].filter(Boolean);
    const cleanerNames = cleanerIds.map((cleanerId) => text(cleanerNamesById[cleanerId])
      || (!isAssignmentAwareJob(job) ? text(job.assignedCleanerName) : "")).filter(Boolean);
    const cleanerShares = shares.map(({ cleanerId, cents }) => ({
      name: text(cleanerNamesById[cleanerId]) || (!isAssignmentAwareJob(job) ? text(job.assignedCleanerName) : ""),
      amount: dollars(cents),
      paidAmount: evidence.paidByCleaner?.has(cleanerId) ? dollars(evidence.paidByCleaner.get(cleanerId)) : null,
    }));
    const attentionReasons = [];
    if (!pendingHours && client.state !== "valid") attentionReasons.push(`${client.state}_client_price`);
    if (!pendingHours && payout.state !== "valid") attentionReasons.push(`${payout.state}_cleaner_payout`);
    if (!clientId) attentionReasons.push("missing_client_association");
    if (clientId && clients && !clientsById.has(clientId)) attentionReasons.push("client_link_unresolved");
    const propertyClientId = text(propertiesById.get(job.propertyId)?.clientId);
    if (clientId && propertyClientId && clientId !== propertyClientId) attentionReasons.push("client_property_link_conflict");
    if (!clientName) attentionReasons.push("missing_client_name");
    if (cleanerNames.length < cleanerIds.length || cleanerIds.length === 0) {
      attentionReasons.push("missing_cleaner_name");
    }
    if (pendingHours) attentionReasons.push("hours_review");
    if (evidence.reason) attentionReasons.push(evidence.reason);
    rows.push({
      id, clientId, clientName, propertyName, serviceDate: job.scheduledDate, cleanerNames, cleanerShares,
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
    legacySnapshot: !group[0].clientId, ...totals(group, coverage?.truncated), serviceCount: group.length,
    jobs: group.map(publicRow),
  })).sort((a, b) => a.clientName.localeCompare(b.clientName) || a.key.localeCompare(b.key));
  const overall = totals(rows, coverage?.truncated);
  // Contradictory IDs are deliberately omitted, not counted as zero dollars.
  // Known subtotals still reconcile to the displayed rows, but a full-week total
  // cannot be certified until the conflicting source record is reviewed.
  if (excluded.conflictingDuplicate > 0 || excluded.missingId > 0) {
    for (const field of ["clientCharges", "cleanerPayoutTotal", "cleanerPaidTotal",
      "cleanerOutstandingTotal", "grossOperationalMargin"]) overall[field] = null;
  }
  return {
    period: dates, coverage, jobs: rows.map(publicRow), clients: clientGroups, overall,
    excluded, duplicateInputCount,
  };
}

// Billing Statement V0 — pure model, no Firestore. See docs/BILLING_STATEMENT_V0.md.
// All money is integer US cents. Nothing here infers hours from timestamps,
// invents a price, or marks anything as paid without a recorded payment.

export const PRICING_FIXED = "FIXED";
export const PRICING_HOURLY = "HOURLY";

const minutesPerHour = 60;
const maxLineCents = 10_000_000; // US$ 100,000 per line is far beyond any cleaning.

const text = (value) => (typeof value === "string" ? value.trim() : "");

/** Dollars (number, as stored on Jobs today) → cents, or null when absent/invalid. */
export function centsFromDollars(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-6 || cents > maxLineCents) return null;
  return cents;
}

function validCents(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maxLineCents ? value : null;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** "HH:MM" → minutes after midnight, or null. */
function clockMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(text(value));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * minutesPerHour + minutes : null;
}

/**
 * Manager-approved billable minutes for an hourly Job. Start/end are entered or
 * confirmed by the manager; an explicit approvedMinutes wins. Rounding up to
 * the next block (for example 15 min) is a client policy, never a default.
 */
export function billableMinutes(hours, { roundUpToMinutes = 1 } = {}) {
  if (!hours || hours.approved !== true) return null;
  let minutes = Number.isSafeInteger(hours.approvedMinutes) ? hours.approvedMinutes : null;
  if (minutes === null) {
    const start = clockMinutes(hours.start);
    const end = clockMinutes(hours.end);
    if (start === null || end === null || end <= start) return null;
    minutes = end - start - (Number.isSafeInteger(hours.breakMinutes) && hours.breakMinutes > 0 ? hours.breakMinutes : 0);
  }
  if (minutes <= 0 || minutes > 24 * minutesPerHour) return null;
  const block = Number.isSafeInteger(roundUpToMinutes) && roundUpToMinutes > 0 ? roundUpToMinutes : 1;
  return Math.ceil(minutes / block) * block;
}

/** rate (cents per hour) × minutes, rounded half-up to the cent. */
export function hourlyAmountCents(rateCents, minutes) {
  if (validCents(rateCents) === null || !Number.isSafeInteger(minutes) || minutes <= 0) return null;
  return Math.floor((rateCents * minutes + minutesPerHour / 2) / minutesPerHour);
}

/**
 * One statement line from a completed Job, its Property and its billing
 * fields. Returns { line } or { pending: reason } — a missing price or hours
 * stays visible as "needs review", never as zero.
 */
export function statementLine({ job, property, policy = {} }) {
  const billing = job?.billing || {};
  const mode = billing.mode === PRICING_HOURLY ? PRICING_HOURLY : PRICING_FIXED;
  const base = {
    jobId: job.id,
    date: job.scheduledDate,
    propertyName: text(property?.name) || text(job.propertyName),
    address: text(property?.address),
    mode,
  };
  if (!base.address) return { pending: "address_missing", ...base };

  let baseCents;
  let minutes = null;
  let rateCents = null;
  if (mode === PRICING_HOURLY) {
    rateCents = validCents(billing.hourlyRateCents ?? centsFromDollars(property?.defaultHourlyRate));
    if (rateCents === null) return { pending: "hourly_rate_missing", ...base };
    minutes = billableMinutes(billing.hours, policy);
    if (minutes === null) return { pending: "hours_not_approved", ...base };
    baseCents = hourlyAmountCents(rateCents, minutes);
  } else {
    baseCents = centsFromDollars(job.clientPrice);
    if (baseCents === null) return { pending: "price_missing", ...base };
  }

  const fees = [];
  for (const fee of Array.isArray(billing.additionalFees) ? billing.additionalFees : []) {
    const cents = validCents(fee?.amountCents);
    const reason = text(fee?.reason);
    if (cents === null || cents === 0) return { pending: "fee_invalid", ...base };
    if (!reason) return { pending: "fee_reason_missing", ...base };
    fees.push({ amountCents: cents, reason });
  }
  const feeCents = fees.reduce((sum, fee) => sum + fee.amountCents, 0);
  return {
    line: {
      ...base,
      ...(mode === PRICING_HOURLY ? { minutes, rateCents } : {}),
      baseCents,
      fees,
      feeCents,
      totalCents: baseCents + feeCents,
    },
  };
}

/**
 * Draft statement for one client and one service period (inclusive dates).
 * Only completed, non-archived Jobs of this client whose Property currently
 * belongs to the client are eligible. Jobs already on an issued statement are
 * listed as excluded so nothing is billed twice.
 */
export function buildStatementDraft({ client, period, jobs, properties, billedJobIds = new Set(), policy = {} }) {
  if (!client?.id) throw new RangeError("A client is required.");
  if (!validDate(period?.start) || !validDate(period?.end) || period.start > period.end) {
    throw new RangeError("A valid service period is required.");
  }
  const propertyById = new Map((properties || []).map((property) => [property.id, property]));
  const lines = [];
  const pending = [];
  const excluded = [];
  for (const job of jobs || []) {
    if (job?.clientId !== client.id) continue;
    if (!validDate(job.scheduledDate) || job.scheduledDate < period.start || job.scheduledDate > period.end) continue;
    if (job.archivedAt) { excluded.push({ jobId: job.id, reason: "archived" }); continue; }
    if (job.operationalStatus !== "COMPLETED") { excluded.push({ jobId: job.id, reason: "not_completed" }); continue; }
    if (billedJobIds.has(job.id)) { excluded.push({ jobId: job.id, reason: "already_billed" }); continue; }
    const property = propertyById.get(job.propertyId);
    if (!property || property.clientId !== client.id) { excluded.push({ jobId: job.id, reason: "property_not_client" }); continue; }
    const result = statementLine({ job, property, policy });
    if (result.line) lines.push(result.line);
    else pending.push(result);
  }
  const byDate = (a, b) => a.date.localeCompare(b.date) || a.propertyName.localeCompare(b.propertyName) || String(a.jobId).localeCompare(String(b.jobId));
  lines.sort(byDate);
  pending.sort(byDate);
  const subtotalCents = lines.reduce((sum, line) => sum + line.baseCents, 0);
  const feeCents = lines.reduce((sum, line) => sum + line.feeCents, 0);
  return {
    clientId: client.id,
    clientName: text(client.name),
    period: { start: period.start, end: period.end },
    lines,
    pending,
    excluded,
    subtotalCents,
    feeCents,
    totalCents: subtotalCents + feeCents,
    // A statement can only be issued when nothing in the period still needs review.
    readyToIssue: lines.length > 0 && pending.length === 0,
  };
}

/**
 * Freeze a reviewed draft. The issued snapshot never changes afterwards; a
 * correction voids it and issues a new one (see the design doc).
 */
export function issueStatement(draft, { number, issuedAt, issuedByUid }) {
  if (!draft?.readyToIssue) throw new RangeError("The statement still has items that need review.");
  if (!text(number) || !text(issuedByUid) || !(issuedAt instanceof Date)) {
    throw new RangeError("Number, issuer and issue time are required.");
  }
  return Object.freeze({
    status: "ISSUED",
    number: text(number),
    issuedAt: issuedAt.toISOString(),
    issuedByUid: text(issuedByUid),
    clientId: draft.clientId,
    clientName: draft.clientName,
    period: { ...draft.period },
    lines: draft.lines.map((line) => ({ ...line, fees: line.fees.map((fee) => ({ ...fee })) })),
    jobIds: draft.lines.map((line) => line.jobId),
    subtotalCents: draft.subtotalCents,
    feeCents: draft.feeCents,
    totalCents: draft.totalCents,
  });
}

/**
 * Balance from recorded client payments allocated to this statement. Payment
 * state is independent of delivery state and of cleaner payouts (DEC-020/028).
 */
export function statementBalance(statement, payments = []) {
  const ids = new Set();
  let paidCents = 0;
  for (const payment of payments) {
    if (!payment?.id || ids.has(payment.id)) continue; // a replayed receipt counts once
    if (payment.statementNumber !== statement.number || payment.voided === true) continue;
    const cents = validCents(payment.amountCents);
    if (cents === null || cents === 0) continue;
    ids.add(payment.id);
    paidCents += cents;
  }
  const balanceCents = statement.totalCents - paidCents;
  const status = paidCents === 0 ? "UNPAID"
    : balanceCents > 0 ? "PARTIALLY_PAID"
      : balanceCents === 0 ? "PAID" : "OVERPAID";
  return { paidCents, balanceCents, status };
}

/** Plain-text summary for a manager-sent WhatsApp message (no addresses, no links). */
export function statementMessage(statement, { formatMoney, formatDate }) {
  const count = statement.lines.length;
  return [
    `Hi ${statement.clientName || "there"}!`,
    `Here is your cleaning statement ${statement.number} for ${formatDate(statement.period.start)} – ${formatDate(statement.period.end)}.`,
    `${count} ${count === 1 ? "cleaning" : "cleanings"} · Total ${formatMoney(statement.totalCents)}`,
  ].join("\n");
}

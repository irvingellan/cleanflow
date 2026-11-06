import { FieldValue } from "firebase-admin/firestore";
import { publicOfferState } from "./publicOfferResponseService.js";
import { FIRST_ACCEPT_WINS, isAutomaticOfferJob } from "./firstAcceptWins.js";

/**
 * Cleaner agenda projection (Cleaner Hub V1).
 *
 * Jobs, Offers and Assignments stay the source of truth. This module derives a
 * minimal, cleaner-safe read model at organizations/{org}/cleanerAgenda that a
 * signed-in cleaner may read for herself only (see firestore.rules). It never
 * copies client prices, Job-level payouts, notes, guest names, access codes or
 * other cleaners' identities. Every sync re-reads the current Job state inside
 * one transaction, so out-of-order triggers converge on the same result.
 */

export const cleanerAgendaCollection = "cleanerAgenda";
export const agendaKinds = Object.freeze({ assigned: "ASSIGNED", offer: "OFFER", change: "CHANGE" });
export const agendaChanges = Object.freeze({
  assigned: "ASSIGNED",
  rescheduled: "RESCHEDULED",
  unassigned: "UNASSIGNED",
  cancelled: "CANCELLED",
});

const assignedStatuses = ["ASSIGNED", "IN_PROGRESS", "COMPLETED"];
const visibleOfferStatuses = ["PENDING", "INTERESTED"];

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !value.includes("/");
}

function text(value, maximum = 160) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maximum) : null;
}

function dateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function timeKey(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : null;
}

function revision(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function isAssignmentAwareJobData(job) {
  return Number.isInteger(job?.schemaVersion) && job.schemaVersion >= 2;
}

/** Cleaners currently on the Job roster, using the same rule as checklist access. */
export function rosterCleanerIds(job) {
  if (!job || job.archivedAt) return [];
  if (isAssignmentAwareJobData(job)) {
    return [...new Set((Array.isArray(job.assignedCleanerIds) ? job.assignedCleanerIds : []).filter(validId))];
  }
  return validId(job.assignedCleanerId) && assignedStatuses.includes(job.operationalStatus)
    ? [job.assignedCleanerId]
    : [];
}

/** Same per-recipient amount rule as the public Offer projection. */
export function offeredCompensationFor(offer, job) {
  const value = Object.prototype.hasOwnProperty.call(offer || {}, "offeredCompensation")
    ? offer.offeredCompensation
    : !isAssignmentAwareJobData(job) ? job?.cleanerPayout : null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function baseEntry(organizationId, jobId, cleanerId, job) {
  return {
    organizationId,
    cleanerId,
    jobId,
    jobStatus: typeof job.operationalStatus === "string" ? job.operationalStatus : "UNKNOWN",
    scheduledDate: dateKey(job.scheduledDate),
    scheduledStart: timeKey(job.scheduledStart),
    propertyName: text(job.propertyName),
    scheduleRevision: revision(job.scheduleRevision),
  };
}

/**
 * Pure projection: which cleaners may see this Job, and what they may see.
 * @returns {Map<string, object>} cleanerId -> entry (without server timestamps)
 */
export function computeAgendaEntries({ organizationId, jobId, job, offers = [], assignments = [], now = new Date() }) {
  const entries = new Map();
  if (!job || job.archivedAt) return entries;
  const roster = rosterCleanerIds(job);
  for (const cleanerId of roster) {
    const assignment = assignments.find((item) => item?.cleanerId === cleanerId && item?.isActive === true);
    entries.set(cleanerId, {
      ...baseEntry(organizationId, jobId, cleanerId, job),
      kind: agendaKinds.assigned,
      acknowledged: Boolean(assignment?.cleanerAcknowledgedAt),
      offerStatus: null,
      offeredCompensation: null,
    });
  }
  for (const offer of offers) {
    const cleanerId = offer?.cleanerId;
    if (!validId(cleanerId) || entries.has(cleanerId)) continue;
    // Keep a closed automatic Offer visible only to its original recipient
    // through the invitation window, without reopening it or exposing the winner.
    const automatic = isAutomaticOfferJob(offer);
    if (automatic && offer.jobId !== jobId) continue;
    if (!visibleOfferStatuses.includes(offer.status)) continue;
    const expiry = offer.publicOfferExpiresAt;
    const offerExpiresAtMs = typeof expiry?.toMillis === "function" ? expiry.toMillis() : null;
    if (!Number.isFinite(offerExpiresAtMs)) continue;
    const state = publicOfferState(offer, job, now);
    if (state !== "available" && state !== "already-taken") continue;
    const closed = state === "already-taken";
    // A former automatic invite recipient is not entitled to learn later Job
    // changes. A manual Offer has no snapshot; it keeps the details she had.
    const details = closed && automatic ? {
      operationalStatus: "OFFERED",
      propertyName: offer.offeredPropertyName,
      scheduledDate: offer.offeredScheduledDate,
      scheduledStart: offer.offeredScheduledStart,
    } : closed ? { ...job, operationalStatus: "OFFERED" } : job;
    entries.set(cleanerId, {
      ...baseEntry(organizationId, jobId, cleanerId, details),
      kind: agendaKinds.offer,
      acknowledged: false,
      offerStatus: closed ? "ALREADY_TAKEN" : offer.status,
      offerExpiresAtMs,
      offeredCompensation: offeredCompensationFor(offer, job),
      ...(automatic ? { offerDistributionMode: FIRST_ACCEPT_WINS } : {}),
    });
  }
  return entries;
}

export function agendaEntryId(cleanerId, jobId) {
  return `${cleanerId}__${jobId}`;
}

const comparedFields = [
  "organizationId", "cleanerId", "jobId", "kind", "jobStatus", "scheduledDate", "scheduledStart",
  "propertyName", "scheduleRevision", "acknowledged", "offerStatus", "offeredCompensation", "offerExpiresAtMs",
  "offerDistributionMode",
];

export function sameEntry(previous, next) {
  return Boolean(previous) && comparedFields.every((field) => (previous[field] ?? null) === (next[field] ?? null));
}

/**
 * Change notices the cleaner keeps after a Job leaves or moves on her agenda.
 * Removed/cancelled notices carry no Job ID, so the Job itself stays private.
 */
export function planAgendaChanges(previousEntries, nextEntries, { job, suppressNotices = false }) {
  if (suppressNotices) return [];
  const changes = [];
  for (const [cleanerId, previous] of previousEntries) {
    if (previous.kind !== agendaKinds.assigned) continue;
    const next = nextEntries.get(cleanerId);
    if (!next || next.kind !== agendaKinds.assigned) {
      changes.push({
        cleanerId,
        change: !job || job.archivedAt ? agendaChanges.cancelled : agendaChanges.unassigned,
        propertyName: previous.propertyName ?? null,
        from: { date: previous.scheduledDate ?? null, start: previous.scheduledStart ?? null },
        to: null,
        openJobId: null,
      });
    } else if (previous.scheduledDate !== next.scheduledDate || (previous.scheduledStart ?? null) !== (next.scheduledStart ?? null)) {
      changes.push({
        cleanerId,
        change: agendaChanges.rescheduled,
        propertyName: next.propertyName,
        from: { date: previous.scheduledDate ?? null, start: previous.scheduledStart ?? null },
        to: { date: next.scheduledDate, start: next.scheduledStart },
        openJobId: next.jobId,
      });
    }
  }
  for (const [cleanerId, next] of nextEntries) {
    const previous = previousEntries.get(cleanerId);
    if (next.kind === agendaKinds.assigned && previous?.kind !== agendaKinds.assigned) {
      changes.push({
        cleanerId,
        change: agendaChanges.assigned,
        propertyName: next.propertyName,
        from: null,
        to: { date: next.scheduledDate, start: next.scheduledStart },
        openJobId: next.jobId,
      });
    }
  }
  return changes;
}

/** Re-derives every cleaner entry for one Job from current source records. */
export async function syncCleanerAgendaForJob(database, {
  organizationId,
  jobId,
  now = () => new Date(),
  suppressNotices = false,
}) {
  if (!validId(organizationId) || !validId(jobId)) return { written: 0, deleted: 0, changes: 0 };
  const organization = database.collection("organizations").doc(organizationId);
  const jobRef = organization.collection("jobs").doc(jobId);
  const agenda = organization.collection(cleanerAgendaCollection);

  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, offersSnapshot, assignmentsSnapshot, existingSnapshot] = await Promise.all([
      transaction.get(jobRef),
      transaction.get(jobRef.collection("offers")),
      transaction.get(jobRef.collection("assignments").where("isActive", "==", true)),
      transaction.get(agenda.where("jobId", "==", jobId)),
    ]);
    const job = jobSnapshot.exists ? jobSnapshot.data() : null;
    const current = typeof now === "function" ? now() : now;
    const next = computeAgendaEntries({
      organizationId,
      jobId,
      job,
      offers: offersSnapshot.docs.map((snapshot) => snapshot.data()),
      assignments: assignmentsSnapshot.docs.map((snapshot) => snapshot.data()),
      now: current,
    });
    const previous = new Map();
    const previousRefs = new Map();
    for (const snapshot of existingSnapshot.docs) {
      const data = snapshot.data();
      if (data.kind === agendaKinds.change || !validId(data.cleanerId)) continue;
      previous.set(data.cleanerId, data);
      previousRefs.set(data.cleanerId, snapshot.ref);
    }

    let written = 0;
    let deleted = 0;
    for (const [cleanerId, entry] of next) {
      if (sameEntry(previous.get(cleanerId), entry)) continue;
      transaction.set(agenda.doc(agendaEntryId(cleanerId, jobId)), { ...entry, syncedAt: FieldValue.serverTimestamp() });
      written += 1;
    }
    for (const [cleanerId, reference] of previousRefs) {
      if (next.has(cleanerId)) continue;
      transaction.delete(reference);
      deleted += 1;
    }
    const changes = planAgendaChanges(previous, next, { job, suppressNotices });
    for (const change of changes) {
      transaction.set(agenda.doc(), {
        organizationId,
        cleanerId: change.cleanerId,
        kind: agendaKinds.change,
        change: change.change,
        propertyName: change.propertyName,
        from: change.from,
        to: change.to,
        openJobId: change.openJobId,
        atMs: current.getTime(),
        at: FieldValue.serverTimestamp(),
      });
    }
    return { written, deleted, changes: changes.length };
  });
}

/**
 * Brings one cleaner's agenda up to date with Jobs that changed before she
 * linked her account (or before this projection existed). Bounded pilot reads.
 */
export async function rebuildCleanerAgenda(database, { organizationId, cleanerId, now = () => new Date() }) {
  if (!validId(organizationId) || !validId(cleanerId)) return { jobs: 0 };
  const organization = database.collection("organizations").doc(organizationId);
  const jobs = organization.collection("jobs");
  const [rosterSnapshot, legacySnapshot, openSnapshot, existingSnapshot] = await Promise.all([
    jobs.where("assignedCleanerIds", "array-contains", cleanerId).get(),
    jobs.where("assignedCleanerId", "==", cleanerId).get(),
    jobs.where("operationalStatus", "in", ["OFFERED", "ASSIGNED"]).get(),
    organization.collection(cleanerAgendaCollection).where("cleanerId", "==", cleanerId).get(),
  ]);
  const jobIds = new Set([
    ...rosterSnapshot.docs.map((snapshot) => snapshot.id),
    ...legacySnapshot.docs.map((snapshot) => snapshot.id),
    ...existingSnapshot.docs.map((snapshot) => snapshot.data().jobId).filter(validId),
  ]);
  const offerReads = await Promise.all(openSnapshot.docs.map((snapshot) => (
    snapshot.ref.collection("offers").doc(cleanerId).get()
  )));
  offerReads.forEach((offer, index) => {
    if (offer.exists) jobIds.add(openSnapshot.docs[index].id);
  });
  for (const jobId of jobIds) {
    await syncCleanerAgendaForJob(database, { organizationId, jobId, now, suppressNotices: true });
  }
  return { jobs: jobIds.size };
}

import { canonicalManualRecipient, confirmsManualSpot } from "./manualOfferConfirmation.js";
import { isDeepStrictEqual } from "node:util";
import { offerPayForRecipient } from "./offerPay.js";
import { FieldValue } from "firebase-admin/firestore";
import { publicOfferState } from "./publicOfferResponseService.js";
import { automaticOfferBatchVersion, FIRST_ACCEPT_WINS, isAutomaticOfferJob } from "./firstAcceptWins.js";
import { currentManualReplacementOffer } from "./managerManualReplacementOfferService.js";
import { projectCleanerReschedule, rosterScheduleConfirmation } from "./rescheduleConfirmations.js";
import { addCalendarDays, localDateKey } from "./managerReminders.js";
import { normalizeServiceType } from "./serviceTypes.js";

/**
 * Cleaner agenda projection (Cleaner Hub V1).
 *
 * Jobs, Offers and Assignments stay the source of truth. This module derives a
 * minimal, cleaner-safe read model at organizations/{org}/cleanerAgenda that a
 * signed-in cleaner may read for herself only (see firestore.rules). It never
 * copies client prices, guest names, other cleaners' offers or Property access
 * details. Job instructions are for the current offer or assignment holder.
 * Each sync reads current state in one transaction so triggers can be replayed.
 */

export const cleanerAgendaCollection = "cleanerAgenda";
export const agendaKinds = Object.freeze({ assigned: "ASSIGNED", offer: "OFFER", change: "CHANGE" });
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
  return offerPayForRecipient(offer, job).offeredCompensation ?? null;
}

function baseEntry(organizationId, jobId, cleanerId, job) {
  return {
    organizationId,
    cleanerId,
    jobId,
    jobStatus: typeof job.operationalStatus === "string" ? job.operationalStatus : "UNKNOWN",
    scheduledDate: dateKey(job.scheduledDate),
    ...(job.operationalStatus === "COMPLETED" && job.scheduledDate == null && { completedDate: completionDate(job) }),
    scheduledStart: timeKey(job.scheduledStart),
    propertyName: text(job.propertyName),
    scheduleRevision: revision(job.scheduleRevision),
  };
}

/**
 * Pure projection: which cleaners may see this Job, and what they may see.
 * @returns {Map<string, object>} cleanerId -> entry (without server timestamps)
 */
const checklistStatuses = ["DRAFT", "READY_FOR_REVIEW", "ABANDONED"];

/**
 * FB04: the state of the Job's checklist as the cleaner should see it. Only
 * server-known Run statuses; "started" means answers or photos were saved.
 */
export function checklistAgendaSummary({ run = null, draft = null, evidenceState = null } = {}) {
  if (!run || !checklistStatuses.includes(run.status)) return { status: "NONE", started: false };
  const savedAnswers = Number.isInteger(draft?.revision) && draft.revision > 0;
  const savedPhotos = Array.isArray(evidenceState?.photos) && evidenceState.photos.length > 0;
  return { status: run.status, started: run.status === "DRAFT" && (savedAnswers || savedPhotos) };
}

function belongsToJob(record, organizationId, jobId) {
  return record && (record.organizationId == null || record.organizationId === organizationId)
    && (record.jobId == null || record.jobId === jobId);
}

function acceptedOfferFor(cleanerId, assignment, job, offers) {
  // Legacy assignment records only the cleaner ID. Its canonical interested
  // Offer is keyed by that ID. Modern direct assignments have no source Offer.
  const sourceId = isAssignmentAwareJobData(job) ? assignment?.sourceOfferId : cleanerId;
  if (!validId(sourceId)) return null;
  return offers.find(offer => offer.offerReferenceId === sourceId && offer.cleanerId === cleanerId
    && ["ACCEPTED", "INTERESTED", "SELECTED"].includes(offer.status));
}

export function computeAgendaEntries({ organizationId, jobId, job, address = null, offers = [], assignments = [], now = new Date(), checklist = null, scheduleHistory = null }) {
  const checklistSummary = checklist || { status: "NONE", started: false };
  const entries = new Map();
  if (!job || job.archivedAt || (job.organizationId != null && job.organizationId !== organizationId)) return entries;
  const jobOffers = offers.filter(offer => belongsToJob(offer, organizationId, jobId));
  const holderDetails = {
    serviceType: normalizeServiceType(job.serviceType),
    address: text(address, 240),
    notes: typeof job.notes === "string" ? job.notes.trim() || null : null,
  };
  const roster = rosterCleanerIds(job);
  for (const cleanerId of roster) {
    const assignment = assignments.find(item => item?.cleanerId === cleanerId && item.isActive === true
      && belongsToJob(item, organizationId, jobId));
    const reschedule = projectCleanerReschedule({
      job, cleanerId, organizationId, jobId, scheduleRevision: job.scheduleRevision, assignment, history: scheduleHistory,
    });
    const ownOffer = acceptedOfferFor(cleanerId, assignment, job, jobOffers);
    const agreement = ownOffer ?? (assignment?.source === "MANAGER_DIRECT" ? assignment.paySnapshot : null);
    const pay = offerPayForRecipient(agreement, job, cleanerId);
    const canReportTime = assignment && (pay.offeredPay?.mode === "HOURLY"
      || (!agreement && job.pay?.mode === "HOURLY"));
    const workedTime = (canReportTime || assignment?.reportedWork || assignment?.approvedWork) && {
      reportedMinutes: assignment.reportedWork?.minutes ?? null,
      approvedMinutes: assignment.approvedWork?.minutes ?? null,
      payoutCents: assignment.payoutCents ?? null,
    };
    entries.set(cleanerId, {
      ...baseEntry(organizationId, jobId, cleanerId, job),
      kind: agendaKinds.assigned,
      ...holderDetails,
      acknowledged: Boolean(assignment?.cleanerAcknowledgedAt),
      offerStatus: null,
      ...pay,
      ...(workedTime && { workedTime }),
      checklist: { ...checklistSummary },
      checklistStatus: checklistSummary.status,
      checklistStarted: checklistSummary.started,
      ...(Number.isSafeInteger(job.scheduleRevision) && job.scheduleRevision > 0 && { reschedule }),
    });
  }
  const activeReplacement = job.manualReplacementOffer?.offerId;
  const replacement = activeReplacement && jobOffers.find(offer => offer.offerReferenceId === activeReplacement && offer.jobId === jobId
    && currentManualReplacementOffer(job, offer, activeReplacement, now));
  const visibleOffers = replacement ? [replacement, ...jobOffers.filter(offer => offer !== replacement)] : jobOffers;
  const manualRecipients = new Set(jobOffers.filter(offer => canonicalManualRecipient(offer, offer.offerReferenceId, jobId, organizationId))
    .map(offer => offer.cleanerId));
  for (const offer of visibleOffers) {
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
    const state = offer === replacement ? "available" : publicOfferState(offer, job, now);
    if (state !== "available" && state !== "already-taken") continue;
    const closed = state === "already-taken";
    // A former automatic invite recipient is not entitled to learn later Job
    // changes. A manual Offer has no snapshot; it keeps the details she had.
    const details = closed && automatic ? {
      operationalStatus: "OFFERED",
      propertyName: offer.offeredPropertyName,
      scheduledDate: offer.offeredScheduledDate,
      scheduledStart: offer.offeredScheduledStart,
    } : closed || offer.automaticOfferBatchVersion === automaticOfferBatchVersion
      ? { ...job, operationalStatus: "OFFERED" } : job;
    entries.set(cleanerId, {
      ...baseEntry(organizationId, jobId, cleanerId, details),
      ...(!closed && holderDetails),
      kind: agendaKinds.offer,
      acknowledged: false,
      offerStatus: closed ? "ALREADY_TAKEN" : offer.status,
      offerExpiresAtMs,
      // Closed invitations keep only the amount saved on the recipient's own Offer.
      ...offerPayForRecipient(offer, closed ? null : job, cleanerId),
      ...(automatic ? { offerDistributionMode: FIRST_ACCEPT_WINS } : {}),
      ...(!closed && canonicalManualRecipient(offer, offer.offerReferenceId, jobId, organizationId)
        && confirmsManualSpot(job, offer, manualRecipients.size > 1) && { confirmationMode: FIRST_ACCEPT_WINS }),
      ...(offer === replacement ? { replacementOfferId: activeReplacement } : {}),
    });
  }
  return entries;
}

export function agendaEntryId(cleanerId, jobId) {
  return `${cleanerId}__${jobId}`;
}

const comparedFields = [
  "organizationId", "cleanerId", "jobId", "kind", "jobStatus", "scheduledDate", "scheduledStart", "completedDate",
  "propertyName", "scheduleRevision", "acknowledged", "offerStatus", "offeredCompensation", "offeredFirstSlotExtraCents", "offeredPayEstimated", "offerExpiresAtMs",
  "offerDistributionMode", "confirmationMode", "replacementOfferId", "checklistStatus", "checklistStarted", "serviceType", "address", "notes",
];

export function sameEntry(previous, next) {
  return Boolean(previous) && isDeepStrictEqual(previous.reschedule, next.reschedule)
    && isDeepStrictEqual(previous.offeredPay, next.offeredPay)
    && isDeepStrictEqual(previous.workedTime, next.workedTime)
    && comparedFields.every((field) => (previous[field] ?? null) === (next[field] ?? null));
}

/** Re-derives every cleaner entry for one Job from current source records. */
export async function syncCleanerAgendaForJob(database, {
  organizationId,
  jobId,
  now = () => new Date(),
}) {
  if (!validId(organizationId) || !validId(jobId)) return { written: 0, deleted: 0 };
  const organization = database.collection("organizations").doc(organizationId);
  const jobRef = organization.collection("jobs").doc(jobId);
  const agenda = organization.collection(cleanerAgendaCollection);

  return database.runTransaction(async (transaction) => {
    const runRef = jobRef.collection("checklistRuns").doc("initial");
    const [jobSnapshot, offersSnapshot, assignmentsSnapshot, existingSnapshot, runSnapshot, draftSnapshot, evidenceSnapshot] = await Promise.all([
      transaction.get(jobRef),
      transaction.get(jobRef.collection("offers")),
      transaction.get(jobRef.collection("assignments").where("isActive", "==", true)),
      transaction.get(agenda.where("jobId", "==", jobId)),
      transaction.get(runRef),
      transaction.get(runRef.collection("drafts").doc("current")),
      transaction.get(runRef.collection("evidenceState").doc("current")),
    ]);
    const job = jobSnapshot.exists ? jobSnapshot.data() : null;
    const hasConfirmation = rosterCleanerIds(job).some(cleanerId =>
      rosterScheduleConfirmation(job, cleanerId, job.scheduleRevision, organizationId));
    const [propertySnapshot, historySnapshot] = await Promise.all([
      job && !job.archivedAt && validId(job.propertyId)
        ? transaction.get(organization.collection("properties").doc(job.propertyId)) : null,
      hasConfirmation ? transaction.get(jobRef.collection("scheduleHistory").doc(String(job.scheduleRevision))) : null,
    ]);
    const property = propertySnapshot?.data();
    const address = property && (property.organizationId == null || property.organizationId === organizationId)
      ? property.address : null;
    const current = typeof now === "function" ? now() : now;
    const next = computeAgendaEntries({
      organizationId,
      jobId,
      job,
      address,
      offers: offersSnapshot.docs.map((snapshot) => ({ ...snapshot.data(), offerReferenceId: snapshot.id })),
      assignments: assignmentsSnapshot.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id })),
      scheduleHistory: historySnapshot?.data(),
      now: current,
      checklist: checklistAgendaSummary({
        run: runSnapshot.exists ? runSnapshot.data() : null,
        draft: draftSnapshot.exists ? draftSnapshot.data() : null,
        evidenceState: evidenceSnapshot.exists ? evidenceSnapshot.data() : null,
      }),
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
      // Replace the entire projection so fields from an earlier recipient state disappear.
      transaction.set(agenda.doc(agendaEntryId(cleanerId, jobId)), { ...entry, syncedAt: FieldValue.serverTimestamp() });
      written += 1;
    }
    for (const [cleanerId, reference] of previousRefs) {
      if (next.has(cleanerId)) continue;
      transaction.delete(reference);
      deleted += 1;
    }
    return { written, deleted };
  });
}

const completedRebuildDays = 45;
const rebuildConcurrency = 5;

function completionDate(data) {
  const completed = data.completedAt?.toDate?.() ?? data.completedAt;
  return completed instanceof Date && Number.isFinite(completed.getTime()) ? localDateKey(completed) : null;
}

function withinRebuildWindow(data, status, cutoff) {
  if (status !== "COMPLETED") return true;
  const date = data.scheduledDate == null ? (data.completedDate ?? completionDate(data)) : dateKey(data.scheduledDate);
  return date == null || date >= cutoff;
}

async function inRebuildBatches(items, task) {
  for (let offset = 0; offset < items.length; offset += rebuildConcurrency) {
    const results = await Promise.allSettled(items.slice(offset, offset + rebuildConcurrency).map(task));
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
  }
}

/**
 * Brings one cleaner's agenda up to date with Jobs that changed before she
 * linked her account (or before this projection existed). Bounded pilot reads.
 */
export async function rebuildCleanerAgenda(database, { organizationId, cleanerId, now = () => new Date() }) {
  if (!validId(organizationId) || !validId(cleanerId)) return { jobs: 0 };
  const organization = database.collection("organizations").doc(organizationId);
  const jobs = organization.collection("jobs");
  const current = now();
  const cutoff = addCalendarDays(localDateKey(current), -completedRebuildDays);
  const [rosterSnapshot, legacySnapshot, openSnapshot, replacementSnapshot, existingSnapshot] = await Promise.all([
    jobs.where("assignedCleanerIds", "array-contains", cleanerId).get(),
    jobs.where("assignedCleanerId", "==", cleanerId).get(),
    jobs.where("operationalStatus", "in", ["OFFERED", "ASSIGNED"]).get(),
    jobs.where("manualReplacementOffer.cleanerId", "==", cleanerId).get(),
    organization.collection(cleanerAgendaCollection).where("cleanerId", "==", cleanerId).get(),
  ]);
  const rosterJobs = [...rosterSnapshot.docs, ...legacySnapshot.docs].filter(snapshot => {
    const job = snapshot.data();
    return withinRebuildWindow(job, job.operationalStatus, cutoff);
  });
  const existingJobs = existingSnapshot.docs.map(snapshot => snapshot.data())
    .filter(entry => entry.kind !== agendaKinds.change && withinRebuildWindow(entry, entry.jobStatus, cutoff))
    .map(entry => entry.jobId).filter(validId);
  const jobIds = new Set([...rosterJobs.map(snapshot => snapshot.id), ...existingJobs]);
  const offerJobs = new Map([...openSnapshot.docs, ...replacementSnapshot.docs].map(snapshot => [snapshot.id, snapshot]));
  await inRebuildBatches([...offerJobs.values()].filter(snapshot => !jobIds.has(snapshot.id)), async snapshot => {
    const job = snapshot.data();
    if (job.archivedAt) return;
    const offers = snapshot.ref.collection("offers");
    const replacement = job.manualReplacementOffer;
    if (replacement?.cleanerId === cleanerId && validId(replacement.offerId)) {
      const document = await offers.doc(replacement.offerId).get();
      const offer = document.data();
      if (visibleOfferStatuses.includes(offer?.status) && currentManualReplacementOffer(job, offer, document.id, current)) {
        jobIds.add(snapshot.id);
        return;
      }
    }
    if (!["OFFERED", "ASSIGNED"].includes(job.operationalStatus)) return;
    const document = await offers.doc(cleanerId).get();
    const offer = document.data();
    if (offer?.cleanerId !== cleanerId || !visibleOfferStatuses.includes(offer.status)) return;
    if (["available", "already-taken"].includes(publicOfferState(offer, job, current))) jobIds.add(snapshot.id);
  });
  await inRebuildBatches([...jobIds], jobId => syncCleanerAgendaForJob(database, { organizationId, jobId, now }));
  return { jobs: jobIds.size };
}

import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  automaticOfferBatch, checklistContextRevision, FIRST_ACCEPT_WINS, isAutomaticOfferJob, isCanonicalRoster,
} from "./firstAcceptWins.js";
import { currentManualReplacementOffer, isManualReplacementOfferId } from "./managerManualReplacementOfferService.js";
import { jobScheduleRevision, readScheduleRoster } from "./rescheduleConfirmations.js";

const reschedulableStatuses = new Set(["UNASSIGNED", "OFFERED", "ASSIGNED"]);
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})$/;

export function isValidScheduledDate(value) {
  if (typeof value !== "string") return false;
  const match = datePattern.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

export function normalizeRescheduleInput({ jobId, scheduledDate, scheduledStart }) {
  if (typeof jobId !== "string" || !jobId.trim() || jobId.length > 256 || jobId.includes("/")) {
    throw new HttpsError("invalid-argument", "Job is invalid.");
  }
  if (!isValidScheduledDate(scheduledDate)) {
    throw new HttpsError("invalid-argument", "Enter a valid scheduled date.", { reason: "invalid-date" });
  }
  if (typeof scheduledStart !== "string") {
    throw new HttpsError("invalid-argument", "Enter a valid scheduled time or leave it blank.", { reason: "invalid-time" });
  }
  const time = scheduledStart.trim();
  if (time && (!timePattern.test(time) || Number(time.slice(0, 2)) > 23 || Number(time.slice(3, 5)) > 59)) {
    throw new HttpsError("invalid-argument", "Enter a valid scheduled time or leave it blank.", { reason: "invalid-time" });
  }
  return { jobId: jobId.trim(), scheduledDate, scheduledStart: time };
}

function precondition(message, reason) {
  return new HttpsError("failed-precondition", message, { reason });
}

/**
 * Records a manager schedule change and updates the operational Job atomically.
 * The initial Checklist Run freezes its schedule snapshot, so any existing Run
 * locks the Job schedule rather than allowing history to become inconsistent.
 */
export async function rescheduleJobForManager(database, {
  organizationId,
  jobId,
  scheduledDate,
  scheduledStart,
  expectedScheduleRevision,
  actorUid,
  now = () => new Date(),
}) {
  if (expectedScheduleRevision !== undefined
    && (!Number.isSafeInteger(expectedScheduleRevision) || expectedScheduleRevision < 0)) {
    throw new HttpsError("invalid-argument", "Schedule revision is invalid.");
  }
  const normalized = normalizeRescheduleInput({ jobId, scheduledDate, scheduledStart });
  if (typeof organizationId !== "string" || !organizationId || typeof actorUid !== "string" || !actorUid) {
    throw new HttpsError("unauthenticated", "An authenticated manager is required.");
  }

  const jobReference = database.doc(`organizations/${organizationId}/jobs/${normalized.jobId}`);
  const runReference = jobReference.collection("checklistRuns").doc("initial");

  return database.runTransaction(async (transaction) => {
    const [jobSnapshot, runSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(runReference),
    ]);
    if (!jobSnapshot.exists) throw new HttpsError("not-found", "Job not found.");

    const job = jobSnapshot.data();
    if (job.organizationId != null && job.organizationId !== organizationId) throw new HttpsError("not-found", "Job not found.");
    if (job.archivedAt) throw precondition("Archived services cannot be rescheduled.", "archived");
    if (!reschedulableStatuses.has(job.operationalStatus) || job.startedAt != null) {
      throw precondition("Schedule can only be changed before work starts.", "status");
    }
    if (runSnapshot.exists) {
      throw precondition("The schedule is locked because a Checklist Run has frozen this service context.", "checklist-run-exists");
    }

    const scheduleRevision = jobScheduleRevision(job);
    const contextRevision = checklistContextRevision(job);
    if (scheduleRevision === null || contextRevision === null
      || scheduleRevision >= Number.MAX_SAFE_INTEGER
      || contextRevision >= Number.MAX_SAFE_INTEGER) {
      throw precondition("The Job schedule revision is invalid and needs manager review.", "invalid-revision");
    }

    const currentStart = typeof job.scheduledStart === "string" ? job.scheduledStart : "";
    if (job.scheduledDate === normalized.scheduledDate && currentStart === normalized.scheduledStart) {
      return {
        jobId: normalized.jobId,
        changed: false,
        scheduledDate: normalized.scheduledDate,
        scheduledStart: normalized.scheduledStart || null,
        scheduleRevision,
        checklistContextRevision: contextRevision,
        ...(job.scheduleConfirmation?.revision === scheduleRevision ? { scheduleConfirmation: job.scheduleConfirmation } : {}),
      };
    }

    if (expectedScheduleRevision !== undefined && expectedScheduleRevision !== scheduleRevision) {
      throw precondition("The schedule changed. Reload the service before rescheduling.", "stale-schedule");
    }
    const nextScheduleRevision = scheduleRevision + 1;
    const historyReference = jobReference.collection("scheduleHistory").doc(String(nextScheduleRevision));
    const replacementId = job.manualReplacementOffer?.offerId;
    const [existingHistory, roster, replacement] = await Promise.all([
      transaction.get(historyReference),
      readScheduleRoster(transaction, jobReference, job, organizationId),
      isManualReplacementOfferId(replacementId)
        ? transaction.get(jobReference.collection("offers").doc(replacementId)) : null,
    ]);
    if (existingHistory.exists) {
      throw precondition("Schedule history is inconsistent and was not changed.", "history-conflict");
    }

    const scheduleConfirmation = roster?.length ? {
      revision: nextScheduleRevision,
      byCleaner: Object.fromEntries(roster.map(([cleanerId, { assignmentId }]) => [
        cleanerId, { state: "PENDING", assignmentId },
      ])),
    } : null;
    const batch = isAutomaticOfferJob(job) ? automaticOfferBatch(job) : null;
    // Only already-valid open batches follow an explicit reschedule.
    const keepOpenBatch = batch && !job.offerDistributionClosedAt && !job.firstAcceptClaim
      && job.schemaVersion === 2 && job.organizationId === organizationId
      && (job.assignedCleanerId == null || job.assignedCleanerId === "")
      && ["OFFERED", "ASSIGNED"].includes(job.operationalStatus)
      && isCanonicalRoster(job) && job.assignedCleanerIds.length < batch.capacity
      && roster?.every(([, assignment]) => assignment.assignmentMethod === FIRST_ACCEPT_WINS)
      && batch.currentContextRevision === contextRevision;
    const priorOffer = replacement?.data();
    const carryReplacement = priorOffer?.status === "PENDING" && priorOffer.jobId === normalized.jobId
      && currentManualReplacementOffer(job, priorOffer, replacementId, now())
      ? { ...job.manualReplacementOffer, scheduleRevision: nextScheduleRevision }
      : FieldValue.delete();

    transaction.create(historyReference, {
      scheduleRevision: nextScheduleRevision,
      previousScheduledDate: typeof job.scheduledDate === "string" ? job.scheduledDate : null,
      previousScheduledStart: typeof job.scheduledStart === "string" && job.scheduledStart
        ? job.scheduledStart
        : null,
      newScheduledDate: normalized.scheduledDate,
      newScheduledStart: normalized.scheduledStart || null,
      actorUid,
      changedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(jobReference, {
      scheduledDate: normalized.scheduledDate,
      scheduledStart: normalized.scheduledStart || FieldValue.delete(),
      scheduleRevision: nextScheduleRevision,
      checklistContextRevision: contextRevision + 1,
      ...(scheduleConfirmation ? { scheduleConfirmation } : Object.hasOwn(job, "scheduleConfirmation")
        ? { scheduleConfirmation: FieldValue.delete() } : {}),
      ...(keepOpenBatch ? { automaticOfferBatch: { ...batch, currentContextRevision: contextRevision + 1 } } : {}),
      ...(Object.hasOwn(job, "manualReplacementOffer") ? { manualReplacementOffer: carryReplacement } : {}),
    });

    return {
      jobId: normalized.jobId,
      changed: true,
      scheduledDate: normalized.scheduledDate,
      scheduledStart: normalized.scheduledStart || null,
      scheduleRevision: nextScheduleRevision,
      checklistContextRevision: contextRevision + 1,
      ...(scheduleConfirmation ? { scheduleConfirmation } : {}),
    };
  });
}

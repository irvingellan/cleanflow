import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

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

function validRevision(job, field) {
  if (!Object.prototype.hasOwnProperty.call(job, field)) return 0;
  return Number.isSafeInteger(job[field]) && job[field] >= 0 ? job[field] : null;
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
  actorUid,
}) {
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
    if (job.archivedAt) throw precondition("Archived services cannot be rescheduled.", "archived");
    if (!reschedulableStatuses.has(job.operationalStatus)) {
      throw precondition("Schedule can only be changed before work starts.", "status");
    }
    if (runSnapshot.exists) {
      throw precondition("The schedule is locked because a Checklist Run has frozen this service context.", "checklist-run-exists");
    }

    const scheduleRevision = validRevision(job, "scheduleRevision");
    const contextRevision = validRevision(job, "checklistContextRevision");
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
      };
    }

    const nextScheduleRevision = scheduleRevision + 1;
    const historyReference = jobReference.collection("scheduleHistory").doc(String(nextScheduleRevision));
    const existingHistory = await transaction.get(historyReference);
    if (existingHistory.exists) {
      throw precondition("Schedule history is inconsistent and was not changed.", "history-conflict");
    }

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
    });

    return {
      jobId: normalized.jobId,
      changed: true,
      scheduledDate: normalized.scheduledDate,
      scheduledStart: normalized.scheduledStart || null,
      scheduleRevision: nextScheduleRevision,
      checklistContextRevision: contextRevision + 1,
    };
  });
}

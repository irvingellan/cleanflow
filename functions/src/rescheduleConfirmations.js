import { rosterMatchesActiveAssignments, validRosterId } from "./firstAcceptWins.js";
import { safeScheduleValues } from "./notificationInboxEvents.js";
import { maxCleanersPerJob } from "./offerSlots.js";

const confirmationStates = new Set(["PENDING", "CONFIRMED", "DECLINED"]);

export function jobScheduleRevision(job) {
  if (!job) return null;
  if (!Object.hasOwn(job, "scheduleRevision")) return 0;
  return Number.isSafeInteger(job.scheduleRevision) && job.scheduleRevision >= 0 ? job.scheduleRevision : null;
}

export function currentScheduleConfirmation(job, cleanerId, scheduleRevision) {
  const confirmation = job?.scheduleConfirmation;
  if (!validRosterId(cleanerId) || !Number.isSafeInteger(scheduleRevision) || scheduleRevision < 1
    || jobScheduleRevision(job) !== scheduleRevision || confirmation?.revision !== scheduleRevision
    || !confirmation.byCleaner || !Object.hasOwn(confirmation.byCleaner, cleanerId)) return null;
  const entry = confirmation.byCleaner[cleanerId];
  return confirmationStates.has(entry?.state) && (entry.assignmentId === null || validRosterId(entry.assignmentId))
    ? { state: entry.state, assignmentId: entry.assignmentId }
    : null;
}

/** Only a rostered recipient of this exact schedule generation has a Hub prompt. */
export function rosterScheduleConfirmation(job, cleanerId, revision, organizationId) {
  if (job?.operationalStatus !== "ASSIGNED" || job.archivedAt || job.startedAt != null
    || (job.organizationId != null && job.organizationId !== organizationId)) return null;
  const rostered = job.schemaVersion === 2
    ? Array.isArray(job.assignedCleanerIds) && job.assignedCleanerIds.includes(cleanerId)
    : job.assignedCleanerId === cleanerId;
  const decision = rostered ? currentScheduleConfirmation(job, cleanerId, revision) : null;
  return decision?.state === "PENDING" || decision?.state === "CONFIRMED" ? decision : null;
}

export function projectCleanerReschedule({ job, cleanerId, organizationId, jobId, scheduleRevision, assignment, history }) {
  const decision = rosterScheduleConfirmation(job, cleanerId, scheduleRevision, organizationId);
  if (!decision) return null;
  if (decision.assignmentId === null) {
    if (job.schemaVersion === 2) return null;
  } else if (assignment?.id !== decision.assignmentId || assignment.isActive !== true
    || assignment.cleanerId !== cleanerId || assignment.jobId !== jobId || assignment.organizationId !== organizationId) {
    return null;
  }
  const { scheduledDate, scheduledStart } = safeScheduleValues(job);
  if (!scheduledDate) return null;
  const current = {
    state: decision.state, scheduleRevision: job.scheduleRevision, scheduledDate, scheduledStart: scheduledStart || null,
  };
  if (history?.scheduleRevision !== job.scheduleRevision
    || (history.organizationId != null && history.organizationId !== organizationId)
    || (history.jobId != null && history.jobId !== jobId)
    || history.newScheduledDate !== scheduledDate
    || (history.newScheduledStart || null) !== current.scheduledStart) return current;
  const old = safeScheduleValues({ scheduledDate: history.previousScheduledDate, scheduledStart: history.previousScheduledStart });
  return old.scheduledDate ? {
    ...current, previousScheduledDate: old.scheduledDate, ...(old.scheduledStart && { previousScheduledStart: old.scheduledStart }),
  } : current;
}

export async function readScheduleRoster(transaction, jobRef, job, organizationId) {
  if (job.operationalStatus !== "ASSIGNED") return [];
  if (job.schemaVersion !== 2) {
    return validRosterId(job.assignedCleanerId) ? [[job.assignedCleanerId, { assignmentId: null }]] : [];
  }
  if (job.organizationId !== organizationId || (job.assignedCleanerId != null && job.assignedCleanerId !== "")
    || !Array.isArray(job.assignedCleanerIds) || !job.assignedCleanerIds.length
    || job.assignedCleanerIds.length > maxCleanersPerJob) return null;
  const snapshots = (await transaction.get(
    jobRef.collection("assignments").where("isActive", "==", true).limit(maxCleanersPerJob + 1),
  )).docs;
  const assignments = snapshots.map(snapshot => snapshot.data());
  if (!rosterMatchesActiveAssignments(job, assignments, organizationId, jobRef.id)
    || snapshots.some((snapshot, index) => !validRosterId(snapshot.id) || assignments[index].executionStatus !== "ASSIGNED")) {
    return null;
  }
  return snapshots.map((snapshot, index) => [
    assignments[index].cleanerId,
    { ...assignments[index], assignmentId: snapshot.id },
  ]);
}

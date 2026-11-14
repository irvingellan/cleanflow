import { rosterMatchesActiveAssignments, validRosterId } from "./firstAcceptWins.js";
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

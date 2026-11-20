import { formatDate } from "../../lib/presentation.js";

const wallTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function availabilityDateLabel(block, language) {
  const start = formatDate(block.startDate, null, language);
  return block.endDate === block.startDate ? start : start + " – " + formatDate(block.endDate, null, language);
}

/** Jobs currently expose their scheduled start, without an end or a duration. */
export function blockAtScheduledStart(block, scheduledDate, scheduledStart) {
  if (!scheduledDate || scheduledDate < block.startDate || scheduledDate > block.endDate) return "clear";
  if (!block.startTime) return "blocked";
  if (!wallTime.test(scheduledStart)) return "unknown";
  return scheduledStart >= block.startTime && scheduledStart < block.endTime ? "blocked" : "clear";
}

export function assignedBlockConflicts(block, entries) {
  const blocked = new Set();
  const unknown = new Set();
  for (const entry of entries) {
    if (!entry.jobId || entry.kind !== "ASSIGNED" || !["ASSIGNED", "IN_PROGRESS"].includes(entry.jobStatus)) continue;
    const overlap = blockAtScheduledStart(block, entry.scheduledDate, entry.scheduledStart);
    if (overlap === "blocked") blocked.add(entry.jobId);
    if (overlap === "unknown") unknown.add(entry.jobId);
  }
  for (const jobId of blocked) unknown.delete(jobId);
  return { blocked: blocked.size, unknown: unknown.size };
}

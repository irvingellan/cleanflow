import { getAssignedCleanerIds, isAssignmentAwareJob } from "./jobCompatibility.js";

export const cleanerSelectionHistoryLimit = 40;
export const cleanerSelectionScheduleLimit = 60;
export const committedCleanerStatuses = ["ASSIGNED", "IN_PROGRESS", "COMPLETED"];

const completionDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
});

function completedDate(timestamp) {
  const date = timestamp?.toDate?.();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(completionDate.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function assignedIds(job) {
  if (isAssignmentAwareJob(job)) return getAssignedCleanerIds(job);
  return typeof job.assignedCleanerId === "string" && job.assignedCleanerId.trim()
    ? [job.assignedCleanerId.trim()] : [];
}

/** Expose only the context needed by the manager picker. */
export function projectCleanerSelectionContext(target, scheduleRows, historyRows) {
  const context = new Map();
  const factsFor = (cleanerId) => {
    if (!context.has(cleanerId)) {
      context.set(cleanerId, { sameDayStarts: [], completedHereCount: 0, lastCompletedHereDate: null });
    }
    return context.get(cleanerId);
  };
  for (const job of scheduleRows.slice(0, cleanerSelectionScheduleLimit)) {
    if (job.id === target.jobId || job.archivedAt || job.scheduledDate !== target.scheduledDate
      || !committedCleanerStatuses.includes(job.operationalStatus)) continue;
    const start = typeof job.scheduledStart === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(job.scheduledStart)
      ? job.scheduledStart : null;
    for (const id of assignedIds(job)) {
      const facts = factsFor(id);
      if (!facts.sameDayStarts.includes(start)) facts.sameDayStarts.push(start);
    }
  }
  for (const job of historyRows.slice(0, cleanerSelectionHistoryLimit)) {
    if (job.id === target.jobId || job.propertyId !== target.propertyId || job.operationalStatus !== "COMPLETED") continue;
    const date = completedDate(job.completedAt);
    if (!date) continue;
    for (const id of assignedIds(job)) {
      const facts = factsFor(id);
      facts.completedHereCount += 1;
      if (facts.lastCompletedHereDate === null || date > facts.lastCompletedHereDate) {
        facts.lastCompletedHereDate = date;
      }
    }
  }
  for (const facts of context.values()) facts.sameDayStarts.sort((a, b) => (a ?? "24:00").localeCompare(b ?? "24:00"));
  return {
    byCleanerId: Object.fromEntries(context),
    historyPartial: historyRows.length > cleanerSelectionHistoryLimit,
    schedulePartial: scheduleRows.length > cleanerSelectionScheduleLimit,
    historyLimit: cleanerSelectionHistoryLimit,
  };
}

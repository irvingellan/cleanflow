/**
 * A Checklist Run is immutable, but a future cleaner capability must become
 * invalid when the Job context it represents changes. Legacy Jobs without the
 * field intentionally begin at revision zero in memory; reads never backfill.
 */
export const checklistEligibleOperationalStatuses = Object.freeze([
  "ASSIGNED",
  "IN_PROGRESS",
]);

const jobContextFields = Object.freeze([
  "propertyId",
  "scheduledDate",
  "scheduledStart",
  "assignedCleanerId",
  "assignedCleanerIds",
]);

export function getChecklistContextRevision(job) {
  const revision = job?.checklistContextRevision;

  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

export function isChecklistEligibleExecutionState(job) {
  return checklistEligibleOperationalStatuses.includes(job?.operationalStatus);
}

function normalizedValue(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return typeof value === "string" ? value.trim() : value ?? null;
}

function valuesDiffer(first, second) {
  return JSON.stringify(normalizedValue(first)) !== JSON.stringify(normalizedValue(second));
}

/**
 * ASSIGNED and IN_PROGRESS are the first cleaner-capability-eligible states.
 * Moving between them preserves the same cleaner-facing context; entering or
 * leaving the set invalidates a future capability exactly once.
 */
export function hasChecklistContextChanged(job, changes = {}) {
  const nextJob = { ...job, ...changes };

  if (Boolean(job?.archivedAt) !== Boolean(nextJob.archivedAt)) {
    return true;
  }

  if (jobContextFields.some((field) => valuesDiffer(job?.[field], nextJob[field]))) {
    return true;
  }

  return isChecklistEligibleExecutionState(job) !== isChecklistEligibleExecutionState(nextJob);
}

export function buildChecklistContextRevisionUpdate(job, changes = {}) {
  return hasChecklistContextChanged(job, changes)
    ? { checklistContextRevision: getChecklistContextRevision(job) + 1 }
    : {};
}

/**
 * Assignment create/remove/identity/activity mutations are Job-context changes
 * even where a future projection update does not yet expose every detail.
 */
export function buildAssignmentChecklistContextRevisionUpdate(job) {
  return { checklistContextRevision: getChecklistContextRevision(job) + 1 };
}

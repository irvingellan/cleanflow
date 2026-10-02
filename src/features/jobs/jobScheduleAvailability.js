// Presentation only: preserves Job Detail's existing ordered schedule guard.
export function jobScheduleAvailability(job, { run, loading = false, error = false } = {}) {
  if (job.archivedAt || !["UNASSIGNED", "OFFERED", "ASSIGNED"].includes(job.operationalStatus)) return "jobs.scheduleReadOnlyState";
  if (loading) return "jobs.scheduleCheckingChecklist";
  if (error) return "jobs.scheduleChecklistUnavailable";
  if (run) return "jobs.scheduleLockedByChecklist";
  return null;
}

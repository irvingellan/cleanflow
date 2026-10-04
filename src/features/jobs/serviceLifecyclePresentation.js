const JOB_STAGES = ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"];
const RUN_STATES = ["DRAFT", "READY_FOR_REVIEW", "ABANDONED"];
const LINK_STATES = ["NONE", "ACTIVE", "STALE", "REVOKED", "EXPIRED", "UNAVAILABLE"];

function hasRecordedTimestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) && value.getUTCFullYear() >= 1 && value.getUTCFullYear() <= 9999;
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) return false;
    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
      && hour <= 23 && minute <= 59 && second <= 59 && Number.isFinite(new Date(value).getTime());
  }
  if (!value || typeof value !== "object") return false;
  if ("seconds" in value || "nanoseconds" in value) {
    return Number.isSafeInteger(value.seconds) && value.seconds >= -62135596800 && value.seconds <= 253402300799
      && Number.isInteger(value.nanoseconds) && value.nanoseconds >= 0 && value.nanoseconds <= 999999999;
  }
  if (typeof value.toDate === "function") {
    try {
      const date = value.toDate();
      return date instanceof Date && hasRecordedTimestamp(date);
    } catch { return false; }
  }
  return false;
}

function belongsToJob(record, job) {
  return record?.jobId === undefined || record.jobId === null
    || (typeof record.jobId === "string" && record.jobId === job?.id);
}

function pastOfferState(job, offers, loading, error) {
  if (hasRecordedTimestamp(job?.offeredAt)) return "completed";
  if (loading || error || !Array.isArray(offers)) return "unknown-past";
  if (offers.length === 0) return job?.offeredAt == null ? "skipped" : "unknown-past";
  return offers.every((offer) => offer && typeof offer === "object" && !Array.isArray(offer)
    && typeof offer.id === "string" && Boolean(offer.id.trim()) && belongsToJob(offer, job)) ? "completed" : "unknown-past";
}

function hasAssignmentRelationship(job, assignments) {
  const validId = (value) => typeof value === "string" && Boolean(value.trim());
  return validId(job?.assignedCleanerId) || (Array.isArray(job?.assignedCleanerIds) && job.assignedCleanerIds.some(validId))
    || (Array.isArray(assignments) && assignments.some((assignment) => validId(assignment?.cleanerId) && belongsToJob(assignment, job)));
}

function presentationStageState(status, index, currentStage, job, offers, offersLoading, offersError, assignments) {
  if (currentStage < 0) return "future";
  if (index === currentStage) return "current";
  if (status === "ASSIGNED" && hasAssignmentRelationship(job, assignments)) return "completed";
  if (index > currentStage) return "future";
  if (status === "OFFERED") return pastOfferState(job, offers, offersLoading, offersError);
  if (status === "IN_PROGRESS") return hasRecordedTimestamp(job?.startedAt) ? "completed"
    : job?.startedAt == null ? "skipped" : "unknown-past";
  // Current creation starts UNASSIGNED; a later operational state also proves
  // assignment. Optional Offer and start stages need the evidence above.
  return "completed";
}

function savedChecklistProgress(run) {
  const counts = run?.draft?.progress?.checklist;
  if (!counts || !["total", "done", "notApplicable", "unanswered"].every(
    (key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0,
  )) return null;
  const saved = counts.done + counts.notApplicable;
  if (!Number.isSafeInteger(saved) || saved + counts.unanswered !== counts.total) return null;
  if (run.checklistItemCount !== undefined && run.checklistItemCount !== counts.total) return null;
  return { saved, total: counts.total, percent: counts.total > 0 ? Math.round(saved / counts.total * 100) : 0 };
}

function savedTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

// Presentation only: no authorization, lifecycle transition, next-action rule,
// revision calculation or access to the underlying records is added here.
export function serviceLifecyclePresentation({
  job,
  checklistRun,
  capability,
  runLoading = false,
  runError = false,
  capabilityLoading = false,
  capabilityError = false,
  issues,
  issuesLoading = false,
  issuesError = false,
  offers,
  offersLoading = false,
  offersError = false,
  assignments,
} = {}) {
  const currentStage = JOB_STAGES.indexOf(job?.operationalStatus);
  const runState = runLoading ? "LOADING" : runError ? "UNKNOWN"
    : checklistRun === null ? "NONE"
      : RUN_STATES.includes(checklistRun?.status) ? checklistRun.status : "UNKNOWN";
  const capabilityState = capabilityLoading || runLoading ? "LOADING"
    : capabilityError || runError || checklistRun === undefined ? "UNKNOWN"
      : LINK_STATES.includes(capability?.state) ? capability.state : "UNKNOWN";
  const runKnown = RUN_STATES.includes(runState);
  const attention = [];
  if (capabilityState === "STALE") attention.push({ kind: "stale-link", key: "lifecycle.attention.staleLink" });
  if (runState === "READY_FOR_REVIEW" && job?.operationalStatus !== "COMPLETED" && !job?.archivedAt) {
    attention.push({ kind: "review", key: "lifecycle.attention.review" });
  }
  if (!issuesLoading && !issuesError && Array.isArray(issues)) {
    const count = issues.filter((issue) => issue?.status === "OPEN").length;
    if (count > 0) attention.push({ kind: "issues", count, key: "lifecycle.attention.openIssues" });
  }
  return {
    lifecycle: {
      statusKey: currentStage >= 0 ? `lifecycle.stage.${JOB_STAGES[currentStage]}` : "lifecycle.unknown",
      archived: Boolean(job?.archivedAt),
      stages: JOB_STAGES.map((status, index) => ({
        status,
        labelKey: `lifecycle.stage.${status}`,
        state: presentationStageState(status, index, currentStage, job, offers, offersLoading, offersError, assignments),
      })),
    },
    checklist: {
      state: runState,
      stateKey: runState === "READY_FOR_REVIEW" && job?.operationalStatus === "COMPLETED"
        ? "lifecycle.checklist.SAVED" : `lifecycle.checklist.${runState}`,
      progress: runKnown ? savedChecklistProgress(checklistRun) : null,
      lastSavedAt: runKnown ? savedTimestamp(checklistRun?.draft?.lastSavedAt) : null,
      capabilityState,
      capabilityKey: `lifecycle.link.${capabilityState}`,
    },
    attention,
  };
}

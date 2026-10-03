const JOB_STAGES = ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"];
const RUN_STATES = ["DRAFT", "READY_FOR_REVIEW", "ABANDONED"];
const LINK_STATES = ["NONE", "ACTIVE", "STALE", "REVOKED", "EXPIRED", "UNAVAILABLE"];

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
        state: index === currentStage ? "current" : index < currentStage ? "completed" : "future",
      })),
    },
    checklist: {
      state: runState,
      stateKey: `lifecycle.checklist.${runState}`,
      progress: runKnown ? savedChecklistProgress(checklistRun) : null,
      lastSavedAt: runKnown ? savedTimestamp(checklistRun?.draft?.lastSavedAt) : null,
      capabilityState,
      capabilityKey: `lifecycle.link.${capabilityState}`,
    },
    attention,
  };
}

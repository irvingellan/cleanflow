import {
  ASSIGNMENT_AWARE_JOB_SCHEMA_VERSION,
  canManageAssignmentAwareOffers,
  getAssignedCleanerIds,
  isAssignmentAwareJob,
} from "../jobs/jobCompatibility.js";

function action(id, labelKey) {
  return { id, labelKey };
}

/**
 * Orders existing manager UI entry points. This is not permission or lifecycle
 * validation: existing controls/services still decide and confirm every mutation.
 * A failed or pending read is never interpreted as an absent Run/Assignment.
 */
export function deriveWorkspaceNextAction({
  job,
  checklistRun = null,
  checklistCapability = null,
  assignments = [],
  isLoadingChecklistRun = true,
  hasChecklistRunError = false,
  isLoadingChecklistCapability = true,
  hasChecklistCapabilityError = false,
  isLoadingAssignments = true,
  hasAssignmentsError = false,
} = {}) {
  if (!job) {
    return {
      messageKey: "workspace.selectJob",
      primaryAction: null,
      secondaryActions: [],
      pending: false,
    };
  }

  const history = action("history", "workspace.history");
  const runKnown = !isLoadingChecklistRun && !hasChecklistRunError;
  const rosterKnown = !isLoadingAssignments && !hasAssignmentsError;
  const capabilityKnown = !isLoadingChecklistCapability && !hasChecklistCapabilityError;
  const isAssignmentAware = isAssignmentAwareJob(job);
  const supportsDirectAssignment = job.schemaVersion === ASSIGNMENT_AWARE_JOB_SCHEMA_VERSION;
  const isArchived = Boolean(job.archivedAt);
  const isCompleted = job.operationalStatus === "COMPLETED";
  const canPrepareMessage = job.operationalStatus === "ASSIGNED" && (
    isAssignmentAware
      ? rosterKnown && assignments.some((assignment) => assignment.isActive === true
        && getAssignedCleanerIds(job).includes(assignment.cleanerId))
      : Boolean(job.assignedCleanerId || job.assignedCleanerName)
  );
  const reminder = canPrepareMessage ? action("reminder", "jobs.prepareCleanerMessage") : null;
  const checklist = runKnown && checklistRun
    ? action("checklist", checklistRun.status === "DRAFT"
      ? "checklists.cleanerLink"
      : checklistRun.status === "ABANDONED" ? "checklists.viewAbandonedRun" : "checklists.open")
    : null;

  // Historical Run/report viewing remains available, never an execution action.
  if (isArchived || isCompleted) {
    return {
      messageKey: isArchived ? "workspace.nextActionArchived" : "workspace.nextActionCompleted",
      primaryAction: checklist || history,
      secondaryActions: checklist ? [history] : [],
      pending: false,
    };
  }

  if (!["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus)) {
    return {
      messageKey: "workspace.nextActionUnavailable",
      primaryAction: checklist || history,
      secondaryActions: checklist ? [history] : [],
      pending: false,
    };
  }

  const canShowOfferEntry = isAssignmentAware
    ? canManageAssignmentAwareOffers(job)
    : ["UNASSIGNED", "OFFERED", "ASSIGNED"].includes(job.operationalStatus);
  const offers = canShowOfferEntry ? action("offers", "offers.offerCleaningToCleaners") : null;
  const secondary = (...actions) => actions.filter(Boolean);

  if (["UNASSIGNED", "OFFERED"].includes(job.operationalStatus)) {
    return {
      messageKey: supportsDirectAssignment && !rosterKnown
        ? hasAssignmentsError ? "workspace.nextActionReadError" : "workspace.nextActionLoading"
        : "workspace.nextActionUnassigned",
      primaryAction: supportsDirectAssignment && rosterKnown
        ? action("assign", "jobs.assignCleanerDirectly") : offers,
      secondaryActions: secondary(supportsDirectAssignment && rosterKnown ? offers : null, checklist, history),
      pending: supportsDirectAssignment && isLoadingAssignments,
    };
  }

  if (!runKnown) {
    return {
      messageKey: hasChecklistRunError ? "workspace.nextActionReadError" : "workspace.nextActionLoading",
      primaryAction: reminder,
      secondaryActions: secondary(offers, history),
      pending: isLoadingChecklistRun,
    };
  }

  if (checklistRun?.status === "READY_FOR_REVIEW") {
    return {
      messageKey: "checklists.existingRun",
      primaryAction: action("review", "workspace.reviewChecklist"),
      secondaryActions: secondary(reminder, offers, history),
      pending: false,
    };
  }

  if (checklistRun?.status === "DRAFT") {
    const recoveryNeeded = capabilityKnown
      && ["STALE", "REVOKED", "EXPIRED", "UNAVAILABLE"].includes(checklistCapability?.state);
    const canPrepareLink = ["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus);
    return {
      messageKey: recoveryNeeded && canPrepareLink
        ? "checklists.linkRecoveryGuidance" : "checklists.existingDraft",
      primaryAction: checklist,
      secondaryActions: secondary(reminder, offers, history),
      pending: false,
    };
  }

  if (checklistRun) {
    return {
      messageKey: checklistRun.status === "ABANDONED"
        ? "checklists.existingAbandoned" : "checklists.existingRunUnknown",
      primaryAction: checklist,
      secondaryActions: [history],
      pending: false,
    };
  }

  if (["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus)) {
    const createChecklist = action("checklist", "checklists.create");
    return {
      messageKey: job.operationalStatus === "IN_PROGRESS"
        ? "workspace.nextActionInProgress"
        : isAssignmentAware && !rosterKnown
          ? hasAssignmentsError ? "workspace.nextActionReadError" : "workspace.nextActionLoading"
          : "workspace.nextActionAssigned",
      primaryAction: reminder || createChecklist,
      secondaryActions: secondary(reminder ? createChecklist : null,
        action("completion", "jobs.completeService"), offers, history),
      pending: job.operationalStatus === "ASSIGNED" && isAssignmentAware && isLoadingAssignments,
    };
  }

}

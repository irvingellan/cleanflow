import { serviceTypeLabel } from "./serviceTypeMessages.js";
import { ServiceLifecycleRail } from "./ServiceLifecycleRail.jsx";
import { ChecklistProgressSummary } from "./ChecklistProgressSummary.jsx";
import { BackButton } from "../../components/UiPrimitives.jsx";
import { formatDate, formatServiceTime } from "../../lib/presentation.js";

/** The head of Job Detail: back button, title, context, the attention list, the lifecycle rail, the cleaner summary and the checklist progress summary. */
export function JobDetailHead({
  job,
  translate,
  language,
  onBack,
  isCompleted,
  completedAt,
  lifecyclePresentation,
  primaryIntent,
  focusIntentSection,
  issuesSectionRef,
  checklistSectionRef,
  chooseJobIntent,
  isLoadingAssignments,
  hasAssignmentsError,
  summaryCleanerNames,
}) {
  const checkIn = formatServiceTime(job.guestCheckInTime, language, { hourCycle: "h23" });
  return (
    <div className="cf-job__head">
    <BackButton onClick={onBack} />

    <h2 id="job-detail-title" className="panel__title">
      {job.propertyName || translate("properties.unnamed")}
    </h2>

    <p className="job-detail__context">
      <span>{formatDate(job.scheduledDate, translate, language)}</span>
      {job.scheduledStart && <span>{job.scheduledStart}</span>}
      <span>{serviceTypeLabel(language, job.serviceType)}</span>
      <span>{job.clientName || translate("common.notProvided")}</span>
    </p>
    {checkIn && <p className="job-detail__context">{translate("jobs.guestCheckInAt", { time: checkIn })}</p>}
    {isCompleted && <p className="job-detail__completion">
      {translate("jobs.completedTime")}: {completedAt || translate("common.notProvided")}
    </p>}
    {lifecyclePresentation.attention.length > 0 && <aside className="service-attention" aria-label={translate("dashboard.needsAttention")}>
      {lifecyclePresentation.attention.map((attention) => <div key={attention.kind}>
        <strong>{translate(attention.key, { count: attention.count })}</strong>
        {/* Review opens the same Run as the checklist primary; link controls and Issues are distinct targets. */}
        {(attention.kind !== "review" || primaryIntent.intent !== "checklist") && <button className="button button--small" type="button" onClick={() => attention.kind === "issues"
          ? focusIntentSection(issuesSectionRef) : attention.kind === "stale-link"
            ? focusIntentSection(checklistSectionRef) : chooseJobIntent("checklist")}>
          {translate(attention.kind === "issues" ? "dashboard.reviewIssue"
            : attention.kind === "review" ? "jobs.intentReview" : "lifecycle.linkControls")} →
        </button>}
      </div>)}
    </aside>}
    <ServiceLifecycleRail lifecycle={lifecyclePresentation.lifecycle} />

    <div className="service-cleaner-summary">
      <span>{translate("common.cleaner")}</span>
      <strong>{isLoadingAssignments ? translate("offers.loadingCleaners")
        : hasAssignmentsError ? translate("common.notProvided")
          : summaryCleanerNames.length ? summaryCleanerNames.join(", ")
            : job.assignedCleanerName || translate("dashboard.notAssigned")}</strong>
    </div>
    <ChecklistProgressSummary checklist={lifecyclePresentation.checklist} />
    </div>
  );
}

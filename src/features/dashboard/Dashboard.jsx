import { OperationalIcon } from "../../components/OperationalIcon.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { currentCleanerName } from "../cleaners/cleanerIdentity.js";
import { assignedCleanerSummary } from "../jobs/assignmentPresentation.js";
import {
  formatIssueCategory,
  issueIconName,
} from "../issues/issuePresentation.js";
import {
  formatCreatedAt,
  formatDate,
  formatOperationalStatus,
  formatShortWeekday,
} from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";

export function Dashboard({
  dashboardData,
  isLoading,
  hasError,
  translate,
  onRefresh,
  onOpenJob,
  onShowJobs,
  onShowJobsWithFilter,
}) {
  const { language } = useTranslation();

  if (isLoading) {
    return <StateCard message={translate("dashboard.loading")} status="status" />;
  }

  if (hasError) {
    return (
      <section className="dashboard-state" aria-live="polite">
        <StateCard message={translate("dashboard.error")} status="alert" isError />
        <button className="button" type="button" onClick={onRefresh}>
          {translate("dashboard.refresh")}
        </button>
      </section>
    );
  }

  const counts = dashboardData?.counts || {};
  const attentionJobs = dashboardData?.attentionJobs || [];
  const openIssues = dashboardData?.openIssues || [];
  const offersByJob = dashboardData?.offersByJob || {};
  const pendingOffersByJob = dashboardData?.pendingOffersByJob || {};
  const cleanerNamesById = dashboardData?.cleanerNamesById || {};
  const next48HoursJobs = dashboardData?.next48HoursJobs || [];
  const recentlyCompletedJobs = dashboardData?.recentlyCompletedJobs || [];
  const weeklySummary = dashboardData?.weeklySummary;
  const offeredJobsWithInterest = attentionJobs.filter(
    (job) =>
      job.operationalStatus === "OFFERED" &&
      !job.assignedCleanerId &&
      (offersByJob[job.id] || []).some((offer) => offer.status === "INTERESTED"),
  );
  const offeredJobsAwaitingResponse = attentionJobs.filter(
    (job) =>
      job.operationalStatus === "OFFERED" &&
      !job.assignedCleanerId &&
      !(offersByJob[job.id] || []).some((offer) => offer.status === "INTERESTED") &&
      pendingOffersByJob[job.id],
  );
  const jobsNeedingAssignment = attentionJobs.filter(
    (job) =>
      job.operationalStatus === "UNASSIGNED" ||
      (job.operationalStatus === "OFFERED" &&
        !job.assignedCleanerId &&
        !(offersByJob[job.id] || []).some((offer) => offer.status === "INTERESTED") &&
        !pendingOffersByJob[job.id]),
  );
  const buildAssignmentAttentionItem = (job, isUrgent = false) => ({
    id: `needs-assignment-${job.id}`,
    type: "assignment",
    icon: "assignment",
    isUrgent,
    job,
    label: translate("dashboard.needsAssignment"),
    detail:
      job.operationalStatus === "UNASSIGNED"
        ? translate("dashboard.noOffers")
        : translate("dashboard.noInterestedCleaners"),
    status: formatOperationalStatus(job.operationalStatus, translate),
    action:
      job.operationalStatus === "UNASSIGNED"
        ? translate("dashboard.sendOffers")
        : translate("dashboard.reviewOffers"),
  });
  const urgentAssignmentItems = sortByScheduledDate(
    jobsNeedingAssignment.filter(isNearTermJob),
  ).map((job) => buildAssignmentAttentionItem(job, true));
  const otherAssignmentItems = sortByScheduledDate(
    jobsNeedingAssignment.filter((job) => !isNearTermJob(job)),
  ).map((job) => buildAssignmentAttentionItem(job));
  const priorityGroups = [
    urgentAssignmentItems,
    sortByScheduledDate(offeredJobsWithInterest).map((job) => {
      const interestedNames = (offersByJob[job.id] || [])
        .filter((offer) => offer.status === "INTERESTED")
        .map((offer) =>
          currentCleanerName(
            offer.cleanerId,
            offer.cleanerName,
            cleanerNamesById,
            "",
          ),
        )
        .filter(Boolean)
        .join(", ");

      return {
        id: `interest-${job.id}`,
        type: "interested",
        icon: "user-check",
        job,
        label: translate("dashboard.cleanerInterested"),
        detail: interestedNames || translate("dashboard.cleanerInterestedDescription"),
        status: formatOperationalStatus(job.operationalStatus, translate),
        action: translate("dashboard.reviewAndAssign"),
      };
    }),
    sortIssuesByJobScheduledDate(openIssues).map((issue) => ({
      id: `issue-${issue.job.id}-${issue.id}`,
      type: "issue",
      icon: issueIconName(issue.category),
      job: issue.job,
      label: formatIssueCategory(issue.category, translate),
      detail: `${translate("dashboard.openIssue")} — ${issue.description}`,
      status: formatOperationalStatus(issue.job.operationalStatus, translate),
      action: translate("dashboard.reviewIssue"),
    })),
    sortByScheduledDate(offeredJobsAwaitingResponse).map((job) => ({
      id: `awaiting-response-${job.id}`,
      type: "awaiting",
      icon: "mail",
      job,
      label: translate("dashboard.offersAwaitingResponse"),
      detail: translate("dashboard.noInterestedCleaners"),
      status: formatOperationalStatus(job.operationalStatus, translate),
      action: translate("dashboard.reviewOffers"),
    })),
    otherAssignmentItems,
  ];
  const attentionItems = priorityGroups.flat();
  const visibleAttentionItems = selectPriorityAttentionItems(priorityGroups, 5);
  const hasMoreAttention =
    attentionItems.length > visibleAttentionItems.length ||
    counts.needsAssignment > attentionJobs.length ||
    visibleAttentionItems.length === 5;
  const next48HourGroups = groupNext48HourJobs(next48HoursJobs, translate);

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard__intro">
        <div>
          <p className="eyebrow">{translate("dashboard.managerWorkspace")}</p>
          <h2 id="dashboard-title" className="dashboard__title">
            {translate("dashboard.title")}
          </h2>
          <p>{translate("dashboard.subtitle")}</p>
        </div>
        <button className="button" type="button" onClick={onRefresh}>
          {translate("dashboard.refresh")}
        </button>
      </div>

      <div className="dashboard-summary" aria-label={translate("dashboard.operation")}>
        <SummaryCard
          label={translate("dashboard.today")}
          count={counts.today || 0}
          icon="calendar"
          onClick={() => onShowJobsWithFilter("today")}
        />
        <SummaryCard
          label={translate("dashboard.needsAssignment")}
          count={counts.needsAssignment || 0}
          icon="assignment"
          onClick={() => onShowJobsWithFilter("needs-assignment")}
        />
        <SummaryCard
          label={translate("dashboard.inProgress")}
          count={counts.inProgress || 0}
          icon="clock"
          onClick={() => onShowJobsWithFilter("in-progress")}
        />
        <SummaryCard
          label={translate("dashboard.completedToday")}
          count={counts.completedToday || 0}
          icon="check-circle"
          onClick={() => onShowJobsWithFilter("completed-today")}
        />
        <SummaryCard
          label={translate("dashboard.openIssues")}
          count={counts.openIssues || 0}
          icon="alert"
          tone="attention"
        />
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="attention-title">
          <div className="dashboard-panel__header dashboard-panel__header--action">
            <div>
              <p className="eyebrow">{translate("dashboard.priorities")}</p>
              <h3 id="attention-title">{translate("dashboard.needsAttention")}</h3>
              <p className="dashboard-panel__subtitle">
                {translate("dashboard.needsAttentionDescription")}
              </p>
            </div>
            {hasMoreAttention && (
              <button className="button button--small" type="button" onClick={onShowJobs}>
                {translate("dashboard.viewAll")}
              </button>
            )}
          </div>

          {visibleAttentionItems.length === 0 ? (
            <p className="dashboard-empty">{translate("dashboard.noAttention")}</p>
          ) : (
            <div className="attention-list">
              {visibleAttentionItems.map((item) => (
                <button
                  key={item.id}
                  className={`attention-item attention-item--${item.type}${
                    item.isUrgent ? " attention-item--urgent" : ""
                  }`}
                  type="button"
                  onClick={() => onOpenJob(item.job)}
                >
                  <span className="attention-item__label">
                    <OperationalIcon name={item.icon || "assignment"} />
                    {item.label}
                  </span>
                  <strong>{item.job.propertyName || translate("properties.unnamed")}</strong>
                  <span>{item.detail}</span>
                  <small>
                    {item.status} · {formatDate(item.job.scheduledDate, translate, language)}
                  </small>
                  <span className="attention-item__action">
                    {item.action} <span aria-hidden="true">→</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-panel" aria-labelledby="completed-title">
          <div className="dashboard-panel__header dashboard-panel__header--action">
            <div>
              <p className="eyebrow">{translate("dashboard.history")}</p>
              <h3 id="completed-title">{translate("dashboard.recentlyCompleted")}</h3>
            </div>
            <button className="button button--small" type="button" onClick={onShowJobs}>
              {translate("dashboard.viewAll")}
            </button>
          </div>

          {recentlyCompletedJobs.length === 0 ? (
            <p className="dashboard-empty">{translate("dashboard.noCompleted")}</p>
          ) : (
            <div className="recent-list">
              {recentlyCompletedJobs.map((job) => (
                <button
                  key={job.id}
                  className="recent-item"
                  type="button"
                  onClick={() => onOpenJob(job)}
                >
                  <strong>{job.propertyName || translate("properties.unnamed")}</strong>
                  <span>{formatDate(job.scheduledDate, translate, language)}</span>
                  <span>
                    {assignedCleanerSummary(
                      job,
                      cleanerNamesById,
                      translate,
                      translate("common.notProvided"),
                    )}
                  </span>
                  <small>
                    {formatCreatedAt(job.completedAt, language) ||
                      translate("dashboard.completionUnavailable")}
                  </small>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-panel" aria-labelledby="next-48-hours-title">
        <div className="dashboard-panel__header dashboard-panel__header--action">
          <div>
            <p className="eyebrow">{translate("dashboard.schedule")}</p>
            <h3 id="next-48-hours-title">{translate("dashboard.next48Hours")}</h3>
          </div>
          <button className="button button--small" type="button" onClick={onShowJobs}>
            {translate("dashboard.viewAll")}
          </button>
        </div>

        {next48HourGroups.length === 0 ? (
          <p className="dashboard-empty">{translate("dashboard.noNext48Hours")}</p>
        ) : (
          <div className="dashboard-next-list">
            {next48HourGroups.map(({ day, jobs }) => (
              <section key={day} className="dashboard-next-group" aria-label={day}>
                <h4>{day}</h4>
                {jobs.map((job) => (
                  <DashboardNextJob
                    key={job.id}
                    job={job}
                    cleanerNamesById={cleanerNamesById}
                    onOpen={onOpenJob}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </section>

      <DashboardWeekSummary summary={weeklySummary} />
    </section>
  );
}

function DashboardNextJob({ job, cleanerNamesById, onOpen }) {
  const { language, translate } = useTranslation();
  const schedule = [
    formatDate(job.scheduledDate, translate, language),
    job.scheduledStart,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button className="dashboard-next-item" type="button" onClick={() => onOpen(job)}>
      <span>{schedule}</span>
      <strong>{job.propertyName || translate("properties.unnamed")}</strong>
      <span className="dashboard-next-item__status">
        {formatOperationalStatus(job.operationalStatus, translate)}
      </span>
      <span>
        {assignedCleanerSummary(
          job,
          cleanerNamesById,
          translate,
          translate("dashboard.needsAssignment"),
        )}
      </span>
    </button>
  );
}

function DashboardWeekSummary({ summary }) {
  const { language, translate } = useTranslation();

  if (!summary) {
    return null;
  }

  const metrics = [
    { key: "scheduled", icon: "calendar", label: translate("dashboard.weeklyScheduled") },
    { key: "assigned", icon: "user-check", label: translate("dashboard.weeklyAssigned") },
    {
      key: "needsAssignment",
      icon: "assignment",
      label: translate("dashboard.weeklyNeedsAssignment"),
    },
    { key: "completed", icon: "check-circle", label: translate("dashboard.weeklyCompleted") },
  ];
  const maxDailyLoad = Math.max(1, ...summary.dailyLoad.map(({ count }) => count));

  return (
    <section className="dashboard-week" aria-labelledby="this-week-title">
      <div className="dashboard-week__header">
        <h3 id="this-week-title">
          <OperationalIcon name="calendar" />
          {translate("dashboard.thisWeek")}
        </h3>
      </div>

      <div className="dashboard-week__metrics">
        {metrics.map(({ key, icon, label }) => (
          <div key={key} className="dashboard-week__metric">
            <span>
              <OperationalIcon name={icon} />
              {label}
            </span>
            <strong>{summary[key] || 0}</strong>
          </div>
        ))}
      </div>

      <div className="dashboard-week__load" aria-label={translate("dashboard.dailyLoad")}>
        <span className="dashboard-week__load-title">{translate("dashboard.dailyLoad")}</span>
        <div className="dashboard-week__days">
          {summary.dailyLoad.map(({ date, count }) => (
            <div key={date} className="dashboard-week__day">
              <strong>{count}</strong>
              <span className="dashboard-week__bar" aria-hidden="true">
                <span style={{ height: `${(count / maxDailyLoad) * 100}%` }} />
              </span>
              <span>{formatShortWeekday(date, language)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function groupNext48HourJobs(jobs, translate) {
  const today = localDateKeyForDashboard(new Date());
  const tomorrow = localDateKeyForDashboard(
    new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1),
  );
  const followingDay = localDateKeyForDashboard(
    new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 2),
  );
  const groups = new Map();

  for (const job of jobs) {
    const groupKey = job.scheduledDate === today
      ? "dashboard.today"
      : job.scheduledDate === tomorrow
        ? "dashboard.tomorrow"
        : job.scheduledDate === followingDay
          ? "dashboard.followingDay"
          : null;

    if (groupKey) {
      const currentJobs = groups.get(groupKey) || [];
      currentJobs.push(job);
      groups.set(groupKey, currentJobs);
    }
  }

  return ["dashboard.today", "dashboard.tomorrow", "dashboard.followingDay"]
    .filter((groupKey) => groups.has(groupKey))
    .map((groupKey) => ({
      day: translate(groupKey),
      jobs: groups.get(groupKey),
    }));
}

function localDateKeyForDashboard(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function SummaryCard({ label, count, icon, tone, isActive, onClick }) {
  const className = [
    "summary-card",
    tone ? `summary-card--${tone}` : "",
    isActive ? "summary-card--active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!onClick) {
    return (
      <article className={className}>
        <span className="summary-card__label">
          <OperationalIcon name={icon} />
          {label}
        </span>
        <strong>{count}</strong>
      </article>
    );
  }

  return (
    <button
      className={className}
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
    >
      <span className="summary-card__label">
        <OperationalIcon name={icon} />
        {label}
      </span>
      <strong>{count}</strong>
    </button>
  );
}

function sortByScheduledDate(items) {
  return [...items].sort((firstItem, secondItem) =>
    (firstItem.scheduledDate || "").localeCompare(secondItem.scheduledDate || ""),
  );
}

function sortIssuesByJobScheduledDate(issues) {
  return [...issues].sort((firstIssue, secondIssue) =>
    (firstIssue.job.scheduledDate || "").localeCompare(
      secondIssue.job.scheduledDate || "",
    ),
  );
}

function isNearTermJob(job) {
  if (!job.scheduledDate) {
    return false;
  }

  const scheduledAt = new Date(
    `${job.scheduledDate}T${job.scheduledStart || "00:00:00"}`,
  );

  if (Number.isNaN(scheduledAt.getTime())) {
    return false;
  }

  return scheduledAt.getTime() <= Date.now() + 48 * 60 * 60 * 1000;
}

function selectPriorityAttentionItems(priorityGroups, maximumItems) {
  const visibleItems = [];
  const selectedIds = new Set();
  const addItem = (item) => {
    if (!item || selectedIds.has(item.id) || visibleItems.length >= maximumItems) {
      return;
    }

    selectedIds.add(item.id);
    visibleItems.push(item);
  };

  for (const group of priorityGroups) {
    addItem(group[0]);
  }

  for (const group of priorityGroups) {
    for (const item of group) {
      addItem(item);
    }
  }

  return visibleItems;
}

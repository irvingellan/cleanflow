import { useState } from "react";
import { Dashboard } from "./Dashboard.jsx";
import { Button, EmptyState, ErrorState, Icon, Panel, SegmentedControl, Skeleton, StateLabel, SyncLine } from "../../components/v2/primitives.jsx";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { CompactServiceLifecycle } from "../jobs/CompactServiceLifecycle.jsx";
import { assignedCleanerSummary } from "../jobs/assignmentPresentation.js";
import { formatCreatedAt, formatDate, formatShortWeekday } from "../../lib/presentation.js";
import "./dashboardV2.css";

// Imported only by the Sandbox build. This UI never chooses a backend or loads data.
export default function DashboardV2Pilot(props) {
  const [version, setVersion] = useState(() => new URLSearchParams(window.location.search).get("dashboard") === "v2" ? "v2" : "current");
  const selected = props.presentation ?? version;
  const t = props.translate;
  const choose = value => {
    setVersion(value);
    const url = new URL(window.location.href);
    if (value === "v2") url.searchParams.set("dashboard", "v2");
    else url.searchParams.delete("dashboard");
    window.history.replaceState(window.history.state, "", url);
  };
  return <div className="dashboard-pilot">
    {!props.hideComparison && <div className="dashboard-pilot-comparison"><StateLabel tone="sandbox" icon="flask">{t("dashboardV2.pilot")}</StateLabel>
      <SegmentedControl label={t("dashboardV2.compare")} value={version} onChange={choose}
        options={[{ value: "current", label: t("dashboardV2.current") }, { value: "v2", label: "V2" }]} />
    </div>}
    <Dashboard {...props} renderPresentation={selected === "v2" ? model => <DashboardV2 {...props} model={model} /> : undefined} />
  </div>;
}

export function DashboardV2({ model, dashboardData, isLoading, hasError, translate: t, onRefresh, onOpenJob, onShowJobs, onShowJobsWithFilter }) {
  const { language, counts, visibleAttentionItems, hasMoreAttention, next48HourGroups, offersByJob, cleanerNamesById, recentlyCompletedJobs, weeklySummary } = model;
  const ready = Boolean(dashboardData);
  const metrics = [["today", "today", "info", "calendar"], ["needsAssignment", "needs-assignment", "attention", "user"], ["inProgress", "in-progress", "brand", "clock"], ["completedToday", "completed-today", "success", "check"], ["openIssues", null, "risk", "warning"]];
  const cleaner = job => assignedCleanerSummary(job, cleanerNamesById, t);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return <section className="dashboard-v2" aria-labelledby="dashboard-v2-title">
    <header className="dashboard-v2-intro"><div><h2 id="dashboard-v2-title">{t("dashboard.title")}</h2>
      <p>{formatDate(todayKey, t, language)}</p></div>
      <div className="dashboard-v2-sync"><SyncLine status={isLoading ? "updating" : hasError ? "stale" : "updated"}>
        {t(isLoading ? ready ? "dashboardV2.refreshing" : "dashboard.loading" : hasError ? ready ? "dashboardV2.previousData" : "dashboard.error" : "dashboardV2.loaded")}
      </SyncLine><Button variant="secondary" icon="refresh" busy={isLoading} onClick={onRefresh}>{t("dashboard.refresh")}</Button></div>
    </header>
    {hasError && <ErrorState title={t("dashboard.error")} retryLabel={t("auth.managerAccessRetry")} onRetry={onRefresh}>
      {ready && t("dashboardV2.previousData")}
    </ErrorState>}
    {ready && isLoading && <p className="dashboard-v2-retained" role="status">{t("dashboardV2.previousData")}</p>}
    <div className="dashboard-v2-metrics" aria-label={t("dashboard.operation")}>
      {metrics.map(([key, filter, tone, icon]) => {
        const content = <><span><span className="dashboard-v2-metric-icon" data-tone={tone} aria-hidden="true">{icon === "calendar" ? <svg className="cfv2-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M4 5h16v16H4zM8 3v4M16 3v4M4 10h16" /></svg> : <Icon name={icon} />}</span>{t(`dashboard.${key}`)}</span>{ready ? <strong>{counts[key] || 0}</strong> : hasError ? <small>{t("common.notProvided")}</small> : <Skeleton label={t("dashboard.loading")} rows={1} />}</>;
        const className = `dashboard-v2-metric${key === "openIssues" && ready && counts[key] > 0 ? " dashboard-v2-metric--risk" : ""}`;
        return filter ? <button key={key} className={className} type="button" disabled={!ready} onClick={() => onShowJobsWithFilter(filter)}>{content}</button>
          : <div key={key} className={className}>{content}</div>;
      })}
    </div>
    {!ready && hasError ? null : <>
      <div className="dashboard-v2-main">
        <Panel className="dashboard-v2-attention"><SectionHeader title={t("dashboard.needsAttention")} action={ready && hasMoreAttention ? onShowJobs : null} t={t} />
          {!ready ? <Skeleton label={t("dashboard.loading")} rows={3} /> : visibleAttentionItems.length === 0 ? <EmptyState title={t("dashboard.noAttention")} /> :
            <div className="dashboard-v2-rows">{visibleAttentionItems.map(item => {
              const tone = item.type === "issue" ? "risk" : item.isUrgent ? "attention" : item.type === "interested" ? "warning" : item.type === "awaiting" ? "info" : "neutral";
              return <button type="button" key={item.id} className="dashboard-v2-attention-row" data-tone={tone} onClick={() => onOpenJob(item.job)}>
              <span className="dashboard-v2-attention-content"><span className="dashboard-v2-reason"><StateLabel tone={tone}
                icon={item.type === "issue" ? "warning" : item.type === "awaiting" ? "send" : "user"}>{item.label}</StateLabel><small>{formatDate(item.job.scheduledDate, t, language)}{item.job.scheduledStart && ` · ${item.job.scheduledStart}`}</small></span>
                <strong>{item.job.propertyName || t("properties.unnamed")}</strong><span className="dashboard-v2-secondary">{item.detail}</span><small>{item.status}</small></span>
              <span className="dashboard-v2-action">{item.action} <span aria-hidden="true">→</span></span>
            </button>;})}</div>}
        </Panel>
        <Panel className="dashboard-v2-next"><SectionHeader title={t("dashboard.next48Hours")} t={t} />
          {!ready ? <Skeleton label={t("dashboard.loading")} rows={3} /> : next48HourGroups.length === 0 ? <EmptyState title={t("dashboard.noNext48Hours")} /> : next48HourGroups.map(group =>
            <div key={group.day}><h4 className="dashboard-v2-day">{group.day} · {formatDate(group.jobs[0].scheduledDate, t, language)}</h4>
              <div className="dashboard-v2-rows">{group.jobs.map(job => <button type="button" key={job.id} className="dashboard-v2-next-row" onClick={() => onOpenJob(job)}>
                <span className="dashboard-v2-time">{job.scheduledStart || t("common.notProvided")}</span>
                <span className="dashboard-v2-identity"><strong>{job.propertyName || t("properties.unnamed")}</strong><span className="dashboard-v2-secondary">{cleaner(job) || t("dashboard.needsAssignment")}</span></span>
                <CompactServiceLifecycle job={job} offers={offersByJob[job.id]?.length ? offersByJob[job.id] : undefined} />
              </button>)}</div>
            </div>)}
        </Panel>
      </div>
      <div className="dashboard-v2-secondary-grid">
        <Panel className="dashboard-v2-recent"><SectionHeader title={t("dashboard.recentlyCompleted")} t={t} />
          {!ready ? <Skeleton label={t("dashboard.loading")} rows={2} /> : recentlyCompletedJobs.length === 0 ? <EmptyState title={t("dashboard.noCompleted")} /> :
            <div className="dashboard-v2-rows">{recentlyCompletedJobs.map(job => <button type="button" key={job.id} className="dashboard-v2-recent-row" onClick={() => onOpenJob(job)}>
              <span className="dashboard-v2-identity"><strong>{job.propertyName || t("properties.unnamed")}</strong><span className="dashboard-v2-secondary">{cleaner(job) || t("common.notProvided")}</span><small>{formatDate(job.scheduledDate, t, language)}</small></span>
              <span className="dashboard-v2-secondary">{job.completedAt ? formatCreatedAt(job.completedAt, language) : t("dashboard.completionUnavailable")}</span>
            </button>)}</div>}
        </Panel>
        {(!ready || weeklySummary) && <Panel className="dashboard-v2-week"><SectionHeader title={t("dashboard.thisWeek")} t={t} />
          {!ready ? <Skeleton label={t("dashboard.loading")} rows={2} /> : <>
            <div className="dashboard-v2-week-metrics">{[["scheduled", "weeklyScheduled"], ["assigned", "weeklyAssigned"], ["needsAssignment", "weeklyNeedsAssignment"], ["completed", "weeklyCompleted"]].map(([key, label]) => <div key={key}><span>{t(`dashboard.${label}`)}</span><strong>{weeklySummary[key] || 0}</strong></div>)}</div>
            <h4 className="dashboard-v2-day">{t("dashboard.dailyLoad")}</h4>
            <div className="dashboard-v2-workload">{weeklySummary.dailyLoad.map(day => <div key={day.date}><strong>{day.count}</strong><span className="dashboard-v2-bar" aria-hidden="true"><span style={{ height: `${day.count / Math.max(1, ...weeklySummary.dailyLoad.map(item => item.count)) * 100}%` }} /></span><span>{formatShortWeekday(day.date, language)}</span></div>)}</div>
          </>}
        </Panel>}
      </div>
    </>}
    <ScrollToTopButton />
  </section>;
}

function SectionHeader({ title, action, t }) {
  return <header className="dashboard-v2-section-header"><h3>{title}</h3>{action && <Button variant="tertiary" onClick={action}>{t("dashboard.viewAll")} <span aria-hidden="true">→</span></Button>}</header>;
}

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { Dashboard } from "../dashboard/Dashboard.jsx";
import { JobsPage } from "../jobs/JobsPage.jsx";
import { assignedCleanerSummary } from "../jobs/assignmentPresentation.js";
import { CompactServiceLifecycle } from "../jobs/CompactServiceLifecycle.jsx";
import { DataProvenanceBadge } from "../../components/DataProvenanceBadge.jsx";
import { Banner, Button, EmptyState, ErrorState, Icon, Panel, Row, SearchField, SegmentedControl, Select, Skeleton, StateLabel } from "../../components/v2/primitives.jsx";
import { formatDate } from "../../lib/presentation.js";
import { inRange, laDateKey, rangeFor, shiftRange } from "./workspaceV3Model.js";
import { workspaceText } from "./workspaceMessages.js";
import { settingsText } from "./workspaceSettingsMessages.js";
import "./workspaceV3.css";

const operationViews = new Set(["job-list", "job-detail", "offer-cleaners", "checklist-run", "cleaner-job"]);

// Composition only: all records, loading state and action handlers belong to App's existing controllers.
export default function ManagerWorkspaceV3({ view, dashboard, worklist, selectedJob, onNow, onOperation, onExit, onBack, children, now }) {
  const { language, translate } = useTranslation();
  const t = key => workspaceText(language, key);
  const today = laDateKey(now);
  const [range, setRange] = useState(() => rangeFor("today", today, today));
  const [lastSelectedId, setLastSelectedId] = useState(null);
  const detail = useRef(null);
  const isNow = view === "dashboard", isOperation = operationViews.has(view);
  useEffect(() => {
    if ((isNow || view === "job-list") && window.history.state?.workspaceV3Detail) {
      const { workspaceV3Detail, ...rest } = window.history.state;
      window.history.replaceState(rest, "", window.location.href);
    }
  }, [isNow, view]);
  useEffect(() => {
    if (view === "job-detail") detail.current?.focus({ preventScroll: true });
  }, [view, selectedJob?.id]);
  useEffect(() => {
    const back = () => { if (operationViews.has(view) && view !== "job-list" && !window.history.state?.workspaceV3Detail) onBack(); };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [view, onBack]);
  function open(job, handler) {
    setLastSelectedId(job.id);
    if (isNow || view === "job-list") window.history.pushState({ ...window.history.state, workspaceV3Detail: true }, "", window.location.href);
    handler(job);
  }
  function openDay(day) { setRange(rangeFor("day", day, today)); onOperation(); }
  const format = date => formatDate(date, translate, language);
  return <section className="workspace-v3" data-workspace="hybrid-c-a" aria-labelledby="workspace-v3-title">
    <header className="workspace-v3-header">
      <div><h2 id="workspace-v3-title">{isNow ? t("now") : t("operation")}</h2><span className="workspace-v3-preview-label">{t("preview")}</span></div>
      <div className="workspace-v3-actions"><Button variant="secondary" onClick={onExit}>{t("exit")}</Button>
        <Button onClick={worklist.onCreate}>{translate("jobs.newService")}</Button></div>
    </header>
    <div className="workspace-v3-navigation">
      <SegmentedControl label={t("preview")} value={isNow ? "now" : "operation"} onChange={v => v === "now" ? onNow() : onOperation()}
        options={[{ value: "now", label: t("now") }, { value: "operation", label: t("operation") }]} />
      <div className="workspace-v3-dates" role="group" aria-label={t("timezone")}>
        <Button variant="secondary" icon="chevron" className="workspace-v3-prev" aria-label={t("previous")} onClick={() => setRange(r => shiftRange(r, -1, today))} />
        {["today", "tomorrow", "week"].map(kind => <Button key={kind} variant="secondary" aria-pressed={range.kind === kind} onClick={() => setRange(rangeFor(kind, range.anchor, today))}>{t(kind)}</Button>)}
        <Button variant="secondary" icon="chevron" aria-label={t("next")} onClick={() => setRange(r => shiftRange(r, 1, today))} />
        <label className="workspace-v3-date-input">{t("date")}<input type="date" value={range.anchor} onChange={e => { if (e.target.validity.valid && e.target.value) setRange(rangeFor("day", e.target.value, today)); }} /></label>
      </div>
    </div>
    <p className="workspace-v3-period">{format(range.start)}{range.end !== range.start ? ` — ${format(range.end)}` : ""} · {t("timezone")}</p>
    <div hidden={!isNow}>
      <Dashboard {...dashboard} translate={translate} renderPresentation={model => <WorkspaceAgora active={isNow} {...{ model, dashboard, t, translate, range, today, format, openDay, onOperation }}
        onOpen={job => open(job, dashboard.onOpenJob)} onCreate={worklist.onCreate} />} />
    </div>
    <div className="workspace-v3-work" hidden={!isOperation} data-detail-open={view !== "job-list"}>
      <aside className="workspace-v3-worklist" aria-label={translate("jobs.title")}>
        <JobsPage {...worklist} renderPresentation={model => <WorkspaceList {...{ model, worklist, range, t, translate, format }} selectedId={selectedJob?.id || lastSelectedId}
          onOpen={job => open(job, worklist.onSelect)} />} />
      </aside>
      <div key={selectedJob?.id || "no-job"} className="workspace-v3-detail" ref={detail} tabIndex={-1} aria-label={t("selected")}>
        {selectedJob && !inRange(selectedJob.scheduledDate, range) && <p role="status" className="workspace-v3-outside">{t("outside")}</p>}
        {view === "job-list" ? <EmptyState title={t("choose")} /> : isOperation ? children : null}
      </div>
    </div>
    {!isNow && !isOperation && children}
  </section>;
}

function WorkspaceList({ model, worklist: w, range, t, translate, format, selectedId, onOpen }) {
  const { sortedJobs, cleanerNamesById, statusOptions, dateOptions, jobCardElements } = model;
  const visible = sortedJobs.filter(job => inRange(job.scheduledDate, range));
  return <>
    <SearchField label={t("searchScope")} value={w.filters.search} clearLabel={t("clear")} onChange={e => w.onFiltersChange({ search: e.target.value })} />
    <Select label={translate("jobs.statusFilter")} value={w.filters.status} options={statusOptions.map(([value, label]) => ({ value, label }))} onChange={e => w.onFiltersChange({ status: e.target.value })} />
    {w.filters.clientName && <p className="workspace-v3-scope">{translate("jobs.clientContext", { client: w.filters.clientName })}</p>}
    <details className="workspace-v3-filters"><summary>{t("filters")}</summary>
      <Select label={t("serviceScope")} value={w.filters.datePreset} options={dateOptions.map(([value, label]) => ({ value, label }))} onChange={e => w.onFiltersChange({ datePreset: e.target.value })} />
      <Select label={translate("jobs.cleanerFilter")} value={w.filters.cleanerId} options={[{ value: "", label: translate("jobs.anyCleaner") }, ...w.cleaners.map(c => ({ value: c.id, label: c.name }))]} onChange={e => w.onFiltersChange({ cleanerId: e.target.value })} />
      <Select label={translate("jobs.propertyFilter")} value={w.filters.propertyId} options={[{ value: "", label: translate("jobs.anyProperty") }, ...w.properties.map(p => ({ value: p.id, label: p.name }))]} onChange={e => w.onFiltersChange({ propertyId: e.target.value })} />
      <Button variant="tertiary" onClick={w.onClearFilters}>{translate("jobs.clearFilters")}</Button>
      {w.canManageExcluded && <Button variant="tertiary" onClick={w.onToggleExcluded}>{translate(w.showExcluded ? "archive.hideExcluded" : "archive.showExcluded")}</Button>}
    </details>
    <p className="workspace-v3-scope">{t("scope")}</p>
    {w.isLoading && <Skeleton label={translate("jobs.loading")} rows={3} />}
    {w.hasError && <ErrorState title={translate("jobs.error")} retryLabel={translate("auth.managerAccessRetry")} onRetry={w.onRetry} />}
    {!w.isLoading && !w.hasError && !visible.length && <EmptyState title={t("empty")} />}
    <div className="workspace-v3-rows" aria-busy={w.isLoading}>
      {visible.map(job => <Row key={job.id} dense selected={job.id === selectedId} data-job-id={job.id}
        elementRef={element => { if (element) jobCardElements.current.set(job.id, element); else jobCardElements.current.delete(job.id); }}
        onClick={() => onOpen(job)}>
        <span className="workspace-v3-row-time">{job.scheduledStart || translate("jobs.notSet")}<small>{format(job.scheduledDate)}</small></span>
        <span className="workspace-v3-row-identity"><strong>{job.propertyName || translate("properties.unnamed")}</strong><span>{assignedCleanerSummary(job, cleanerNamesById, translate)}</span><CompactServiceLifecycle job={job} translate={translate} /><span className="workspace-v3-meta"><DataProvenanceBadge record={job} />{job.archivedAt && translate("archive.excluded")}</span></span>
      </Row>)}
    </div>
    {w.hasMore && <Button variant="secondary" busy={w.isLoadingMore || w.isLoading} onClick={w.onLoadMore}>{translate(w.isLoadingMore ? "jobs.loadingMore" : "jobs.loadMore")}</Button>}
  </>;
}

function WorkspaceAgora({ active, model, dashboard: d, t, translate, range, today, format, openDay, onOperation, onOpen, onCreate }) {
  const [search, setSearch] = useState("");
  const searchHost = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    function shortcut(e) { if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest("input,textarea,select,[contenteditable=true]")) { e.preventDefault(); searchHost.current?.querySelector("input")?.focus(); } }
    document.addEventListener("keydown", shortcut); return () => document.removeEventListener("keydown", shortcut);
  }, [active]);
  const ready = Boolean(d.dashboardData) && !d.isLoading && !d.hasError;
  const { visibleAttentionItems, hasMoreAttention, counts, next48HourGroups } = model;
  const attention = visibleAttentionItems.filter(item => inRange(item.job.scheduledDate, range)
    || inRange(today, range) && item.job.scheduledDate < today);
  const nextJobs = next48HourGroups.flatMap(group => group.jobs);
  const candidates = [...new Map([...visibleAttentionItems.map(i => i.job), ...nextJobs].map(j => [j.id, j])).values()];
  const matches = candidates.filter(j => (j.propertyName || "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div className="workspace-v3-now">
    <div ref={searchHost} className="workspace-v3-command"><SearchField label={t("command")} value={search} clearLabel={t("clear")} onChange={e => setSearch(e.target.value)} />
      <div className="workspace-v3-actions"><Button variant="secondary" icon="user" onClick={() => onOperation({ status: "needs-assignment" })}>{translate("jobs.intent.assignment")}</Button>
        <Button variant="secondary" icon="clock" onClick={() => onOperation({ status: "in-progress" })}>{translate("dashboard.inProgress")}</Button>
        <Button variant="secondary" icon="jobs" onClick={onCreate}>{translate("jobs.newService")}</Button></div>
    </div>
    <LoadingMotionPreview active={active} label={translate("dashboard.loading")} />
    {d.isLoading && <WorkspaceLoading label={translate("dashboard.loading")} active={active} />}
    {d.hasError && <div className="workspace-v3-load-error"><Banner tone="risk" role="alert" title={translate("dashboard.error")}
      action={<Button variant="secondary" icon="refresh" onClick={d.onRefresh}>{translate("auth.managerAccessRetry")}</Button>}>
      <p>{t(d.loadFailure?.code === "deadline-exceeded" ? "failureTimeout" : d.loadFailure?.code === "permission-denied" || d.loadFailure?.code === "unauthenticated" ? "failureAccess" : d.loadFailure?.code === "failed-precondition" ? "failureConfiguration" : "failureRead")}</p>
      {d.loadFailure && <details><summary>{t("technical")}</summary><code>{d.loadFailure.code} · {d.loadFailure.stages.join(", ") || "unknown"}</code></details>}
    </Banner><Button variant="tertiary" icon="jobs" onClick={() => onOperation()}>{t("openServices")}</Button></div>}
    {ready && <>
      <p className="workspace-v3-scope workspace-v3-data-notice"><Icon name="info" />{t("dashboardScope")}</p>
      {search ? <Panel title={t("searchScope")}>{matches.length ? matches.map(job => <Row key={job.id} onClick={() => onOpen(job)}>{job.propertyName} · {job.scheduledStart || translate("jobs.notSet")}</Row>) : <EmptyState title={t("empty")} />}</Panel> :
      <div className="workspace-v3-now-columns">
        <div><Panel title={t("start")} className="workspace-v3-start">
          {attention[0] ? <AttentionItem item={attention[0]} {...{ onOpen, translate, t }} primary /> : <EmptyState title={t("noAttention")} />}
        </Panel><Panel title={`${t("attention")} · ${attention.length}`}>
          {attention.length > 1 ? attention.slice(1).map(item => <AttentionItem key={item.id} {...{ item, onOpen, translate, t }} />) : <p className="workspace-v3-scope">{t("noAdditionalAttention")}</p>}
          {hasMoreAttention && <Button variant="tertiary" onClick={() => onOperation()}>{translate("dashboard.viewAll")}</Button>}
        </Panel></div>
        <div><Panel title={t("summary")}><dl className="workspace-v3-metrics">
          {[["needsAssignment", "dashboard.needsAssignment", "user", "attention"], ["inProgress", "dashboard.inProgress", "clock", "info"], ["openIssues", "dashboard.openIssues", "warning", "risk"]].map(([field, key, icon, tone]) => <div key={field} data-tone={tone}><dt><Icon name={icon} />{translate(key)}</dt><dd>{counts[field] ?? translate("common.notProvided")}</dd></div>)}
        </dl></Panel>
        {[today, rangeFor("tomorrow", today, today).start].map((date, i) => <Panel key={date} title={`${t(i ? "tomorrow" : "today")} · ${format(date)}`}>
          {!nextJobs.some(job => job.scheduledDate === date) && <p className="workspace-v3-scope">{t("dayEmpty")}</p>}
          {nextJobs.filter(job => job.scheduledDate === date).slice(0, 4).map(job => <Row key={job.id} onClick={() => onOpen(job)}><strong>{job.scheduledStart || translate("jobs.notSet")}</strong><span className="workspace-v3-day-identity"><strong>{job.propertyName}</strong><small>{assignedCleanerSummary(job, d.dashboardData.cleanerNamesById || {}, translate)}</small></span></Row>)}
          <Button variant="tertiary" onClick={() => openDay(date)}>{t("viewDay")}</Button>
        </Panel>)}</div>
      </div>}
      <Button variant="secondary" onClick={d.onRefresh} busy={d.isLoading}>{translate("dashboard.refresh")}</Button>
    </>}
  </div>;
}
function AttentionItem({ item, onOpen, t, primary }) {
  return <div className="workspace-v3-attention" data-primary={primary || undefined} data-tone={item.type === "issue" ? "risk" : "attention"}>
    <div className="workspace-v3-attention-copy"><StateLabel tone={item.type === "issue" ? "risk" : "attention"} icon={item.type === "issue" ? "warning" : "info"}>{item.label}</StateLabel>
    <h3>{item.job.propertyName}</h3><p>{item.job.scheduledStart} · {item.detail}</p>
    {item.type === "interested" && <p>{t("interest")}</p>}</div>
    <Button icon="arrow" variant={primary ? "primary" : "secondary"} onClick={() => onOpen(item.job)} aria-label={`${item.action} · ${item.job.propertyName}`}>{item.action}</Button>
  </div>;
}

function WorkspaceLoading({ label, active }) {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => { const change = () => setVisible(!document.hidden); document.addEventListener("visibilitychange", change); return () => document.removeEventListener("visibilitychange", change); }, []);
  return <div className="workspace-v3-loading" role="status" aria-label={label} data-paused={!visible || !active}>
    <p>{label}</p><div className="workspace-v3-loading-grid" aria-hidden="true">
      <div className="workspace-v3-loading-main"><div className="workspace-v3-loading-panel workspace-v3-loading-hero"><span /><span /><span /></div>
        <div className="workspace-v3-loading-panel">{[0, 1, 2, 3].map(i => <div className="workspace-v3-loading-row" key={i}><span /><span /></div>)}</div></div>
      <div className="workspace-v3-loading-side">{[0, 1, 2].map(i => <div className="workspace-v3-loading-panel" key={i}><span /><span /><span /></div>)}</div>
    </div>
  </div>;
}

function LoadingMotionPreview({active,label}) {
  const {language}=useTranslation();const t=key=>settingsText(language,key);
  const [show,setShow]=useState(false);const trigger=useRef(null);
  useEffect(()=>{
    if(!show)return;
    const timer=setTimeout(()=>setShow(false),4000);
    const escape=event=>{if(event.key==="Escape"){setShow(false);trigger.current?.focus();}};
    document.addEventListener("keydown",escape);
    return()=>{clearTimeout(timer);document.removeEventListener("keydown",escape);};
  },[show]);
  useEffect(()=>{if(!active)setShow(false);},[active]);
  return <><Button ref={trigger} variant="tertiary" icon="refresh" onClick={()=>setShow(true)} aria-expanded={show}>{t("motion")}</Button>
    {show&&active&&<aside className="workspace-v3-motion-preview" aria-label={t("motionTitle")}>
      <header><strong>{t("motionTitle")}</strong><button className="cfv2-button cfv2-button-icon" type="button" aria-label={t("close")} onClick={()=>{setShow(false);trigger.current?.focus();}}><Icon name="close"/></button></header>
      <p>{t("motionNote")}</p><WorkspaceLoading active={active} label={label}/>
    </aside>}</>;
}

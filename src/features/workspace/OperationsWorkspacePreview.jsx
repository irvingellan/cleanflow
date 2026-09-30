import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { languageOptions, useTranslation } from "../../i18n/translations.js";
import { assignedCleanerSummary } from "../jobs/assignmentPresentation.js";
import { JobDetail } from "../jobs/JobDetail.jsx";
import { CreateCleaningForm } from "../jobs/JobForm.jsx";
import { OfferCleaners } from "../jobs/JobWorkflowViews.jsx";
import { JobsPage } from "../jobs/JobsPage.jsx";
import { createJobListFilters } from "../jobs/jobListFilters.js";
import { getJobById } from "../jobs/jobService.js";
import { useJobDetailController } from "../jobs/useJobDetailController.js";
import { useJobsWorklist } from "../jobs/useJobsWorklist.js";
import { ChecklistRunDetail } from "../checklists/ChecklistRunDetail.jsx";
import { usePropertiesController } from "../properties/usePropertiesController.js";
import { deriveWorkspaceNextAction } from "./workspaceNextAction.js";
import "./workspace.css";

const actionLabels = {
  assign: "jobs.assignCleanerDirectly", reminder: "jobs.prepareCleanerMessage",
  message: "jobs.prepareCleanerMessage", checklist: "checklists.title",
  completion: "jobs.completeService", offers: "offers.title", "offer-select": "offers.offerToCleaners",
  details: "jobs.editDetails", prices: "jobs.editPrices", schedule: "jobs.editSchedule",
  issues: "issues.title", create: "jobs.newService",
};

/** Local/emulator-only working surface; all domain operations stay in existing services. */
export default function OperationsWorkspacePreview({ authUser }) {
  const { language, setLanguage, translate } = useTranslation();
  const worklist = useJobsWorklist({ view: "job-list" });
  const { directory: propertyDirectory } = usePropertiesController({ actorUid: authUser.uid });
  const controller = useJobDetailController({
    view: "job-detail", actorUid: authUser.uid, onJobUpdated: worklist.replaceJob,
    cleanerSource: { cleaners: worklist.cleaners.filter((cleaner) => cleaner.active === true && !cleaner.archivedAt),
      isLoading: worklist.isLoading, hasError: worklist.hasError },
  });
  const { job, detail, offerFlow, actions } = controller;
  const [action, setAction] = useState(null);
  const [showRun, setShowRun] = useState(false);
  const [panelHost, setPanelHost] = useState(null);
  const [selectionError, setSelectionError] = useState(false);
  const [isResolvingJob, setIsResolvingJob] = useState(false);
  const selectionRequest = useRef(0);
  const selectedId = useRef(null);
  selectedId.current = job?.id;
  const listScroll = useRef(0);
  const listRef = useRef(null);
  const panelRef = useRef(null);
  const nextActionsRef = useRef(null);
  const actionGeneration = useRef(0);
  const [actionHeight, setActionHeight] = useState(180);
  const returnFocus = useRef(null);

  function openAction(next) {
    actionGeneration.current += 1;
    if (next === "review" || next === "history") {
      setAction(null);
      setShowRun(Boolean(detail.checklistRun));
      return;
    }
    if (next === "checklist" && (job?.archivedAt || job?.operationalStatus === "COMPLETED")) {
      setAction(null); setShowRun(Boolean(detail.checklistRun)); return;
    }
    setAction(next);
  }

  function closePanel() { actionGeneration.current += 1; setAction(null); }

  function selectJob(nextJob, { updateUrl = true } = {}) {
    selectionRequest.current += 1;
    listScroll.current = window.scrollY;
    setSelectionError(false);
    setIsResolvingJob(false);
    setAction(null);
    setShowRun(false);
    controller.openJob(nextJob);
    if (updateUrl) window.history.pushState(null, "", `?job=${encodeURIComponent(nextJob.id)}`);
    if (window.innerWidth < 1000) window.scrollTo({ top: 0, behavior: "auto" });
  }

  function backToList({ updateUrl = true } = {}) {
    const previousId = job?.id;
    selectionRequest.current += 1;
    setIsResolvingJob(false);
    setAction(null);
    setShowRun(false);
    controller.closeJob();
    if (updateUrl) window.history.pushState(null, "", window.location.pathname);
    requestAnimationFrame(() => {
      window.scrollTo({ top: listScroll.current, behavior: "auto" });
      [...(listRef.current?.querySelectorAll("[data-job-id]") || [])]
        .find((element) => element.dataset.jobId === previousId)?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    let active = true;
    async function resolveLocation() {
      const id = new URLSearchParams(window.location.search).get("job");
      const request = ++selectionRequest.current;
      setAction(null);
      setShowRun(false);
      controller.closeJob();
      setSelectionError(false);
      if (!id) { setIsResolvingJob(false); requestAnimationFrame(() => window.scrollTo({ top: listScroll.current, behavior: "auto" })); return; }
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) { setIsResolvingJob(false); setSelectionError(true); return; }
      setIsResolvingJob(true);
      try {
        const loaded = await getJobById(id);
        if (active && request === selectionRequest.current) {
          if (loaded) controller.openJob(loaded);
          else setSelectionError(true);
        }
      } catch {
        if (active && request === selectionRequest.current) setSelectionError(true);
      } finally {
        if (active && request === selectionRequest.current) setIsResolvingJob(false);
      }
    }
    resolveLocation();
    window.addEventListener("popstate", resolveLocation);
    return () => { active = false; selectionRequest.current += 1; window.removeEventListener("popstate", resolveLocation); };
  }, []);

  const panelOpen = action !== null;
  useEffect(() => {
    const element = nextActionsRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setActionHeight(element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [job?.id]);
  useEffect(() => {
    if (!panelOpen) return;
    returnFocus.current = document.activeElement;
    panelRef.current?.querySelector("button")?.focus();
    function handleKey(event) {
      if (event.key === "Escape") { event.preventDefault(); closePanel(); }
      if (event.key !== "Tab") return;
      const elements = [...panelRef.current.querySelectorAll("button, input, select, textarea, a[href]")]
        .filter((element) => !element.disabled && !element.closest("[hidden]"));
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); returnFocus.current?.focus?.({ preventScroll: true }); };
  }, [panelOpen]);

  function renderSection(name, content) {
    if (!panelHost) return null;
    const visible = action === name || (name === "assign" && action === "reminder");
    // Stable portal/container retains newly issued link and unfinished form state on close.
    return createPortal(<div hidden={!visible} key={name}>{content}</div>, panelHost, name);
  }

  const next = deriveWorkspaceNextAction({ job, ...detail });
  const historical = Boolean(job?.archivedAt || job?.operationalStatus === "COMPLETED");
  const cleanerNames = Object.fromEntries(worklist.cleaners.map((cleaner) => [cleaner.id, cleaner.name]));
  const selectionEpochId = job?.id;
  const requestAtRender = selectionRequest.current;
  const actionAtRender = actionGeneration.current;
  async function createRun() {
    try {
      await actions.createChecklistRun();
      // Remain in link preparation rather than navigating away from the workspace.
    } catch { /* the existing controller renders create failure */ }
  }
  async function assignDirectly(cleanerId) {
    const updated = await actions.assignCleanerDirectly(cleanerId);
    if (updated && selectedId.current === selectionEpochId
      && selectionRequest.current === requestAtRender
      && actionGeneration.current === actionAtRender && action === "assign") closePanel();
    return updated;
  }

  return <main style={{ "--workspace-action-height": `${actionHeight}px` }} className={`operations-workspace${job ? " operations-workspace--selected" : ""}${panelOpen ? " operations-workspace--panel-open" : ""}`}>
    <header className="workspace-header" inert={panelOpen}>
      <div><p className="eyebrow">CleanFlow · {translate("workspace.experimental")}</p>
        <h1>{translate("workspace.title")}</h1><p>{translate("workspace.localOnly")}</p></div>
      <div className="button-row">
        <label>{translate("common.language")} <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
        </select></label>
        <a className="button" href="/">{translate("workspace.controlUi")}</a>
      </div>
    </header>
    <div className="workspace-grid" inert={panelOpen}>
      <aside className="workspace-job-list" ref={listRef} aria-label={translate("jobs.title")}>
        <JobsPage embedded selectedJobId={job?.id} {...worklist}
          jobs={worklist.jobs} properties={propertyDirectory.properties}
          onSelect={selectJob} onCreate={() => openAction("create")}
          onFiltersChange={(updates) => worklist.setFilters((current) => ({ ...current, ...updates }))}
          onClearFilters={() => worklist.setFilters(createJobListFilters())}
          onLoadMore={worklist.loadMore} />
      </aside>
      <section className="workspace-detail" aria-label={translate("workspace.selectedJob")}>
        {isResolvingJob && <StateCard message={translate("jobs.loading")} status="status" />}
        {selectionError && <StateCard message={translate("jobs.error")} status="alert" isError />}
        {!job && !isResolvingJob && !selectionError && <div className="workspace-empty"><h2>{translate("workspace.selectJob")}</h2></div>}
        {job && <>
          <div className="workspace-detail-toolbar">
            <button className="button" type="button" onClick={() => backToList()}>{translate("workspace.backToServices")}</button>
            {showRun && <button className="button" type="button" onClick={() => setShowRun(false)}>{translate("workspace.jobSummary")}</button>}
          </div>
          <p className="workspace-mobile-guidance" role={next.pending ? "status" : undefined}>{translate(next.messageKey)}</p>
          <div hidden={showRun}>
            <JobDetail key={job.id} job={job} {...detail}
              property={propertyDirectory.properties.find((property) => property.id === job.propertyId) || null}
              knownCleaners={worklist.cleaners} availableCleaners={offerFlow.availableCleaners}
              isLoadingCleaners={offerFlow.isLoadingCleaners} hasCleanerError={offerFlow.hasCleanerError}
              offersCreatedCount={offerFlow.offersCreatedCount}
              workspace={{ action, renderSection, onAction: openAction }}
              onOfferToCleaners={() => openAction("offer-select")}
              onRefreshOffers={detail.refreshOffers} onRefreshIssues={detail.refreshIssues}
              onRefreshChecklistRun={detail.refreshChecklistRun} onCreateChecklistRun={createRun}
              onOpenChecklistRun={() => { setShowRun(true); setAction(null); }}
              onRefreshChecklistCapability={detail.refreshChecklistCapability}
              onIssueChecklistCapability={actions.issueChecklistCapability}
              onPrepareChecklistReminder={actions.prepareChecklistReminder}
              onRevokeChecklistCapability={actions.revokeChecklistCapability}
              onCreatePublicOfferLink={offerFlow.createCleanerOfferLink}
              onAssignCleaner={actions.assignCleaner} onAssignCleanerDirectly={assignDirectly}
              onRemoveAssignment={actions.removeCleanerAssignment} onReplaceAssignment={actions.replaceCleanerAssignment}
              onStartCleaning={actions.startCleaning} onCompleteCleaning={actions.completeCleaning}
              onUpdatePrices={actions.saveJobPrices} onUpdateDetails={actions.saveJobDetails}
              onUpdateSchedule={actions.saveJobSchedule} onResolveIssue={actions.resolveJobIssue} />
          </div>
          {showRun && detail.checklistRun && <ChecklistRunDetail embedded key={job.id}
            job={job} checklistRun={detail.checklistRun} assignments={detail.assignments}
            isRefreshing={detail.isRefreshingChecklistRun} hasRefreshError={detail.hasChecklistRunError}
            onRefresh={() => detail.refreshChecklistRun(job, { manual: true })}
            onApproveAndComplete={historical ? undefined : actions.approveChecklistRun}
            onAbandonAndComplete={historical ? undefined : actions.abandonChecklistRunAndCompleteJob}
            onBack={() => setShowRun(false)} />}
        </>}
      </section>
      <aside ref={nextActionsRef} className="workspace-next-actions" aria-label={translate("workspace.nextAction")}>
        <h2>{translate("workspace.nextAction")}</h2>
        <p role={next.pending ? "status" : undefined}>{translate(next.messageKey)}</p>
        {job && <p className="workspace-cleaner-context">{assignedCleanerSummary(job, cleanerNames, translate, translate("dashboard.notAssigned"))}</p>}
        {next.primaryAction && <button className="button button--primary" type="button" onClick={() => openAction(next.primaryAction.id)}>{translate(next.primaryAction.labelKey)}</button>}
        {next.secondaryActions.map((item) => <button key={item.id} className="button" type="button" onClick={() => openAction(item.id)}>{translate(item.labelKey)}</button>)}
        {job && detail.checklistRun?.status === "DRAFT" && !detail.isLoadingChecklistRun && !detail.hasChecklistRunError && (
          <button className="button" type="button" onClick={() => { setShowRun(true); closePanel(); }}>{translate("checklists.viewDraftProgress")}</button>
        )}
        {job && !historical && <details className="workspace-more"><summary>{translate("workspace.more")}</summary>
          {["assign", "offers", "details", "prices", "schedule", "issues"].map((name) => <button className="button" type="button" key={name} onClick={() => openAction(name)}>{translate(actionLabels[name])}</button>)}
        </details>}
      </aside>
    </div>
    {panelOpen && <button className="workspace-backdrop" aria-label={translate("workspace.closePanel")} onClick={closePanel} tabIndex={-1} />}
    <section className="workspace-action-panel" hidden={!panelOpen} ref={panelRef}
      role={panelOpen ? "dialog" : undefined} aria-modal={panelOpen ? "true" : undefined} aria-labelledby="workspace-panel-title">
      <header><div><h2 id="workspace-panel-title">{translate(actionLabels[action] || "workspace.nextAction")}</h2>
        {action !== "create" && job && <p>{job.propertyName} · {job.scheduledDate} · {job.scheduledStart}</p>}</div>
        <button className="button" type="button" onClick={closePanel}>{translate("workspace.closePanel")}</button></header>
      <div ref={setPanelHost} />
      {action === "create" && <CreateCleaningForm {...propertyDirectory}
        properties={propertyDirectory.properties} isLoadingProperties={propertyDirectory.isLoading}
        hasPropertyError={propertyDirectory.hasError} onBack={closePanel}
        onCreated={(created) => { worklist.upsertJob(created);
          if (actionGeneration.current === actionAtRender && selectionRequest.current === requestAtRender) selectJob(created);
        }} />}
      {action === "offer-select" && job && <OfferCleaners key={job.id} job={job}
        cleaners={offerFlow.availableCleaners} isLoading={offerFlow.isLoadingCleaners} hasError={offerFlow.hasCleanerError}
        onBack={() => openAction("offers")} onSent={(count, updated) => {
          if (selectedId.current !== selectionEpochId || selectionRequest.current !== requestAtRender
            || actionGeneration.current !== actionAtRender) { worklist.replaceJob(updated); return; }
          offerFlow.recordOffersCreated(count, updated); openAction("offers");
        }} />}
    </section>
    <ScrollToTopButton />
  </main>;
}

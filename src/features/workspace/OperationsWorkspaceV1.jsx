import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TranslationProvider, languageOptions, useTranslation } from "../../i18n/translations.js";
import { assignedCleanerSummary } from "../jobs/assignmentPresentation.js";
import { jobScheduleAvailability } from "../jobs/jobScheduleAvailability.js";
import { workspaceCopy } from "./workspaceCopy.js";
import "./workspaceV1.css";

// Entirely synthetic. No services, controllers, credentials or Firebase imports.
export const workspaceScenarios = [
  { id: "unassigned", name: "Garden Studio", operationalStatus: "UNASSIGNED", assignedCleanerIds: [], run: null },
  { id: "assigned", name: "Bay Apartment", operationalStatus: "ASSIGNED", assignedCleanerIds: ["demo-cleaner"], run: null },
  { id: "draft", name: "Hill House", operationalStatus: "ASSIGNED", assignedCleanerIds: ["demo-cleaner"], run: { status: "DRAFT" } },
  { id: "ready", name: "Palm Cottage", operationalStatus: "ASSIGNED", assignedCleanerIds: ["demo-cleaner"], run: { status: "READY_FOR_REVIEW" } },
  { id: "completed", name: "Lake Suite", operationalStatus: "COMPLETED", assignedCleanerIds: ["demo-cleaner"], run: { status: "READY_FOR_REVIEW" } },
].map((job) => ({ schemaVersion: 2, scheduledDate: "2026-10-05", scheduledStartTime: "11:00", ...job }));

// Next action is a UX suggestion, never mutation authorization. Current Job Detail
// and backend still own all actions/guards; this experiment cannot execute them.
export function workspaceSuggestion(job) {
  if (job.operationalStatus === "COMPLETED") return { intent: "history", copy: "history" };
  if (job.run?.status === "READY_FOR_REVIEW") return { intent: "checklist", copy: "review" };
  if (job.run?.status === "DRAFT") return { intent: "checklist", copy: "continue" };
  if (job.operationalStatus === "UNASSIGNED") return { intent: "assign", copy: "assignNext" };
  return { intent: "reminder", copy: "reminderNext" };
}

export function OperationsWorkspaceV1() {
  const { language, setLanguage, translate } = useTranslation();
  const copy = workspaceCopy[language] || workspaceCopy.en;
  const [selected, setSelected] = useState("unassigned");
  const [intent, setIntent] = useState(null);
  const panelRef = useRef(null);
  useEffect(() => {
    if (!intent || !window.matchMedia?.("(max-width: 760px)").matches) return;
    panelRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [intent]);
  const job = workspaceScenarios.find((item) => item.id === selected);
  const suggestion = workspaceSuggestion(job);
  const cleanerName = assignedCleanerSummary(job, { "demo-cleaner": "Alex Demo" }, translate, copy.none);
  const stateLabel = job.operationalStatus === "COMPLETED" ? copy.completed
    : job.run?.status === "READY_FOR_REVIEW" ? copy.ready
      : job.run?.status === "DRAFT" ? copy.draft
        : job.assignedCleanerIds.length ? copy.scheduled : copy.awaiting;
  const scheduleBlock = jobScheduleAvailability(job, { run: job.run });
  const showIntent = (next) => setIntent(next);
  let explanation = "";
  let safeIntent = null;
  if (intent === "date") {
    explanation = scheduleBlock ? translate(scheduleBlock) : copy.datePath;
    if (job.run && scheduleBlock) safeIntent = "checklist";
  } else if (intent === "assign") {
    explanation = job.operationalStatus === "COMPLETED" ? copy.unavailable : copy.assignPath;
    if (job.operationalStatus === "COMPLETED") safeIntent = "history";
  } else if (intent === "reminder") {
    explanation = job.operationalStatus === "COMPLETED" ? copy.unavailable
      : job.assignedCleanerIds.length ? copy.reminderPath : copy.reminderBlocked;
    if (!job.assignedCleanerIds.length) safeIntent = "assign";
    if (job.operationalStatus === "COMPLETED") safeIntent = "history";
  } else if (intent === "checklist") {
    explanation = job.run ? copy.checklistPath : copy.checklistNew;
  } else if (intent === "complete") {
    explanation = job.operationalStatus === "COMPLETED" ? copy.historyPath
      : job.run?.status === "DRAFT" ? copy.completeBlocked
        : job.run?.status === "READY_FOR_REVIEW" ? copy.completeReady
          : job.operationalStatus === "UNASSIGNED" ? copy.notEligible : copy.completeNoRun;
    safeIntent = job.run ? "checklist" : job.operationalStatus === "UNASSIGNED" ? "assign" : null;
  } else if (intent === "history") explanation = copy.historyPath;

  return <div className="wv1">
    <header className="wv1-header"><strong>CleanFlow <span>Workspace V1</span></strong><label>{translate("common.language")}<select aria-label={translate("common.language")} value={language} onChange={(event) => setLanguage(event.target.value)}>{languageOptions.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}</select></label></header>
    <p className="wv1-preview">{copy.preview}</p>
    <main className="wv1-layout">
      <aside aria-label={copy.sample}><h2>{copy.title}</h2><p className="wv1-muted">{copy.sample}</p><nav>{workspaceScenarios.map((item, index) => <button key={item.id} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setIntent(null); }}><span className="wv1-number">0{index + 1}</span><span>{item.name}<small>{item.scheduledStartTime} · {item.operationalStatus === "COMPLETED" ? copy.completed : item.run ? item.run.status === "READY_FOR_REVIEW" ? copy.ready : copy.draft : item.assignedCleanerIds.length ? copy.scheduled : copy.awaiting}</small></span></button>)}</nav></aside>
      <section className="wv1-job" aria-label={translate("common.property")}>
        <div className="wv1-status">{stateLabel}</div><h1>{job.name}</h1>
        <dl className="wv1-facts"><div><dt>{translate("common.date")}</dt><dd>{new Intl.DateTimeFormat(language, { month: "short", day: "numeric" }).format(new Date(`${job.scheduledDate}T12:00:00`))} · {job.scheduledStartTime}</dd></div><div><dt>{translate("common.cleaner")}</dt><dd>{cleanerName}</dd></div><div><dt>{copy.checklist}</dt><dd>{job.run ? stateLabel : copy.noRun}</dd></div></dl>
        <div className="wv1-next"><span>{copy.next}</span><strong>{copy[suggestion.copy]}</strong><button className="wv1-primary" onClick={() => showIntent(suggestion.intent)}>{copy[suggestion.copy]} <span aria-hidden="true">→</span></button></div>
        <h2>{copy.question}</h2><div className="wv1-intents">{["date", "assign", "reminder", "checklist", "complete"].map((action) => <button key={action} aria-expanded={intent === action} aria-controls="wv1-intent-panel" onClick={() => showIntent(action)}>{copy[action]}<span aria-hidden="true">↗</span></button>)}</div>
        {!intent && <p className="wv1-muted wv1-hint">{copy.hint}</p>}
        {intent && <section ref={panelRef} tabIndex={-1} id="wv1-intent-panel" className="wv1-panel" aria-live="polite" aria-label={copy[intent]}><div className="wv1-panel-heading"><h2>{copy[intent]}</h2><button onClick={() => setIntent(null)} aria-label={copy.close}>×</button></div><p>{explanation}</p>
          {intent === "date" && !scheduleBlock && <p className="wv1-consequence">{copy.warning}</p>}
          {intent === "checklist" && job.run && <div className="wv1-checklist"><strong>{copy.total}</strong><p>{copy.progress}: {job.run.status === "READY_FOR_REVIEW" ? copy.readyProgress : copy.missing}</p><p>{copy.noNotes}</p></div>}
          {safeIntent && <button className="wv1-safe" onClick={() => showIntent(safeIntent)}>{safeIntent === "checklist" ? copy.safe : safeIntent === "assign" ? copy.assignNext : copy.history} →</button>}
          <small className="wv1-muted">{copy.simulated}</small>
        </section>}
        <details className="wv1-technical"><summary>{copy.technical}</summary><p>Job: {job.operationalStatus} · Run: {job.run?.status || "—"} · schema v{job.schemaVersion}</p><p>Fixture: {job.id} · local only</p></details>
      </section>
    </main>
    <div className="wv1-mobile-primary"><button className="wv1-primary" onClick={() => showIntent(suggestion.intent)}>{copy[suggestion.copy]} →</button></div>
  </div>;
}

export function mountPreview() {
  createRoot(document.getElementById("root")).render(<TranslationProvider><OperationsWorkspaceV1 /></TranslationProvider>);
}

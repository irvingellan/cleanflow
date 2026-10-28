import { useEffect, useRef, useState } from "react";
import { attentionQueue, offerSummary } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { rangeFor } from "../model/time.js";
import { Icon } from "../ui/Icon.jsx";
import { useT } from "../ui/kit.jsx";

// Information-architecture experiment: the same six tasks on three navigation
// strategies, over the same synthetic data. Counts screen/selection changes
// ("navigation") and opened/closed disclosures ("reveal") until "Found it".
// It measures; it does not pick a winner.

export const STRATEGIES = [
  { id: "s1", mode: "hybrid", start: { hybridScreen: "now" } },   // attention first (C), then workspace (A)
  { id: "s2", mode: "a", start: {} },                             // A first
  { id: "s3", mode: "compact", start: {} },                       // compact list + fact sheet
];

export const TASKS = [
  { id: "next", test: (data, job, ui) => attentionQueue(data, rangeFor("today", data.clock.date, data.clock.date))[0]?.job.id === job.id },
  { id: "noCleaner", test: (data, job) => job.status === "UNASSIGNED" },
  { id: "offerWaiting", test: (data, job) => job.status === "OFFERED" && offerSummary(job).waiting.length > 0 },
  { id: "checklist", test: (data, job) => job.checklist?.state === "submitted" },
  { id: "issue", test: (data, job) => job.issues.some(i => i.status === "open") },
  { id: "completed", test: (data, job) => job.status === "COMPLETED" },
];

const NAV_KEYS = ui => [ui.mode, ui.hybridScreen, ui.mobileTab, ui.selectedJobId, ui.overlay?.type, ui.overlay?.jobId, ui.filter, `${ui.range?.kind}:${ui.range?.start}`, ui.cleanerView?.kind];

export function countNavigation(prev, next) {
  return NAV_KEYS(prev).reduce((n, v, i) => n + (v !== NAV_KEYS(next)[i] ? 1 : 0), 0);
}

export function TaskTrial({ onClose }) {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const trial = ui.trial || {};
  const results = ui.trialResults || [];
  const [strategy, setStrategy] = useState(trial.strategy || "s1");
  const [task, setTask] = useState(trial.task || "next");
  const prev = useRef(ui);
  const counts = useRef({ nav: trial.nav || 0, reveal: trial.reveal || 0 });
  const [, force] = useState(0);
  useEffect(() => {
    if (trial.running) {
      const n = countNavigation(prev.current, ui);
      if (n) { counts.current.nav += n; force(x => x + 1); }
    }
    prev.current = ui;
  });
  useEffect(() => {
    if (!trial.running) return undefined;
    const onToggle = e => { if (e.target?.tagName === "DETAILS") { counts.current.reveal += 1; force(x => x + 1); } };
    document.addEventListener("toggle", onToggle, true);
    return () => document.removeEventListener("toggle", onToggle, true);
  }, [trial.running]);
  const start = () => {
    const s = STRATEGIES.find(x => x.id === strategy);
    counts.current = { nav: 0, reveal: 0 };
    const today = data.clock.date;
    const next = { mode: s.mode, ...s.start, selectedJobId: null, overlay: null, cleanerView: null, filter: "needsYou", search: "", range: rangeFor("today", today, today), mobileTab: "home" };
    prev.current = { ...ui, ...next };
    setUi({ ...next, trial: { strategy, task, running: true, startedAt: Date.now() } });
  };
  const finish = () => {
    const jobId = ui.overlay?.jobId || ui.selectedJobId;
    const job = data.jobs.find(j => j.id === jobId);
    const ok = Boolean(job && TASKS.find(x => x.id === task).test(data, job, ui));
    const row = { strategy, task, nav: counts.current.nav, reveal: counts.current.reveal, seconds: Math.round((Date.now() - (trial.startedAt || Date.now())) / 1000), found: ok };
    setUi({ trial: { strategy, task, running: false }, trialResults: [...results.filter(r => !(r.strategy === strategy && r.task === task)), row] });
  };
  const cell = (s, k) => results.find(r => r.strategy === s && r.task === k);
  const copy = () => {
    const lines = [`| ${t("tt.task")} | ${STRATEGIES.map(s => t(`tt.s.${s.id}`)).join(" | ")} |`, `|---|${STRATEGIES.map(() => "---").join("|")}|`,
      ...TASKS.map(k => `| ${t(`tt.k.${k.id}`)} | ${STRATEGIES.map(s => { const r = cell(s.id, k.id); return r ? `${r.nav} nav · ${r.reveal} abrir/fechar · ${r.found ? "ok" : "errado"}` : "—"; }).join(" | ")} |`)];
    try { navigator.clipboard?.writeText(lines.join("\n")).catch(() => {}); } catch { /* ignore */ }
    setUi({ toast: { id: Date.now(), text: t("md.copied"), icon: "clipboard" } });
  };
  return (
    <aside className={`tt${trial.running ? " is-running" : ""}`} aria-label={t("tt.title")}>
      <header className="tt-head"><strong>{t("tt.title")}</strong><button type="button" className="mw-iconbtn" aria-label={t("c.close")} onClick={onClose}><Icon name="x" size={16} /></button></header>
      {trial.running ? (
        <div className="tt-running" role="status">
          <p><strong>{t(`tt.k.${trial.task}`)}</strong> · {t(`tt.s.${trial.strategy}`)}</p>
          <p className="tnum tt-counts">{t("tt.counts", { nav: counts.current.nav, reveal: counts.current.reveal })}</p>
          <p className="mw-hint tt-hint">{t("tt.howFinish")}</p>
          <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small" onClick={finish}><Icon name="check" size={15} />{t("tt.found")}</button>
        </div>
      ) : (
        <div className="tt-setup">
          <label className="mw-field"><span>{t("tt.strategy")}</span><select value={strategy} onChange={e => setStrategy(e.target.value)}>{STRATEGIES.map(s => <option key={s.id} value={s.id}>{t(`tt.s.${s.id}`)}</option>)}</select></label>
          <label className="mw-field"><span>{t("tt.task")}</span><select value={task} onChange={e => setTask(e.target.value)}>{TASKS.map(k => <option key={k.id} value={k.id}>{t(`tt.k.${k.id}`)}</option>)}</select></label>
          <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small" onClick={start}>{t("tt.start")}</button>
        </div>
      )}
      {!trial.running && <details className="tt-results" open={results.length > 0}>
        <summary>{t("tt.results", { count: results.length })}</summary>
        <table>
          <thead><tr><th scope="col">{t("tt.task")}</th>{STRATEGIES.map(s => <th key={s.id} scope="col">{t(`tt.s.${s.id}.short`)}</th>)}</tr></thead>
          <tbody>{TASKS.map(k => <tr key={k.id}><th scope="row">{t(`tt.k.${k.id}`)}</th>{STRATEGIES.map(s => { const r = cell(s.id, k.id); return <td key={s.id} className={r && !r.found ? "is-wrong" : ""}>{r ? `${r.nav} · ${r.reveal}${r.found ? "" : " ✗"}` : "—"}</td>; })}</tr>)}</tbody>
        </table>
        <p className="mw-hint">{t("tt.legend")}</p>
        <div className="mw-chiprow">
          <button type="button" className="mw-linkbtn" onClick={copy}>{t("tt.copy")}</button>
          {results.length > 0 && <button type="button" className="mw-linkbtn" onClick={() => setUi({ trialResults: [] })}>{t("tt.clear")}</button>}
        </div>
      </details>}
    </aside>
  );
}

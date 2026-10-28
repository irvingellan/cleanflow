import { useEffect, useRef } from "react";
import { useStore } from "../model/store.js";
import { rangeFor } from "../model/time.js";
import { Icon } from "../ui/Icon.jsx";
import { SimTag, useT } from "../ui/kit.jsx";

// End-to-end manager journey on the shared synthetic state. Each step is
// detected from what the person actually did; "Show me" only navigates.
const TARGET = "j14"; // Juniper Loft, today, no cleaner
const DRAFT = "j07"; // checklist draft
const SUBMITTED = "j05"; // checklist submitted, waiting for review

export const ROUTE = [
  { id: "find", done: (d, ui, seen) => seen.selected.size > 0, go: d => ({ mode: "hybrid", hybridScreen: "now", selectedJobId: null, overlay: null, range: rangeFor("today", d.clock.date, d.clock.date) }) },
  { id: "missing", done: (d, ui, seen) => seen.selected.has(TARGET), go: () => ({ mode: "hybrid", hybridScreen: "work", filter: "noCleaner" }) },
  { id: "open", done: (d, ui, seen) => seen.selected.has(TARGET), go: () => ({ mode: "hybrid", hybridScreen: "work", filter: "all", selectedJobId: TARGET }) },
  { id: "choose", done: (d, ui, seen) => seen.overlays.has("assign") || seen.overlays.has("offer"), go: () => ({ selectedJobId: TARGET, overlay: { type: "offer", jobId: TARGET } }) },
  { id: "pay", done: (d, ui, seen) => seen.overlays.has("offer"), go: () => ({ selectedJobId: TARGET, overlay: { type: "offer", jobId: TARGET } }) },
  { id: "send", done: d => ["OFFERED", "ASSIGNED"].includes(d.jobs.find(j => j.id === TARGET)?.status) },
  { id: "cleaner", done: (d, ui, seen) => seen.cleaner, go: d => { const j = d.jobs.find(x => x.id === TARGET); const c = j.offers.find(o => !o.response)?.cleanerId || j.offers[0]?.cleanerId; return c ? { overlay: null, cleanerView: { kind: "offer", jobId: TARGET, cleanerId: c } } : {}; } },
  { id: "back", done: (d, ui, seen) => seen.cleaner && !ui.cleanerView },
  { id: "response", done: d => (d.jobs.find(j => j.id === TARGET)?.offers || []).some(o => o.response) || d.jobs.find(j => j.id === TARGET)?.status === "ASSIGNED", go: () => ({ cleanerView: null, selectedJobId: TARGET, hybridScreen: "work", filter: "all" }) },
  { id: "checklist", done: (d, ui, seen) => seen.selected.has(SUBMITTED) || seen.selected.has(DRAFT), go: () => ({ mode: "hybrid", hybridScreen: "work", filter: "all", selectedJobId: DRAFT }) },
  { id: "draftVsSubmitted", done: (d, ui, seen) => seen.selected.has(SUBMITTED) && seen.selected.has(DRAFT), go: (d, ui) => ({ mode: "hybrid", hybridScreen: "work", filter: "all", selectedJobId: ui.selectedJobId === DRAFT ? SUBMITTED : DRAFT }) },
  { id: "evidence", done: (d, ui, seen) => seen.overlays.has("review"), go: () => ({ selectedJobId: SUBMITTED, overlay: { type: "review", jobId: SUBMITTED } }) },
  { id: "completed", done: (d, ui, seen) => seen.overlays.has("review") || seen.overlays.has("complete") },
  { id: "return", done: (d, ui, seen) => seen.overlays.has("review") && !ui.overlay && ui.selectedJobId === SUBMITTED && ui.hybridScreen === "work", go: () => ({ overlay: null, hybridScreen: "work", selectedJobId: SUBMITTED }) },
];

export function GuidedRoute({ onClose }) {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const seenRef = useRef({ selected: new Set(), overlays: new Set(), cleaner: false });
  const route = ui.route || {};
  // Rebuild the "seen" memory from the persisted list on first render.
  if (!seenRef.current.loaded) {
    seenRef.current = { selected: new Set(route.selected || []), overlays: new Set(route.overlays || []), cleaner: Boolean(route.cleaner), loaded: true };
  }
  useEffect(() => {
    const seen = seenRef.current;
    let changed = false;
    if (ui.selectedJobId && !seen.selected.has(ui.selectedJobId)) { seen.selected.add(ui.selectedJobId); changed = true; }
    if (ui.overlay?.type && !seen.overlays.has(ui.overlay.type)) { seen.overlays.add(ui.overlay.type); changed = true; }
    if (ui.cleanerView?.kind === "offer" && !seen.cleaner) { seen.cleaner = true; changed = true; }
    if (changed) setUi({ route: { selected: [...seen.selected], overlays: [...seen.overlays], cleaner: seen.cleaner } });
  }, [ui.selectedJobId, ui.overlay?.type, ui.cleanerView?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const seen = seenRef.current;
  const states = ROUTE.map(step => Boolean(step.done(data, ui, seen)));
  const current = states.findIndex(x => !x);
  return (
    <aside className="gr" aria-label={t("gr.title")}>
      <header className="tt-head"><strong>{t("gr.title")}</strong><SimTag /><button type="button" className="mw-iconbtn" aria-label={t("c.close")} onClick={onClose}><Icon name="x" size={16} /></button></header>
      <p className="mw-hint">{t("gr.intro")}</p>
      <ol className="gr-steps">
        {ROUTE.map((step, i) => (
          <li key={step.id} className={states[i] ? "is-done" : i === current ? "is-current" : ""} aria-current={i === current ? "step" : undefined}>
            <Icon name={states[i] ? "checkCircle" : i === current ? "arrowR" : "minus"} size={15} />
            <span className="mw-grow"><strong>{t(`gr.s.${step.id}`)}</strong>{i === current && <span className="mw-sec">{t(`gr.h.${step.id}`)}</span>}</span>
            {i === current && step.go && <button type="button" className="mw-linkbtn" onClick={() => setUi(step.go(data, ui))}>{t("gr.show")}</button>}
          </li>
        ))}
      </ol>
      <div className="mw-chiprow">
        <span className="mw-sec tnum">{t("gr.progress", { done: states.filter(Boolean).length, total: ROUTE.length })}</span>
        <button type="button" className="mw-linkbtn" onClick={() => { seenRef.current = { selected: new Set(), overlays: new Set(), cleaner: false, loaded: true }; setUi({ route: {} }); }}>{t("gr.restart")}</button>
      </div>
    </aside>
  );
}

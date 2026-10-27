import { createContext, createElement, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useStore } from "../model/store.js";
import { Icon } from "../ui/Icon.jsx";
import { useT } from "../ui/kit.jsx";
import { SCREENS, changesOf, defaultLayout, exportStudio, initialStudio, studioReducer } from "./studioModel.js";

const KEY = "cleanflow-studio-v1";
const StudioContext = createContext(null);

function load() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY));
    if (saved?.schema === 1) return { ...initialStudio(), ...saved, enabled: false, past: [], future: [] };
  } catch { /* local only */ }
  return initialStudio();
}

export function StudioProvider({ children, initial }) {
  const [studio, dispatch] = useReducer(studioReducer, initial, init => init || load());
  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify({ ...studio, past: [], future: [] })); } catch { /* optional */ }
  }, [studio]);
  const value = useMemo(() => ({
    studio, dispatch,
    editing: studio.enabled && studio.view === "candidate",
    original: studio.view === "original",
  }), [studio]);
  return createElement(StudioContext.Provider, { value }, children);
}

export function useStudio() { return useContext(StudioContext); }

export function useLayout(screen) {
  const { studio, original } = useStudio();
  return original ? defaultLayout(screen) : studio.layouts[screen];
}

/** Label with an optional workshop override. */
export function useLabel() {
  const { studio, original } = useStudio();
  return (key, fallback) => (original ? fallback : studio.labels[key] ?? fallback);
}

export function EditableLabel({ k, children: fallback, as: Tag = "span", className }) {
  const { studio, dispatch, editing, original } = useStudio();
  const t = useT();
  const [draft, setDraft] = useState(null);
  const text = original ? fallback : studio.labels[k] ?? fallback;
  if (!editing) return <Tag className={className}>{text}</Tag>;
  if (draft !== null) {
    const save = () => { dispatch({ type: "RENAME", key: k, text: draft.trim(), original: fallback }); setDraft(null); };
    return (
      <input className="st-rename" value={draft} autoFocus aria-label={t("ws.rename")} maxLength={80}
        onClick={e => e.stopPropagation()} onChange={e => setDraft(e.target.value)} onBlur={save}
        onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") save(); if (e.key === "Escape") setDraft(null); }} />
    );
  }
  return (
    <Tag className={`${className || ""} st-labelable${studio.labels[k] ? " is-renamed" : ""}`}>
      {text}
      <button type="button" className="st-pen" aria-label={`${t("ws.rename")}: ${text}`} onClick={e => { e.stopPropagation(); e.preventDefault(); setDraft(text); }}>
        <Icon name="edit" size={12} />
      </button>
    </Tag>
  );
}

const DRAG = "application/x-cleanflow-block";

function StudioBlock({ screen, id, region, index, children }) {
  const t = useT();
  const { studio, dispatch } = useStudio();
  const [over, setOver] = useState(false);
  const decision = studio.decisions[`${screen}/${id}`]?.status;
  const regions = SCREENS[screen].regions;
  return (
    <div className={`st-block${over ? " is-over" : ""}${decision ? ` is-${decision}` : ""}`} data-studio-block={`${screen}/${id}`}
      onDragOver={e => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const [s, from] = e.dataTransfer.getData(DRAG).split("/"); if (s === screen && from !== id) dispatch({ type: "MOVE", screen, id: from, region, index }); }}>
      <div className="st-toolbar" role="toolbar" aria-label={t(`ws.block.${screen}.${id}`)}>
        <span className="st-handle" draggable onDragStart={e => { e.dataTransfer.setData(DRAG, `${screen}/${id}`); e.dataTransfer.effectAllowed = "move"; }} title={t("ws.drag")}>
          <Icon name="grid" size={13} />{t(`ws.block.${screen}.${id}`)}
        </span>
        <button type="button" aria-label={t("ws.up")} onClick={() => dispatch({ type: "STEP", screen, id, delta: -1 })}><Icon name="up" size={14} /></button>
        <button type="button" aria-label={t("ws.down")} onClick={() => dispatch({ type: "STEP", screen, id, delta: 1 })}><Icon name="down" size={14} /></button>
        <select aria-label={t("ws.region")} value={region} onChange={e => dispatch({ type: "MOVE", screen, id, region: e.target.value })}>
          {regions.map(r => <option key={r} value={r}>{t(`ws.region.${r}`)}</option>)}
        </select>
        <button type="button" aria-label={t("ws.hide")} onClick={() => dispatch({ type: "MOVE", screen, id, region: "hidden" })}><Icon name="eye" size={14} /></button>
      </div>
      {children}
    </div>
  );
}

/** Renders the blocks of one region in workshop order. `items` maps block id → element (null = not applicable now). */
export function StudioArea({ screen, region, items, className, as: Tag = "div", empty = null }) {
  const t = useT();
  const layout = useLayout(screen);
  const { editing, dispatch } = useStudio();
  const blocks = layout.filter(b => b.region === region && items[b.id] != null);
  const [over, setOver] = useState(false);
  if (!blocks.length && !editing) return empty;
  return (
    <Tag className={`${className || ""}${editing ? " st-area" : ""}`} data-studio-area={`${screen}/${region}`}>
      {blocks.map((b, i) => (editing
        ? <StudioBlock key={b.id} screen={screen} id={b.id} region={region} index={i}>{items[b.id]}</StudioBlock>
        : <FragmentKey key={b.id}>{items[b.id]}</FragmentKey>))}
      {editing && (
        <div className={`st-drop${over ? " is-over" : ""}`}
          onDragOver={e => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); const [s, id] = e.dataTransfer.getData(DRAG).split("/"); if (s === screen) dispatch({ type: "MOVE", screen, id, region }); }}>
          {t("ws.dropHere", { region: t(`ws.region.${region}`) })}
        </div>
      )}
    </Tag>
  );
}
function FragmentKey({ children }) { return children; }

/* ---------------- Workshop panel ---------------- */
const STATUS = ["approved", "question", "rejected", "proposed"];
const statusIcon = { approved: "checkCircle", question: "info", rejected: "x", proposed: "edit" };

export function StudioPanel() {
  const t = useT();
  const { studio, dispatch } = useStudio();
  const { setUi } = useStore();
  const [tab, setTab] = useState("changes");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState(false);
  const changes = changesOf(studio);
  const json = JSON.stringify(exportStudio(studio), null, 2);
  const ref = useRef(null);
  useEffect(() => {
    const onKey = e => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      e.preventDefault(); dispatch({ type: e.shiftKey ? "REDO" : "UNDO" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);
  const describe = c => {
    if (c.kind === "renamed") return t("ws.ch.renamed", { text: c.text });
    if (c.kind === "hidden") return t("ws.ch.hidden");
    if (c.kind === "moved") return t("ws.ch.moved", { from: t(`ws.region.${c.from}`), to: t(`ws.region.${c.to}`) });
    return t("ws.ch.reordered");
  };
  const name = c => (c.kind === "renamed" ? c.key : t(`ws.block.${c.screen}.${c.id}`));
  const copy = () => { try { navigator.clipboard?.writeText(json).catch(() => {}); } catch { /* fallback below */ } ref.current?.select(); setUi({ toast: { id: Date.now(), text: t("ws.copied"), icon: "clipboard" } }); };
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `cleanflow-oficina-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { copy(); }
  };
  return (
    <aside className="st-panel" aria-label={t("ws.title")}>
      <header className="st-panel-head">
        <div><span className="mw-micro">{t("ws.eyebrow")}</span><h2>{t("ws.title")}</h2></div>
        <button type="button" className="mw-iconbtn" aria-label={t("ws.close")} onClick={() => dispatch({ type: "TOGGLE", enabled: false })}><Icon name="x" /></button>
      </header>
      <div className="st-panel-row">
        <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("ws.compare")}>
          {["candidate", "original"].map(v => <button key={v} type="button" aria-pressed={studio.view === v} onClick={() => dispatch({ type: "VIEW", view: v })}>{t(`ws.view.${v}`)}</button>)}
        </div>
        <button type="button" className="mw-iconbtn" aria-label={t("ws.undo")} title={t("ws.undo")} disabled={!studio.past.length} onClick={() => dispatch({ type: "UNDO" })}><Icon name="undo" /></button>
        <button type="button" className="mw-iconbtn" aria-label={t("ws.redo")} title={t("ws.redo")} disabled={!studio.future.length} onClick={() => dispatch({ type: "REDO" })}><Icon name="redo" /></button>
      </div>
      <p className="mw-hint">{studio.view === "original" ? t("ws.originalNote") : t("ws.howto")}</p>
      <div className="st-tabs" role="tablist">
        {["changes", "blocks", "share"].map(id => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t(`ws.tab.${id}`)}{id === "changes" ? ` · ${changes.length}` : ""}</button>)}
      </div>
      {tab === "changes" && (
        <div className="st-list">
          {!changes.length && <p className="mw-sec">{t("ws.noChanges")}</p>}
          {changes.map(c => (
            <div key={c.target} className={`st-change is-${c.decision.status}`}>
              <div className="st-change-head"><Icon name={statusIcon[c.decision.status]} size={15} /><strong>{name(c)}</strong><span className="mw-sec">{describe(c)}</span></div>
              <div className="st-decide" role="group" aria-label={t("ws.decision")}>
                {STATUS.map(s => <button key={s} type="button" aria-pressed={c.decision.status === s} onClick={() => dispatch({ type: "DECIDE", target: c.target, status: s })}>{t(`ws.status.${s}`)}</button>)}
              </div>
              <input className="st-note" placeholder={t("ws.notePlaceholder")} defaultValue={c.decision.note} aria-label={t("ws.note")}
                onBlur={e => { if (e.target.value !== c.decision.note) dispatch({ type: "DECIDE", target: c.target, status: c.decision.status, note: e.target.value }); }} />
            </div>
          ))}
        </div>
      )}
      {tab === "blocks" && (
        <div className="st-list">
          {Object.keys(SCREENS).map(screen => (
            <section key={screen} className="st-screen">
              <header><strong>{t(SCREENS[screen].titleKey)}</strong>
                <button type="button" className="mw-linkbtn" onClick={() => dispatch({ type: "RESET_SCREEN", screen })}>{t("ws.resetScreen")}</button></header>
              {studio.layouts[screen].map(b => (
                <div key={b.id} className={`st-row${b.region === "hidden" ? " is-hidden" : ""}`}>
                  <span>{t(`ws.block.${screen}.${b.id}`)}</span>
                  <select aria-label={`${t("ws.region")}: ${t(`ws.block.${screen}.${b.id}`)}`} value={b.region} onChange={e => dispatch({ type: "MOVE", screen, id: b.id, region: e.target.value })}>
                    {SCREENS[screen].regions.map(r => <option key={r} value={r}>{t(`ws.region.${r}`)}</option>)}
                  </select>
                  {b.region === "hidden"
                    ? <button type="button" className="mw-linkbtn" onClick={() => dispatch({ type: "RESTORE", screen, id: b.id })}>{t("ws.restore")}</button>
                    : <span />}
                </div>
              ))}
            </section>
          ))}
          <button type="button" className="cfv2-button cfv2-button-danger mw-btn cfv2-button-small" onClick={() => dispatch({ type: "RESET_ALL" })}>{t("ws.resetAll")}</button>
        </div>
      )}
      {tab === "share" && (
        <div className="st-list">
          <p className="mw-hint">{t("ws.shareNote")}</p>
          <div className="mw-chiprow">
            <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small" onClick={copy}><Icon name="clipboard" size={15} />{t("ws.copyJson")}</button>
            <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={download}><Icon name="down" size={15} />{t("ws.download")}</button>
          </div>
          <textarea ref={ref} className="st-json" readOnly value={json} aria-label={t("ws.copyJson")} rows={8} />
          <label className="mw-field"><span>{t("ws.import")}</span>
            <textarea rows={4} value={importText} onChange={e => { setImportText(e.target.value); setImportError(false); }} />
          </label>
          {importError && <p className="mw-flag tone-risk">{t("ws.importError")}</p>}
          <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" disabled={!importText.trim()} onClick={() => {
            try { const payload = JSON.parse(importText); if (payload?.schema !== 1) throw new Error(); dispatch({ type: "IMPORT", payload }); setImportText(""); } catch { setImportError(true); }
          }}>{t("ws.importAction")}</button>
        </div>
      )}
    </aside>
  );
}

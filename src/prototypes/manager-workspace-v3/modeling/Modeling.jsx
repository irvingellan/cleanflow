import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useStore } from "../model/store.js";
import { Icon } from "../ui/Icon.jsx";
import { useT, useViewport } from "../ui/kit.jsx";
import INDEX from "./snapshots/index.json";
import { allChanges, applyOps, changesOf, decisionsMarkdown, exportModeling, initialModeling, modelingReducer, ownText, validateModeling } from "./modelingModel.js";

// Screens are real rendered DOM captured from: the original A/B/C artboards,
// the production V2 components in the synthetic test harness, and this prototype.
const SNAPSHOTS = import.meta.glob("./snapshots/*-*.json", { import: "default" });
const CSS = import.meta.glob("./snapshots/css-*.css", { query: "?raw", import: "default" });
const KEY = "cleanflow-modeling-v2";
const SCREEN_IDS = INDEX.map(s => s.id);
const SOURCES = ["v2", "original", "prototype"];
const NO_OPS = [];

const EDITOR_CSS = `
[data-cf-hidden]{display:none!important}
html[data-cf-show-hidden] [data-cf-hidden]{display:revert!important;opacity:.3!important;outline:2px dashed #b45309!important;outline-offset:2px}
[data-cf-emph=prominent]{zoom:1.12;font-weight:700!important}
[data-cf-emph=secondary]{opacity:.55!important;zoom:.92}
html[data-cf-edit] [data-cf-hover]{outline:2px dashed #2563eb!important;outline-offset:2px;cursor:pointer}
html[data-cf-move] [data-cf-hover]{outline:3px solid #15803d!important;outline-offset:2px;cursor:copy}
[data-cf-sel]{outline:3px solid #2563eb!important;outline-offset:2px;box-shadow:0 0 0 6px rgba(37,99,235,.2)!important}
html[data-cf-edit] *{cursor:pointer}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
`;

function load() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY));
    const parsed = validateModeling(saved, SCREEN_IDS);
    if (parsed) return { ...initialModeling(), ...parsed };
  } catch { /* local only */ }
  return initialModeling();
}

const tagKind = el => {
  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return "title";
  return { button: "button", a: "link", input: "field", select: "field", textarea: "field", li: "item", ul: "list", ol: "list", nav: "nav", header: "header", section: "section", article: "section", aside: "aside", main: "main", p: "text", svg: "icon", img: "image", span: "short", strong: "short", label: "field", summary: "button", details: "section", dl: "list", dt: "short", dd: "short", table: "list", tr: "item" }[tag] || "block";
};
export function describeElement(t, el) {
  if (!el) return "";
  const text = (ownText(el) || el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
  return `${t(`md.kind.${tagKind(el)}`)}${text ? ` · “${text.slice(0, 42)}${text.length > 42 ? "…" : ""}”` : ""}`;
}

/** Click target → the element a person means (an icon inside a button selects the button). */
function pickTarget(node) {
  let el = node?.nodeType === 1 ? node : node?.parentElement;
  if (!el) return null;
  const svg = el.closest("svg");
  if (svg) el = svg;
  const control = el.closest("button,a,summary,label");
  if (control && control !== el && control.contains(el) && !el.matches("p,section,article,ul,ol,li,div")) el = control;
  while (el && !el.hasAttribute("data-mid")) el = el.parentElement;
  return el;
}

function SnapshotFrame({ snap, css, ops, editable, selected, onSelect, moveMode, onPlace, showHidden, theme, label, onDoc }) {
  const ref = useRef(null);
  const box = useRef(null);
  const [height, setHeight] = useState(snap.height);
  const [scale, setScale] = useState(1);
  const handlers = useRef({});
  handlers.current = { editable, onSelect, moveMode, onPlace };
  const srcDoc = useMemo(() => `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8">${(snap.fonts || []).map(f => `<link rel="stylesheet" href="${f.replace(/"/g, "")}">`).join("")}<style>${css}</style><style>${EDITOR_CSS}</style></head><body style="margin:0"></body></html>`, [snap.id, css]); // eslint-disable-line react-hooks/exhaustive-deps
  const render = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.innerHTML = snap.html; // captured, sanitised markup (no scripts, no handlers)
    applyOps(doc, ops);
    doc.documentElement.dataset.theme = theme;
    doc.documentElement.toggleAttribute("data-cf-edit", Boolean(editable));
    doc.documentElement.toggleAttribute("data-cf-move", Boolean(editable && moveMode));
    doc.documentElement.toggleAttribute("data-cf-show-hidden", Boolean(editable && showHidden));
    if (selected) doc.querySelector(`[data-mid="${selected}"]`)?.setAttribute("data-cf-sel", "");
    const h = Math.max(snap.device === "mobile" ? 844 : 600, Math.min(doc.documentElement.scrollHeight, 6000));
    setHeight(h);
    onDoc?.(doc);
  }, [snap, ops, theme, editable, moveMode, showHidden, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const onLoad = () => {
    const doc = ref.current.contentDocument;
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    doc.addEventListener("click", e => {
      stop(e);
      const h = handlers.current;
      if (!h.editable) return;
      const target = pickTarget(e.target);
      if (!target) return;
      if (h.moveMode) { const r = target.getBoundingClientRect(); h.onPlace(target.getAttribute("data-mid"), e.clientY > r.top + r.height / 2); }
      else h.onSelect(target.getAttribute("data-mid"));
    }, true);
    for (const type of ["submit", "auxclick", "dblclick", "toggle"]) doc.addEventListener(type, stop, true);
    doc.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") stop(e); }, true);
    doc.addEventListener("mouseover", e => {
      if (!handlers.current.editable) return;
      doc.querySelectorAll("[data-cf-hover]").forEach(n => n.removeAttribute("data-cf-hover"));
      pickTarget(e.target)?.setAttribute("data-cf-hover", "");
    });
    doc.addEventListener("mouseleave", () => doc.querySelectorAll("[data-cf-hover]").forEach(n => n.removeAttribute("data-cf-hover")));
    render();
  };
  useEffect(() => { render(); }, [render]);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const fit = () => setScale(Math.min(1, node.clientWidth / snap.width));
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(node);
    return () => ro?.disconnect();
  }, [snap.width]);
  return (
    <div ref={box} className="md-frame-box" style={{ height: height * scale }}>
      <iframe ref={ref} title={label} className="md-frame" sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={onLoad}
        style={{ width: snap.width, height, transform: `scale(${scale})` }} />
    </div>
  );
}

function useSnapshot(id) {
  const [state, setState] = useState({ id: null, snap: null, css: "" });
  useEffect(() => {
    let alive = true;
    const meta = INDEX.find(s => s.id === id);
    const loader = SNAPSHOTS[`./snapshots/${id}.json`];
    if (!meta || !loader) return undefined;
    loader().then(async snap => {
      const css = await CSS[`./snapshots/css-${snap.cssRef}.css`]();
      if (alive) setState({ id, snap, css });
    });
    return () => { alive = false; };
  }, [id]);
  return state.id === id ? state : { snap: null, css: "" };
}

const STATUS = ["approved", "question", "rejected", "proposed"];

export function ModelingWorkbench({ onClose }) {
  const t = useT();
  const vp = useViewport();
  const { ui, setUi } = useStore();
  const [model, dispatch] = useReducer(modelingReducer, undefined, load);
  const [device, setDevice] = useState(vp.compact ? "mobile" : "desktop");
  const firstOf = d => (INDEX.find(s => s.source === "v2" && s.device === d && s.id.startsWith("v2-services")) || INDEX.find(s => s.device === d) || INDEX[0]).id;
  const [screenId, setScreenId] = useState(ui.modelingScreen && SCREEN_IDS.includes(ui.modelingScreen) ? ui.modelingScreen : firstOf(vp.compact ? "mobile" : "desktop"));
  const [view, setView] = useState("proposal");
  const [selected, setSelected] = useState(null);
  const [moveMode, setMoveMode] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [tab, setTab] = useState("element");
  const [draft, setDraft] = useState(null);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState(false);
  const [announce, setAnnounce] = useState("");
  const theme = ui.theme || (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const meta = INDEX.find(s => s.id === screenId);
  const { snap, css } = useSnapshot(screenId);
  const docRef = useRef(null);
  const [docTick, setDocTick] = useState(0);
  const ops = model.screens[screenId]?.ops || NO_OPS;
  const frameTheme = meta?.source === "original" ? "light" : theme;
  useEffect(() => { try { window.localStorage.setItem(KEY, JSON.stringify({ schema: model.schema, screens: model.screens, decisions: model.decisions })); } catch { /* optional */ } }, [model]);
  useEffect(() => { setUi({ modelingScreen: screenId }); setSelected(null); setMoveMode(false); setDraft(null); }, [screenId]); // eslint-disable-line react-hooks/exhaustive-deps

  const el = selected && docRef.current ? docRef.current.querySelector(`[data-mid="${selected}"]`) : null;
  const selName = el ? describeElement(t, el) : "";
  const op = o => { dispatch({ type: "OP", screen: screenId, op: o }); };
  const say = msg => setAnnounce(`${msg} · ${Date.now() % 1000}`);
  const siblings = node => [...(node?.parentElement?.children || [])].filter(n => n.hasAttribute("data-mid") && !n.hasAttribute("data-cf-hidden"));
  const step = delta => {
    if (!el?.parentElement?.hasAttribute("data-mid")) return;
    const list = siblings(el);
    const i = list.indexOf(el);
    const target = list[i + delta];
    if (!target) return;
    const before = delta < 0 ? target : target.nextElementSibling;
    op({ t: "move", id: selected, parent: el.parentElement.getAttribute("data-mid"), before: before?.getAttribute("data-mid") || null });
    say(t(delta < 0 ? "md.movedUp" : "md.movedDown"));
  };
  const place = (targetId, after) => {
    const doc = docRef.current;
    const target = doc?.querySelector(`[data-mid="${targetId}"]`);
    if (!el || !target || target === el || el.contains(target) || !target.parentElement?.hasAttribute("data-mid")) { say(t("md.cantPlace")); return; }
    let before = after ? target.nextElementSibling : target;
    if (before === el) before = el.nextElementSibling;
    op({ t: "move", id: selected, parent: target.parentElement.getAttribute("data-mid"), before: before?.getAttribute("data-mid") || null });
    setMoveMode(false);
    say(t("md.placed"));
  };
  const select = id => { setSelected(id); setDraft(null); setTab("element"); const n = docRef.current?.querySelector(`[data-mid="${id}"]`); if (n) say(`${t("md.selected")}: ${describeElement(t, n)}`); };
  const hidden = el?.hasAttribute("data-cf-hidden");
  const emph = el?.getAttribute("data-cf-emph") || null;
  const canRename = Boolean(el && (ownText(el) || (!el.querySelector("[data-mid]:not(svg)") && el.textContent.trim())));
  const changes = changesOf(model, screenId);
  const all = allChanges(model);
  const titles = Object.fromEntries(INDEX.map(s => [s.id, s.title]));
  const labelOf = (screen, id) => (screen === screenId && docRef.current?.querySelector(`[data-mid="${id}"]`) ? describeElement(t, docRef.current.querySelector(`[data-mid="${id}"]`)) : id);
  const hiddenList = docRef.current ? [...docRef.current.querySelectorAll("[data-cf-hidden]")] : [];
  const outline = useMemo(() => {
    const doc = docRef.current;
    if (!doc) return [];
    const rows = [];
    const visit = (node, depth) => {
      if (depth > 4 || rows.length > 160) return;
      for (const c of node.children) {
        if (!c.hasAttribute?.("data-mid") || c.tagName === "svg") continue;
        const text = ownText(c);
        const meaningful = text || c.children.length > 1 || ["BUTTON", "A", "H1", "H2", "H3", "NAV", "MAIN", "ASIDE", "SECTION", "HEADER", "LI"].includes(c.tagName);
        if (meaningful) rows.push({ id: c.getAttribute("data-mid"), depth, label: describeElement(t, c) });
        visit(c, meaningful ? depth + 1 : depth);
      }
    };
    visit(doc.body, 0);
    return rows;
  }, [docTick, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = e => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (e.key === "Escape") { if (moveMode) setMoveMode(false); else if (selected) setSelected(null); else onClose(); e.preventDefault(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); dispatch({ type: e.shiftKey ? "REDO" : "UNDO" }); }
      if (e.altKey && selected && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); step(e.key === "ArrowUp" ? -1 : 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const json = () => JSON.stringify(exportModeling(model, titles), null, 2);
  const md = () => decisionsMarkdown(model, { titles, labelOf });
  const toast = text => setUi({ toast: { id: Date.now(), text, icon: "clipboard" } });
  const copy = text => { try { navigator.clipboard?.writeText(text).catch(() => {}); } catch { /* ignore */ } toast(t("md.copied")); };
  const download = (text, name, type) => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { copy(text); }
  };
  const stamp = new Date().toISOString().slice(0, 10);

  const canvas = snap ? (
    view === "split" ? (
      <div className="md-split">
        <figure><figcaption>{t("md.view.original")}</figcaption><SnapshotFrame key={`o-${screenId}`} snap={snap} css={css} ops={NO_OPS} theme={frameTheme} label={`${meta.title} · ${t("md.view.original")}`} /></figure>
        <figure><figcaption>{t("md.view.proposal")} · {changes.length}</figcaption><SnapshotFrame key={`p-${screenId}`} snap={snap} css={css} ops={ops} theme={frameTheme} label={`${meta.title} · ${t("md.view.proposal")}`} /></figure>
      </div>
    ) : (
      <SnapshotFrame key={`${view}-${screenId}`} snap={snap} css={css} ops={view === "original" ? NO_OPS : ops} editable={view === "proposal"} selected={view === "proposal" ? selected : null}
        onSelect={select} moveMode={moveMode} onPlace={place} showHidden={showHidden} theme={frameTheme}
        label={`${meta.title} · ${t(`md.view.${view}`)}`} onDoc={doc => { docRef.current = doc; setDocTick(x => x + 1); }} />
    )
  ) : <p className="mw-sec md-loading">{t("md.loading")}</p>;

  const elementPanel = (
    <div className="md-element">
      {!el && <p className="mw-sec">{view === "proposal" ? t("md.pickHint") : t("md.switchToEdit")}</p>}
      {el && (
        <>
          <div className="md-selname"><Icon name="edit" size={15} /><strong>{selName}</strong></div>
          {moveMode
            ? <div className="md-movehint" role="status"><Icon name="arrowR" size={15} />{t("md.moveHint")}<button type="button" className="mw-linkbtn" onClick={() => setMoveMode(false)}>{t("c.cancel")}</button></div>
            : (
              <div className="md-actions">
                <button type="button" className="md-act is-primary" onClick={() => { setMoveMode(true); say(t("md.moveHint")); }}><Icon name="arrowR" size={18} />{t("md.move")}</button>
                <button type="button" className="md-act" onClick={() => step(-1)} aria-label={t("md.upLong")}><Icon name="up" size={18} />{t("md.up")}</button>
                <button type="button" className="md-act" onClick={() => step(1)} aria-label={t("md.downLong")}><Icon name="down" size={18} />{t("md.down")}</button>
                {canRename && <button type="button" className="md-act" onClick={() => setDraft(ownText(el) || el.textContent.trim())}><Icon name="edit" size={18} />{t("md.rename")}</button>}
                {hidden
                  ? <button type="button" className="md-act" onClick={() => { op({ t: "show", id: selected }); say(t("md.restored")); }}><Icon name="eye" size={18} />{t("md.restore")}</button>
                  : <button type="button" className="md-act" onClick={() => { op({ t: "hide", id: selected }); setShowHidden(true); say(t("md.hiddenDone")); }}><Icon name="x" size={18} />{t("md.hide")}</button>}
              </div>
            )}
          {draft !== null && (
            <form className="md-rename" onSubmit={e => { e.preventDefault(); if (draft.trim()) { op({ t: "text", id: selected, text: draft.trim() }); say(t("md.renamed")); } setDraft(null); }}>
              <label className="mw-field"><span>{t("md.newText")}</span><input autoFocus value={draft} maxLength={120} onChange={e => setDraft(e.target.value)} /></label>
              <div className="mw-chiprow"><button type="submit" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small">{t("md.save")}</button><button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={() => setDraft(null)}>{t("c.cancel")}</button></div>
            </form>
          )}
          <div className="md-row">
            <span className="mw-micro">{t("md.emphasis")}</span>
            <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("md.emphasis")}>
              {[["prominent", "md.emph.more"], [null, "md.emph.normal"], ["secondary", "md.emph.less"]].map(([lvl, k]) => <button key={k} type="button" aria-pressed={emph === lvl} onClick={() => op({ t: "emph", id: selected, level: lvl })}>{t(k)}</button>)}
            </div>
          </div>
          <div className="md-row md-nav">
            <button type="button" className="mw-linkbtn" disabled={!el.parentElement?.hasAttribute("data-mid")} onClick={() => select(el.parentElement.getAttribute("data-mid"))}><Icon name="up" size={14} />{t("md.selectOuter")}</button>
            <button type="button" className="mw-linkbtn" disabled={!el.querySelector("[data-mid]")} onClick={() => select(el.querySelector("[data-mid]").getAttribute("data-mid"))}><Icon name="down" size={14} />{t("md.selectInner")}</button>
            <button type="button" className="mw-linkbtn" onClick={() => { dispatch({ type: "RESET_ELEMENT", screen: screenId, id: selected }); say(t("md.resetDone")); }}><Icon name="refresh" size={14} />{t("md.resetElement")}</button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="md-root" role="dialog" aria-modal="true" aria-label={t("md.title")}>
      <header className="md-top">
        <div className="md-titlebox"><span className="mw-micro">{t("md.eyebrow")}</span><h2>{t("md.title")}</h2></div>
        <div className="md-topactions">
          <button type="button" className="mw-iconbtn" aria-label={t("ws.undo")} title={t("ws.undo")} disabled={!model.past.length} onClick={() => dispatch({ type: "UNDO" })}><Icon name="undo" /></button>
          <button type="button" className="mw-iconbtn" aria-label={t("ws.redo")} title={t("ws.redo")} disabled={!model.future.length} onClick={() => dispatch({ type: "REDO" })}><Icon name="redo" /></button>
          <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={onClose} data-autofocus><Icon name="x" size={15} />{t("md.close")}</button>
        </div>
      </header>
      <div className="md-bar">
        <label className="md-screenpick"><span className="mw-visually-hidden">{t("md.screen")}</span>
          <select value={screenId} onChange={e => setScreenId(e.target.value)}>
            {SOURCES.map(src => (
              <optgroup key={src} label={t(`md.src.${src}`)}>
                {INDEX.filter(s => s.source === src).map(s => <option key={s.id} value={s.id}>{s.title}{all.some(c => c.screen === s.id) ? " •" : ""}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("md.device")}>
          {["desktop", "mobile"].map(d => <button key={d} type="button" aria-pressed={meta?.device === d} onClick={() => { setDevice(d); if (meta?.device !== d) { const twin = INDEX.find(s => s.device === d && s.id.replace(/-(desktop|mobile)$/, "") === screenId.replace(/-(desktop|mobile)$/, "")); setScreenId(twin ? twin.id : firstOf(d)); } }}>{t(`md.dev.${d}`)}</button>)}
        </div>
        <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("ws.compare")}>
          {["proposal", "original", "split"].map(v => <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); setMoveMode(false); }}>{t(`md.view.${v}`)}</button>)}
        </div>
        {view === "proposal" && <label className="cw-sim md-showhidden"><input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />{t("md.showHidden")}</label>}
      </div>
      {meta && <p className={`md-prov is-${meta.source}`}><Icon name={meta.source === "original" ? "history" : meta.source === "v2" ? "checkCircle" : "flask"} size={15} />{t(`md.prov.${meta.source}`)}{meta.source === "original" && device === "desktop" ? "" : ""}</p>}
      <div className="md-body">
        <main className="md-canvas" aria-label={t("md.canvas")}>{canvas}</main>
        <aside className={`md-panel${el && vp.compact ? " is-sheet" : ""}`} aria-label={t("md.panel")}>
          <div className="st-tabs" role="tablist">
            {["element", "list", "changes", "share"].map(id => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t(`md.tab.${id}`)}{id === "changes" ? ` · ${changes.length}` : ""}</button>)}
          </div>
          {tab === "element" && elementPanel}
          {tab === "list" && (
            <div className="md-outline">
              <p className="mw-hint">{t("md.listHint")}</p>
              <ul>{outline.map(r => <li key={r.id} style={{ paddingLeft: r.depth * 12 }}><button type="button" className={`md-outline-item${r.id === selected ? " is-on" : ""}`} onClick={() => { setView("proposal"); select(r.id); }}>{r.label}</button></li>)}</ul>
              {hiddenList.length > 0 && <><h4 className="mw-micro">{t("md.hiddenTitle")}</h4><ul>{hiddenList.map(n => <li key={n.getAttribute("data-mid")}><button type="button" className="mw-linkbtn" onClick={() => op({ t: "show", id: n.getAttribute("data-mid") })}><Icon name="eye" size={14} />{t("md.restore")}: {describeElement(t, n)}</button></li>)}</ul></>}
            </div>
          )}
          {tab === "changes" && (
            <div className="st-list">
              {!changes.length && <p className="mw-sec">{t("md.noChanges")}</p>}
              {changes.map(c => (
                <div key={c.key} className={`st-change is-${c.decision.status}`}>
                  <button type="button" className="md-changehead" onClick={() => { setView("proposal"); select(c.id); }}><strong>{labelOf(screenId, c.id)}</strong><span className="mw-sec">{t(`md.kindch.${c.kind}`)}{c.kind === "text" ? `: “${c.op.text}”` : ""}{c.kind === "emph" ? `: ${t(c.op.level === "prominent" ? "md.emph.more" : "md.emph.less")}` : ""}</span></button>
                  <div className="st-decide" role="group" aria-label={t("ws.decision")}>
                    {STATUS.map(s => <button key={s} type="button" aria-pressed={c.decision.status === s} onClick={() => dispatch({ type: "DECIDE", key: c.key, status: s })}>{t(`ws.status.${s}`)}</button>)}
                  </div>
                  <input className="st-note" placeholder={t("ws.notePlaceholder")} defaultValue={c.decision.note} aria-label={t("ws.note")}
                    onBlur={e => { if (e.target.value !== c.decision.note) dispatch({ type: "DECIDE", key: c.key, status: c.decision.status, note: e.target.value }); }} />
                </div>
              ))}
              {changes.length > 0 && <button type="button" className="cfv2-button cfv2-button-danger mw-btn cfv2-button-small" onClick={() => dispatch({ type: "RESET_SCREEN", screen: screenId })}>{t("md.resetScreen")}</button>}
              <p className="mw-hint">{t("md.allScreens", { count: all.length })}</p>
            </div>
          )}
          {tab === "share" && (
            <div className="st-list">
              <p className="mw-hint">{t("md.shareNote")}</p>
              <div className="mw-chiprow">
                <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small" onClick={() => download(md(), `cleanflow-decisoes-${stamp}.md`, "text/markdown")}><Icon name="down" size={15} />{t("md.downloadMd")}</button>
                <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => download(json(), `cleanflow-modelagem-${stamp}.json`, "application/json")}><Icon name="down" size={15} />{t("md.downloadJson")}</button>
                <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={() => copy(json())}><Icon name="clipboard" size={15} />{t("ws.copyJson")}</button>
              </div>
              <label className="mw-field"><span>{t("ws.import")}</span><textarea rows={4} value={importText} onChange={e => { setImportText(e.target.value); setImportError(false); }} /></label>
              {importError && <p className="mw-flag tone-risk">{t("md.importError")}</p>}
              <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" disabled={!importText.trim()} onClick={() => {
                try { const payload = JSON.parse(importText); if (!validateModeling(payload, SCREEN_IDS)) throw new Error("schema"); dispatch({ type: "IMPORT", payload, knownScreens: SCREEN_IDS }); setImportText(""); toast(t("md.imported")); } catch { setImportError(true); }
              }}>{t("ws.importAction")}</button>
            </div>
          )}
        </aside>
      </div>
      <div className="mw-visually-hidden" role="status" aria-live="polite">{announce.replace(/ · \d+$/, "")}</div>
    </div>
  );
}

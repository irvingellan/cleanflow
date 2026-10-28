// "Modelagem" (massinha 2): edits on captured, real rendered screens.
// The ORIGINAL is a frozen DOM snapshot (data-mid ids assigned at capture time).
// The PROPOSAL is the original plus an ordered list of operations, replayed on a
// fresh copy every time. Operations never contain HTML; text is set as text.

export const MODELING_SCHEMA = "cleanflow-modeling/2";
export const OP_TYPES = ["move", "hide", "show", "text", "emph"];
export const EMPH = ["prominent", "secondary", null];
export const DECISIONS = ["proposed", "approved", "question", "rejected"];
const ID = /^[a-z0-9]+-[a-z0-9]+$/;
const MAX_TEXT = 120;

export function initialModeling() {
  return { schema: MODELING_SCHEMA, screens: {}, decisions: {}, past: [], future: [] };
}

const snap = s => JSON.parse(JSON.stringify({ screens: s.screens, decisions: s.decisions }));
const commit = (state, next) => ({ ...next, past: [...state.past.slice(-79), snap(state)], future: [] });
const opsOf = (state, screen) => state.screens[screen]?.ops || [];
const withOps = (state, screen, ops) => ({ ...state, screens: { ...state.screens, [screen]: { ops } } });

export function modelingReducer(state, action) {
  switch (action.type) {
    case "OP": {
      const op = cleanOp(action.op);
      if (!op) return state;
      return commit(state, withOps(state, action.screen, [...opsOf(state, action.screen), op]));
    }
    case "RESET_ELEMENT": // drop every operation about this element (moves INTO it stay)
      return commit(state, withOps(state, action.screen, opsOf(state, action.screen).filter(o => o.id !== action.id)));
    case "RESET_SCREEN":
      return commit(state, withOps(state, action.screen, []));
    case "DECIDE":
      if (!DECISIONS.includes(action.status)) return state;
      return commit(state, { ...state, decisions: { ...state.decisions, [action.key]: { status: action.status, note: String(action.note ?? state.decisions[action.key]?.note ?? "").slice(0, 400) } } });
    case "UNDO": {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return { ...state, ...prev, past: state.past.slice(0, -1), future: [snap(state), ...state.future] };
    }
    case "REDO": {
      if (!state.future.length) return state;
      const [next, ...rest] = state.future;
      return { ...state, ...next, past: [...state.past, snap(state)], future: rest };
    }
    case "IMPORT": {
      const parsed = validateModeling(action.payload, action.knownScreens);
      return parsed ? commit(state, { ...state, ...parsed }) : state;
    }
    default: return state;
  }
}

/** Keeps only known fields with safe values. Returns null for anything else. */
export function cleanOp(op) {
  if (!op || !OP_TYPES.includes(op.t) || typeof op.id !== "string" || !ID.test(op.id)) return null;
  switch (op.t) {
    case "move":
      if (typeof op.parent !== "string" || !ID.test(op.parent)) return null;
      if (op.before != null && (typeof op.before !== "string" || !ID.test(op.before))) return null;
      return { t: "move", id: op.id, parent: op.parent, before: op.before ?? null };
    case "text":
      if (typeof op.text !== "string") return null;
      return { t: "text", id: op.id, text: op.text.replace(/[\u0000-\u001f]/g, " ").slice(0, MAX_TEXT) };
    case "emph":
      if (!EMPH.includes(op.level ?? null)) return null;
      return { t: "emph", id: op.id, level: op.level ?? null };
    default:
      return { t: op.t, id: op.id };
  }
}

/** Validates an imported file. Unknown screens, ops and decision keys are dropped. */
export function validateModeling(payload, knownScreens = null) {
  if (!payload || payload.schema !== MODELING_SCHEMA || typeof payload.screens !== "object") return null;
  const screens = {};
  for (const [id, value] of Object.entries(payload.screens || {})) {
    if (knownScreens && !knownScreens.includes(id)) continue;
    const ops = (Array.isArray(value?.ops) ? value.ops : []).slice(0, 2000).map(cleanOp).filter(Boolean);
    screens[id] = { ops };
  }
  const decisions = {};
  for (const [key, d] of Object.entries(payload.decisions || {})) {
    if (typeof key === "string" && key.length < 120 && d && DECISIONS.includes(d.status)) decisions[key] = { status: d.status, note: String(d.note || "").slice(0, 400) };
  }
  return { screens, decisions };
}

/**
 * Replays operations on a document that already holds the ORIGINAL markup.
 * Unknown ids are skipped (never throw), so a stale file cannot break a screen.
 * Returns the list of ops that applied.
 */
export function applyOps(doc, ops) {
  const find = id => doc.querySelector(`[data-mid="${id}"]`);
  const applied = [];
  for (const op of ops) {
    const el = find(op.id);
    if (!el) continue;
    if (op.t === "move") {
      const parent = find(op.parent);
      const before = op.before ? find(op.before) : null;
      if (!parent || parent === el || el.contains(parent) || (before && before.parentNode !== parent)) continue;
      parent.insertBefore(el, before);
    } else if (op.t === "hide") el.setAttribute("data-cf-hidden", "");
    else if (op.t === "show") el.removeAttribute("data-cf-hidden");
    else if (op.t === "emph") { if (op.level) el.setAttribute("data-cf-emph", op.level); else el.removeAttribute("data-cf-emph"); }
    else if (op.t === "text") setOwnText(el, op.text);
    applied.push(op);
  }
  return applied;
}

/** The element's own text (not its children's). */
export function ownText(el) {
  return [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").replace(/\s+/g, " ").trim();
}
export function setOwnText(el, text) {
  const nodes = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
  if (!nodes.length) { el.appendChild(el.ownerDocument.createTextNode(text)); return; }
  nodes[0].textContent = text;
  nodes.slice(1).forEach(n => n.remove());
}

/** One row per element and kind, last operation wins. */
export function changesOf(state, screen) {
  const byKey = new Map();
  for (const op of opsOf(state, screen)) {
    const kind = op.t === "show" ? "hide" : op.t;
    byKey.set(`${op.id}|${kind}`, op);
  }
  return [...byKey.entries()]
    .filter(([, op]) => !(op.t === "show") && !(op.t === "emph" && !op.level))
    .map(([k, op]) => {
      const key = `${screen}|${k}`;
      return { key, screen, id: op.id, kind: op.t, op, decision: state.decisions[key] || { status: "proposed", note: "" } };
    });
}

export function allChanges(state) {
  return Object.keys(state.screens).flatMap(screen => changesOf(state, screen));
}

export function exportModeling(state, screenTitles = {}) {
  return {
    schema: MODELING_SCHEMA, exportedAt: new Date().toISOString(),
    note: "Local design-decision file from the CleanFlow prototype. Synthetic data. Not live collaboration.",
    screens: state.screens, decisions: state.decisions,
    summary: allChanges(state).map(c => ({ screen: screenTitles[c.screen] || c.screen, element: c.id, change: c.kind, text: c.op.text, level: c.op.level, decision: c.decision.status, note: c.decision.note })),
  };
}

/** Plain-language Markdown record of the session (for the decision file). */
export function decisionsMarkdown(state, { titles = {}, labelOf = () => "", now = new Date() } = {}) {
  const changes = allChanges(state);
  const kindPt = { move: "movido", hide: "escondido", text: "renomeado", emph: "destaque alterado" };
  const statusPt = { approved: "Aprovado", question: "Pergunta", rejected: "Descartado", proposed: "Em aberto" };
  const lines = [`# Decisões visuais — sessão de modelagem`, ``, `Gerado em ${now.toISOString().slice(0, 16).replace("T", " ")} (UTC). Dados fictícios. Arquivo local, não é edição simultânea.`, ``];
  for (const status of ["approved", "question", "proposed", "rejected"]) {
    const rows = changes.filter(c => c.decision.status === status);
    if (!rows.length) continue;
    lines.push(`## ${statusPt[status]} (${rows.length})`, "");
    rows.forEach(c => lines.push(`- **${titles[c.screen] || c.screen}** · ${labelOf(c.screen, c.id) || c.id} — ${kindPt[c.kind]}${c.kind === "text" ? `: “${c.op.text}”` : ""}${c.kind === "emph" ? `: ${c.op.level === "prominent" ? "mais destaque" : "menos destaque"}` : ""}${c.decision.note ? ` — _${c.decision.note}_` : ""}`));
    lines.push("");
  }
  if (!changes.length) lines.push("Nenhuma mudança registrada.");
  return lines.join("\n");
}

// "Massinha" co-design model. Pure and serialisable: every editable piece of the
// prototype has a stable id; edits are stored as a layout per screen plus label
// overrides, and every change can carry a decision (proposed/approved/question).
// This is a design-validation tool. It is local to one browser and is not a
// multi-user collaboration backend.

export const STUDIO_SCHEMA = 1;

export const SCREENS = {
  now: {
    titleKey: "ws.screen.now",
    regions: ["top", "main", "side", "hidden"],
    blocks: [
      ["headline", "top"], ["command", "top"], ["startWith", "main"], ["queue", "main"],
      ["questions", "side"], ["today", "side"], ["tomorrow", "side"], ["future", "side"],
    ],
  },
  job: {
    titleKey: "ws.screen.job",
    regions: ["top", "main", "details", "hidden"],
    blocks: [
      ["status", "top"], ["rail", "top"], ["nextStep", "top"],
      ["cleaner", "main"], ["checklist", "main"], ["issues", "main"], ["property", "main"],
      ["payment", "details"], ["activity", "details"],
    ],
  },
  actions: {
    titleKey: "ws.screen.actions",
    regions: ["other", "hidden"],
    blocks: [
      ["assign", "other"], ["sendOffer", "other"], ["reviewOffers", "other"], ["remind", "other"], ["review", "other"],
      ["viewProgress", "other"], ["complete", "other"], ["property", "other"], ["cleanerView", "other"],
    ],
  },
  row: { // columns of the compact service list (strategy 3)
    titleKey: "ws.screen.row",
    regions: ["row", "hidden"],
    blocks: [["when", "row"], ["title", "row"], ["cleaner", "row"], ["status", "row"], ["offer", "row"], ["checklist", "row"], ["issues", "row"], ["primary", "row"]],
  },
  header: {
    titleKey: "ws.screen.header",
    regions: ["bar", "hidden"],
    blocks: [["newService", "bar"], ["bell", "bar"], ["cleanerView", "bar"], ["account", "bar"]],
  },
};

export function defaultLayout(screen) {
  return SCREENS[screen].blocks.map(([id, region]) => ({ id, region }));
}

export function initialStudio() {
  return {
    schema: STUDIO_SCHEMA,
    enabled: false,
    view: "candidate", // "candidate" or "original"
    layouts: Object.fromEntries(Object.keys(SCREENS).map(s => [s, defaultLayout(s)])),
    labels: {}, // { "a.assign": "Escolher cleaner" }
    emph: {}, // { "row/cleaner": "prominent" | "secondary" }
    decisions: {}, // { "job/payment": { status, note } , "label/a.assign": {...} }
    past: [], future: [],
  };
}

const SNAPSHOT_KEYS = ["layouts", "labels", "decisions", "emph"];
const snapshot = s => JSON.parse(JSON.stringify(Object.fromEntries(SNAPSHOT_KEYS.map(k => [k, s[k]]))));

function commit(state, next) {
  return { ...next, past: [...state.past.slice(-49), snapshot(state)], future: [] };
}

function moveBlock(list, id, region, index) {
  const block = list.find(b => b.id === id);
  if (!block) return list;
  const rest = list.filter(b => b.id !== id);
  const moved = { ...block, region };
  const inRegion = rest.filter(b => b.region === region);
  const anchor = inRegion[Math.max(0, Math.min(index ?? inRegion.length, inRegion.length))];
  const at = anchor ? rest.indexOf(anchor) : (() => {
    const last = inRegion[inRegion.length - 1];
    return last ? rest.indexOf(last) + 1 : rest.length;
  })();
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

export function studioReducer(state, action) {
  switch (action.type) {
    case "TOGGLE": return { ...state, enabled: action.enabled ?? !state.enabled };
    case "VIEW": return { ...state, view: action.view };
    case "MOVE": {
      const list = state.layouts[action.screen];
      return commit(state, { ...state, layouts: { ...state.layouts, [action.screen]: moveBlock(list, action.id, action.region, action.index) } });
    }
    case "STEP": { // move up/down within its region
      const list = state.layouts[action.screen];
      const block = list.find(b => b.id === action.id);
      const siblings = list.filter(b => b.region === block.region);
      const index = siblings.indexOf(block) + action.delta;
      if (index < 0 || index >= siblings.length) return state;
      return commit(state, { ...state, layouts: { ...state.layouts, [action.screen]: moveBlock(list, action.id, block.region, index + (action.delta > 0 ? 1 : 0)) } });
    }
    case "RESTORE": { // back to its original region, at its original position
      const original = defaultLayout(action.screen);
      const home = original.find(b => b.id === action.id).region;
      const pos = id => original.findIndex(b => b.id === id);
      const list = state.layouts[action.screen];
      const inRegion = list.filter(b => b.region === home && b.id !== action.id);
      const index = inRegion.filter(b => pos(b.id) < pos(action.id)).length;
      return commit(state, { ...state, layouts: { ...state.layouts, [action.screen]: moveBlock(list, action.id, home, index) } });
    }
    case "RENAME": {
      const labels = { ...state.labels };
      if (!action.text || action.text === action.original) delete labels[action.key]; else labels[action.key] = action.text;
      return commit(state, { ...state, labels });
    }
    case "EMPH": { // prominence of one block: "prominent", "secondary" or null
      const emph = { ...(state.emph || {}) };
      if (action.level === "prominent" || action.level === "secondary") emph[action.target] = action.level; else delete emph[action.target];
      return commit(state, { ...state, emph });
    }
    case "DECIDE":
      return commit(state, { ...state, decisions: { ...state.decisions, [action.target]: { status: action.status, note: action.note ?? state.decisions[action.target]?.note ?? "" } } });
    case "RESET_SCREEN":
      return commit(state, { ...state, layouts: { ...state.layouts, [action.screen]: defaultLayout(action.screen) } });
    case "RESET_ALL":
      return commit(state, { ...state, layouts: initialStudio().layouts, labels: {}, decisions: {}, emph: {} });
    case "UNDO": {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return { ...state, ...prev, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future] };
    }
    case "REDO": {
      if (!state.future.length) return state;
      const [next, ...rest] = state.future;
      return { ...state, ...next, past: [...state.past, snapshot(state)], future: rest };
    }
    case "IMPORT": {
      const parsed = validateImport(action.payload);
      return parsed ? commit(state, { ...state, ...parsed }) : state;
    }
    default: return state;
  }
}

/** Accepts only known screens, block ids, regions and string labels. */
export function validateImport(payload) {
  if (!payload || payload.schema !== STUDIO_SCHEMA) return null;
  const layouts = {};
  for (const [screen, def] of Object.entries(SCREENS)) {
    const ids = def.blocks.map(([id]) => id);
    const list = Array.isArray(payload.layouts?.[screen]) ? payload.layouts[screen] : null;
    const valid = list && list.length === ids.length && list.every(b => ids.includes(b.id) && def.regions.includes(b.region));
    layouts[screen] = valid ? list.map(b => ({ id: b.id, region: b.region })) : defaultLayout(screen);
  }
  const labels = Object.fromEntries(Object.entries(payload.labels || {}).filter(([k, v]) => typeof k === "string" && typeof v === "string" && v.length <= 80));
  const decisions = Object.fromEntries(Object.entries(payload.decisions || {}).filter(([, d]) => d && ["proposed", "approved", "question", "rejected"].includes(d.status))
    .map(([k, d]) => [k, { status: d.status, note: String(d.note || "").slice(0, 400) }]));
  const emph = Object.fromEntries(Object.entries(payload.emph || {}).filter(([k, v]) => typeof k === "string" && k.length < 60 && (v === "prominent" || v === "secondary")));
  return { layouts, labels, decisions, emph };
}

/** Human-readable list of every difference from the original. */
export function changesOf(state) {
  const changes = [];
  for (const screen of Object.keys(SCREENS)) {
    const original = defaultLayout(screen);
    state.layouts[screen].forEach(block => {
      const before = original.find(b => b.id === block.id);
      const target = `${screen}/${block.id}`;
      if (block.region === "hidden" && before.region !== "hidden") changes.push({ target, screen, id: block.id, kind: "hidden" });
      else if (block.region !== before.region) changes.push({ target, screen, id: block.id, kind: "moved", from: before.region, to: block.region });
      else {
        // Compare only blocks that were in this region before and still are,
        // so moving one block out does not mark its neighbours as reordered.
        const stayed = id => original.find(b => b.id === id)?.region === block.region && state.layouts[screen].find(b => b.id === id).region === block.region;
        const regionNow = state.layouts[screen].filter(b => b.region === block.region).map(b => b.id).filter(stayed);
        const regionBefore = original.filter(b => b.region === block.region).map(b => b.id).filter(stayed);
        if (regionNow.indexOf(block.id) !== regionBefore.indexOf(block.id)) changes.push({ target, screen, id: block.id, kind: "reordered" });
      }
    });
  }
  Object.entries(state.labels).forEach(([key, text]) => changes.push({ target: `label/${key}`, kind: "renamed", key, text }));
  Object.entries(state.emph || {}).forEach(([target, level]) => { const [screen, id] = target.split("/"); changes.push({ target: `emph/${target}`, screen, id, kind: "emph", level }); });
  return changes.map(c => ({ ...c, decision: state.decisions[c.target] || { status: "proposed", note: "" } }));
}

export function exportStudio(state) {
  return { schema: STUDIO_SCHEMA, exportedAt: new Date().toISOString(), layouts: state.layouts, labels: state.labels, decisions: state.decisions, changes: changesOf(state) };
}

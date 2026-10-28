// Builds a deterministic Figma import spec from the captured screen geometry.
// Usage: CAPTURE_WORK=/path node prototypes/manager-workspace-v3/figma-spec.mjs <outDir>
// Reads CAPTURE_WORK/figma/*.nodes.json (written by capture-screens.mjs) and the
// captured CSS (for V2 token names). Writes FIGMA_IMPORT_SPEC.json and FIGMA_COMPONENT_TREE.json.
import fs from "node:fs";
import path from "node:path";
const W = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), "../..");
const SP = process.env.CAPTURE_WORK || path.join(W, "artifacts/screen-capture-work");
const OUT = process.argv[2] || path.join(W, "docs/manager-workspace-v3/figma");
const SNAP = path.join(W, "src/prototypes/manager-workspace-v3/modeling/snapshots");
const index = JSON.parse(fs.readFileSync(path.join(SNAP, "index.json"), "utf8"));
fs.mkdirSync(OUT, { recursive: true });

// --- tokens: light values of --v2-color-* from the V2 stylesheet
const toHex = v => {
  const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return v.trim().toLowerCase();
  const [r, g, b, a = "1"] = m[1].split(/[ ,/]+/).filter(Boolean);
  const hex = [r, g, b].map(x => Number(x).toString(16).padStart(2, "0")).join("");
  return Number(a) < 1 ? `#${hex}${Math.round(Number(a) * 255).toString(16).padStart(2, "0")}` : `#${hex}`;
};
const tokens = {};
for (const f of fs.readdirSync(SNAP).filter(f => f.startsWith("css-"))) {
  const css = fs.readFileSync(path.join(SNAP, f), "utf8");
  const root = css.match(/:root\s*\{([^}]*)\}/);
  if (!root) continue;
  for (const m of root[1].matchAll(/(--v2-color-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) tokens[m[1]] ??= m[2].toLowerCase();
}
const byHex = Object.fromEntries(Object.entries(tokens).map(([k, v]) => [v.length === 4 ? `#${[...v.slice(1)].map(c => c + c).join("")}` : v, k]));
const paint = v => { if (!v) return undefined; const hex = toHex(v); return byHex[hex] ? { token: byHex[hex], hex } : { hex }; };
const px = v => (v ? Math.round(parseFloat(v) * 10) / 10 : undefined);

// --- node tree
const PAGE = { original: "02 — CLAUDE ORIGINAIS A+C", v2: "01 — BASE CLEANFLOW (CAPTURAS EDITÁVEIS)", prototype: "01 — BASE CLEANFLOW (CAPTURAS EDITÁVEIS)" };
const classCount = new Map();
function convert(n, parent) {
  const s = n.style || {};
  const isText = n.text && !n.children.length;
  const isIcon = n.tag === "svg" || n.tag === "img";
  const node = {
    id: n.id, name: n.name, type: isIcon ? "VECTOR_PLACEHOLDER" : isText ? "TEXT" : "FRAME",
    x: n.x - (parent ? parent.x : 0), y: n.y - (parent ? parent.y : 0), width: n.w, height: n.h,
  };
  if (s["background-color"]) node.fill = paint(s["background-color"]);
  if (s["border-top-width"] && s["border-top-style"] !== "none") node.stroke = { weight: px(s["border-top-width"]), color: paint(s["border-top-color"]) };
  if (s["border-radius"]) node.cornerRadius = px(s["border-radius"]);
  if (s.opacity) node.opacity = Number(s.opacity);
  if (s["box-shadow"]) node.shadow = s["box-shadow"];
  if (!isText && !isIcon && (s.display || "").includes("flex")) {
    node.autoLayout = { mode: (s["flex-direction"] || "row").startsWith("column") ? "VERTICAL" : "HORIZONTAL", gap: px(s.gap) || 0,
      padding: [px(s["padding-top"]) || 0, px(s["padding-right"]) || 0, px(s["padding-bottom"]) || 0, px(s["padding-left"]) || 0],
      primaryAlign: s["justify-content"] || "normal", counterAlign: s["align-items"] || "normal" };
  }
  if (n.text) node.text = { characters: n.text, fontFamily: (s["font-family"] || "").split(",")[0].replace(/["']/g, "").trim(), fontSize: px(s["font-size"]), fontWeight: Number(s["font-weight"]) || 400, lineHeight: s["line-height"], letterSpacing: s["letter-spacing"], textCase: s["text-transform"], color: paint(s.color), align: s["text-align"] };
  if (isIcon) node.referenceOnly = true;
  const cls = n.name.split(" · ")[1];
  if (cls && /^(cfv2|mw|cw|integrated|cf)-/.test(cls)) node.componentHint = cls;
  if (node.componentHint) classCount.set(cls, [...(classCount.get(cls) || []), n.id]);
  node.children = n.children.filter(c => !c.hidden && c.w > 0 && c.h > 0).map(c => convert(c, n));
  if (n.text && node.children.length) node.children.unshift({ id: `${n.id}-text`, name: "text", type: "TEXT", x: 0, y: 0, width: n.w, height: Math.min(n.h, px(s["line-height"]) || n.h), text: node.text });
  if (!node.children.length) delete node.children;
  return node;
}
const frames = [];
for (const meta of index) {
  const file = path.join(SP, "figma", `${meta.id}.nodes.json`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const map = new Map(raw.nodes.map(n => [n.id, { ...n, children: [] }]));
  let root = null;
  for (const n of map.values()) { if (n.parent && map.has(n.parent)) map.get(n.parent).children.push(n); else if (!n.parent) root = n; }
  const tree = convert(root, null);
  const base = { width: raw.width, height: raw.height, device: meta.device, source: meta.source, referenceImage: `reference/${meta.id}.png` };
  frames.push({ id: `${meta.id}--original`, name: `${meta.title} · ORIGINAL`, page: PAGE[meta.source], role: "original", editable: false, lockedReason: "Read-only baseline. Duplicate into the proposal frame to edit.", ...base, root: tree });
  if (["v2-services-desktop", "v2-job-progress-desktop", "v2-job-unassigned-desktop", "v2-dashboard-desktop", "v2-services-mobile", "v2-job-progress-mobile", "proto-inbox-desktop", "orig-a-desktop", "orig-c-desktop"].includes(meta.id)) {
    frames.push({ id: `${meta.id}--proposal`, name: `${meta.title} · PROPOSTA`, page: "03 — MASSINHA · TRABALHO AO VIVO", role: "proposal", editable: true, ...base, root: JSON.parse(JSON.stringify(tree).replaceAll(`"id":"`, `"id":"p:`)) });
  }
}
const spec = {
  specVersion: "cleanflow-figma-import/1",
  generated: "deterministic from captured DOM geometry; re-run figma-spec.mjs after re-capturing",
  honesty: [
    "No Figma file was written by Claude: the Figma connector was not authorised in the Claude session.",
    "ORIGINAL frames are exact geometry of the rendered originals / real V2 components with synthetic data; keep them locked.",
    "VECTOR_PLACEHOLDER nodes are icons: use the reference image or the matching icon component; they are not traced vectors.",
    "Fonts: Instrument Sans (originals) and Inter (V2) from Google Fonts.",
  ],
  pages: [
    { name: "01 — BASE CLEANFLOW (CAPTURAS EDITÁVEIS)", contains: "Real CleanFlow V2 components and prototype notification/account screens, synthetic data" },
    { name: "02 — CLAUDE ORIGINAIS A+C", contains: "Exact original A, B and C artboards of 2026-09-30 (B kept for completeness)" },
    { name: "03 — MASSINHA · TRABALHO AO VIVO", contains: "Editable PROPOSTA copies for the live session (page name abbreviated; use the existing third page)" },
  ],
  tokens: { colors: tokens },
  frames,
};
fs.writeFileSync(path.join(OUT, "FIGMA_IMPORT_SPEC.json"), JSON.stringify(spec));
const components = [...classCount.entries()].filter(([, ids]) => ids.length >= 3).sort((a, b) => b[1].length - a[1].length)
  .map(([cls, ids]) => ({ component: cls.replace(/^(cfv2|mw|cw|cf|integrated)-/, "").replace(/-/g, " "), sourceClass: cls, instances: ids.length, exampleNodeIds: ids.slice(0, 5) }));
fs.writeFileSync(path.join(OUT, "FIGMA_COMPONENT_TREE.json"), JSON.stringify({ specVersion: "cleanflow-figma-components/1", note: "Repeated UI classes across captured frames: candidates for Figma components. Build each once, then swap instances.", components }, null, 1));
console.log("frames", frames.length, "tokens", Object.keys(tokens).length, "components", components.length, "spec bytes", fs.statSync(path.join(OUT, "FIGMA_IMPORT_SPEC.json")).size);

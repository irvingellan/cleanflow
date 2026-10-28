// Usage: CAPTURE_WORK=/path node prototypes/manager-workspace-v3/capture-screens.mjs
// (build the prototype first: npm run prototype:v3:build)
// Captures real rendered DOM (+CSS, +geometry for Figma) of:
//  - the original A/B/C artboards (rendered with their own design runtime)
//  - the production V2 components in the repo's synthetic integrated harness
//  - the prototype's Notification Center and Account screens
import { spawn } from "node:child_process";
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const W = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
// Inputs/outputs outside the repo: CAPTURE_WORK must contain orig/ (the original
// .dc.html artboards + their design runtime saved as orig/support.js, read from the
// private concepts canvas). PNGs and Figma node files are written there too.
const SP = process.env.CAPTURE_WORK || path.join(W, "artifacts/screen-capture-work");
const OUT = path.join(W, "src/prototypes/manager-workspace-v3/modeling/snapshots");
const FIG = path.join(SP, "figma"); const PNG = path.join(SP, "snapshots-png");
for (const d of [OUT, FIG, PNG]) fs.mkdirSync(d, { recursive: true });

const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
function staticServer(root) {
  const s = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); r.end(b); }); });
  return new Promise(res => s.listen(0, () => res(s)));
}

// In-page: sanitise, assign stable ids, collect geometry/styles.
function snapshotInPage({ rootSel, prefix, dropText }) {
  let root = document.querySelector(rootSel);
  if (dropText) document.querySelectorAll(".integrated-banner").forEach(e => e.remove()); // harness-only toolbar
  root.querySelectorAll("script,noscript,iframe,object,embed,template,link").forEach(n => n.remove());
  root.querySelectorAll("input,textarea").forEach(n => { n.setAttribute("value", n.value); if (n.tagName === "TEXTAREA") n.textContent = n.value; });
  root.querySelectorAll("select").forEach(n => [...n.options].forEach(o => o.selected ? o.setAttribute("selected", "") : o.removeAttribute("selected")));
  const nodes = []; let i = 0;
  const base = root.getBoundingClientRect();
  const keep = ["color", "background-color", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-transform", "text-align", "border-radius", "border-top-width", "border-top-color", "border-top-style", "padding-top", "padding-right", "padding-bottom", "padding-left", "display", "flex-direction", "gap", "align-items", "justify-content", "opacity", "box-shadow"];
  const defaults = { "opacity": "1", "box-shadow": "none", "letter-spacing": "normal", "text-transform": "none", "gap": "normal", "border-top-width": "0px", "border-radius": "0px", "background-color": "rgba(0, 0, 0, 0)" };
  const walk = (el, parent) => {
    for (const a of [...el.attributes]) { if (/^on/i.test(a.name) || (a.name === "href" && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name); }
    const id = `${prefix}-${(i++).toString(36)}`;
    el.setAttribute("data-mid", id);
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const ownText = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").replace(/\s+/g, " ").trim();
    const style = {}; for (const k of keep) { const v = cs.getPropertyValue(k); if (v && defaults[k] !== v) style[k] = v; }
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean)[0] : "";
    const label = el.getAttribute("aria-label") || "";
    nodes.push({ id, parent, tag: el.tagName.toLowerCase(), name: [el.tagName.toLowerCase(), cls, (ownText || label).slice(0, 32)].filter(Boolean).join(" · "),
      x: Math.round(r.left - base.left), y: Math.round(r.top - base.top), w: Math.round(r.width), h: Math.round(r.height),
      text: ownText || undefined, hidden: cs.display === "none" || cs.visibility === "hidden" || undefined, style });
    if (el.tagName.toLowerCase() === "svg") return; // icon = one node
    [...el.children].forEach(c => walk(c, id));
  };
  walk(root, null);
  let css = "";
  for (const sh of document.styleSheets) { try { css += [...sh.cssRules].map(r => r.cssText).join("\n") + "\n"; } catch { /* cross-origin font css */ } }
  const fonts = [...document.querySelectorAll('link[href*="fonts.googleapis"]')].map(l => l.href);
  return { html: root.outerHTML, css, fonts, nodes, width: Math.round(base.width), height: Math.round(Math.max(base.height, root.scrollHeight)) };
}

const manifest = [];
const cssStore = {};
async function capture(page, meta, opts) {
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(400);
  const snap = await page.evaluate(snapshotInPage, opts);
  const hash = crypto.createHash("sha1").update(snap.css).digest("hex").slice(0, 10);
  cssStore[hash] = snap.css;
  const file = { schema: 1, ...meta, cssRef: hash, fonts: snap.fonts, width: snap.width, height: snap.height, html: snap.html };
  await page.screenshot({ path: path.join(PNG, `${meta.id}.png`), fullPage: true });
  fs.writeFileSync(path.join(OUT, `${meta.id}.json`), JSON.stringify(file));
  fs.writeFileSync(path.join(FIG, `${meta.id}.nodes.json`), JSON.stringify({ frame: meta.id, width: snap.width, height: snap.height, nodes: snap.nodes }));
  manifest.push({ id: meta.id, title: meta.title, source: meta.source, device: meta.device, width: snap.width, height: snap.height, nodes: snap.nodes.length, cssRef: hash });
  console.log("captured", meta.id, snap.nodes.length, "nodes", snap.html.length, "bytes");
}

const browser = await chromium.launch();
const newPage = (w, h) => browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });

// 1. Originals
{
  const s = await staticServer(path.join(SP, "orig"));
  const list = [["A", "Calm Workspace", "A_CalmWorkspace"], ["B", "Attention Cockpit", "B_AttentionCockpit"], ["C", "Intent First", "C_IntentFirst"]];
  for (const [k, name, file] of list) for (const [dev, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const page = await newPage(w, h);
    await page.goto(`http://localhost:${s.address().port}/${file}_${dev === "desktop" ? "Desktop" : "Mobile"}.dc.html`);
    await page.waitForTimeout(2500);
    await capture(page, { id: `orig-${k.toLowerCase()}-${dev}`, title: `${k} · ${name} · ${dev === "desktop" ? "Desktop" : "Mobile"}`, source: "original", device: dev, date: "2026-09-30" }, { rootSel: ".sc-host > div", prefix: `o${k.toLowerCase()}${dev[0]}` });
    await page.close();
  }
  s.close();
}

// 2. Production V2 components in the synthetic harness
{
  const srv = spawn("npx", ["vite", "--config", "e2e/integrated-v2/vite.config.js", "--host", "127.0.0.1", "--port", "4219", "--strictPort", "--mode", "e2e"], { cwd: W, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 4500));
  const base = "http://127.0.0.1:4219/e2e/integrated-v2/index.html";
  const probe = await newPage(1440, 900);
  await probe.goto(`${base}?view=dashboard&lang=pt&theme=light`); await probe.waitForTimeout(2500);
  const pick = await probe.evaluate(() => { const j = globalThis.__integratedContext.jobs; const f = s => (j.find(x => x.operationalStatus === s && !x.archivedAt) || {}).id; return { unassigned: f("UNASSIGNED"), offered: f("OFFERED"), assigned: f("ASSIGNED"), progress: f("IN_PROGRESS"), completed: f("COMPLETED") }; });
  console.log("picked", pick);
  await probe.close();
  const views = [
    ["v2-dashboard", "Painel", "dashboard", null],
    ["v2-services", "Serviços", "job-list", null],
    ["v2-job-unassigned", "Detalhe · sem cleaner", "job-detail", pick.unassigned],
    ["v2-job-offered", "Detalhe · oferecido", "job-detail", pick.offered],
    ["v2-job-progress", "Detalhe · em andamento", "job-detail", pick.progress],
    ["v2-job-completed", "Detalhe · concluído", "job-detail", pick.completed],
    ["v2-offer", "Oferecer a cleaners", "offer-cleaners", pick.unassigned],
    ["v2-checklist", "Checklist (execução)", "checklist-run", pick.progress],
    ["v2-property", "Detalhe da propriedade", "property-detail", null],
    ["v2-cleaner-job", "Visão da cleaner", "cleaner-job", pick.assigned],
  ];
  for (const [dev, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    for (const [id, title, view, job] of views) {
      if (dev === "mobile" && !["v2-dashboard", "v2-services", "v2-job-progress", "v2-cleaner-job"].includes(id)) continue;
      const page = await newPage(w, h);
      await page.goto(`${base}?view=${view}&lang=pt&theme=light&shell=v2${job ? `&job=${job}` : ""}`);
      await page.waitForTimeout(2200);
      await capture(page, { id: `${id}-${dev}`, title: `${title} · ${dev === "desktop" ? "Desktop" : "Celular"}`, source: "v2", device: dev, view }, { rootSel: "#root", prefix: `${id.replace(/[^a-z0-9]/g, "")}${dev[0]}`, dropText: ["SINTÉTICO LOCAL", "LOCAL SYNTHETIC"] });
      await page.close();
    }
  }
  srv.kill();
}

// 3. Prototype Notification Center + Account (already built prototype)
{
  const s = await staticServer(path.join(W, "dist-prototypes/manager-workspace-v3"));
  const url = `http://localhost:${s.address().port}/prototypes/manager-workspace-v3/index.html`;
  const page = await newPage(1440, 900);
  await page.goto(url); await page.waitForSelector(".mw-app");
  await page.locator(".mw-bell").click(); await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Renata enviou o checklist/ }).click(); await page.waitForTimeout(300);
  await capture(page, { id: "proto-inbox-desktop", title: "Central de notificações · Desktop", source: "prototype", device: "desktop" }, { rootSel: ".mw-panel-drawer", prefix: "pin" });
  await page.keyboard.press("Escape");
  await page.reload(); await page.waitForSelector(".mw-app");
  await page.locator(".mw-account-btn").click();
  await page.locator(".mw-setnav-item", { hasText: "Notificações" }).click(); await page.waitForTimeout(300);
  await capture(page, { id: "proto-account-desktop", title: "Conta e configurações · Desktop", source: "prototype", device: "desktop" }, { rootSel: ".mw-panel-drawer", prefix: "pac" });
  await page.close();
  s.close();
}
for (const [hash, css] of Object.entries(cssStore)) fs.writeFileSync(path.join(OUT, `css-${hash}.css`), css);
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(manifest, null, 1));
await browser.close();
console.log("css files", Object.keys(cssStore).length);

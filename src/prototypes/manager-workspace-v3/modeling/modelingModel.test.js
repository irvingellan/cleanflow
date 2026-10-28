import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { allChanges, applyOps, changesOf, cleanOp, decisionsMarkdown, exportModeling, initialModeling, modelingReducer, ownText, validateModeling } from "./modelingModel.js";

const here = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname));
const snapshot = id => JSON.parse(fs.readFileSync(path.join(here, "snapshots", `${id}.json`), "utf8"));
const docFor = html => { const doc = document.implementation.createHTMLDocument("x"); doc.body.innerHTML = html; return doc; };
const run = (state, ...actions) => actions.reduce(modelingReducer, state);
const html = `<div data-mid="r-0"><ul data-mid="r-1"><li data-mid="r-2">One</li><li data-mid="r-3">Two</li><li data-mid="r-4">Three <b data-mid="r-5">x</b></li></ul><aside data-mid="r-6"><p data-mid="r-7">Side</p></aside></div>`;

describe("modeling model", () => {
  it("replays move, hide, rename and emphasis on a copy without touching the original markup", () => {
    const doc = docFor(html);
    applyOps(doc, [
      { t: "move", id: "r-4", parent: "r-1", before: "r-2" },
      { t: "move", id: "r-7", parent: "r-1", before: null },
      { t: "hide", id: "r-3" },
      { t: "text", id: "r-2", text: "Primeiro" },
      { t: "emph", id: "r-4", level: "prominent" },
    ]);
    expect([...doc.querySelectorAll("li, p")].map(n => n.getAttribute("data-mid"))).toEqual(["r-4", "r-2", "r-3", "r-7"]);
    expect(doc.querySelector('[data-mid="r-3"]').hasAttribute("data-cf-hidden")).toBe(true);
    expect(ownText(doc.querySelector('[data-mid="r-2"]'))).toBe("Primeiro");
    expect(doc.querySelector('[data-mid="r-4"]').getAttribute("data-cf-emph")).toBe("prominent");
    expect(docFor(html).body.innerHTML).toBe(html);
  });

  it("skips impossible or unknown operations instead of failing", () => {
    const doc = docFor(html);
    const applied = applyOps(doc, [{ t: "move", id: "r-1", parent: "r-2", before: null }, { t: "hide", id: "zz-9" }]);
    expect(applied).toEqual([]);
  });

  it("renaming keeps child elements and sets plain text, never HTML", () => {
    const doc = docFor(html);
    applyOps(doc, [{ t: "text", id: "r-4", text: "<img src=x onerror=alert(1)>" }]);
    const li = doc.querySelector('[data-mid="r-4"]');
    expect(li.querySelector("img")).toBeNull();
    expect(li.querySelector('[data-mid="r-5"]')).not.toBeNull();
  });

  it("rejects malformed operations and imported files", () => {
    expect(cleanOp({ t: "eval", id: "r-1" })).toBeNull();
    expect(cleanOp({ t: "move", id: "r-1", parent: "javascript:alert(1)" })).toBeNull();
    expect(cleanOp({ t: "text", id: "r-1", text: "x".repeat(500) }).text).toHaveLength(120);
    expect(validateModeling({ schema: "other" })).toBeNull();
    const parsed = validateModeling({ schema: "cleanflow-modeling/2", screens: { "v2-services-desktop": { ops: [{ t: "hide", id: "a-1" }, { t: "bad" }] }, evil: { ops: [] } }, decisions: { k: { status: "hacked" } } }, ["v2-services-desktop"]);
    expect(parsed.screens).toEqual({ "v2-services-desktop": { ops: [{ t: "hide", id: "a-1" }] } });
    expect(parsed.decisions).toEqual({});
  });

  it("lists one change per element and kind, with decisions, undo, redo and reset", () => {
    let s = run(initialModeling(), { type: "OP", screen: "s", op: { t: "hide", id: "r-3" } }, { type: "OP", screen: "s", op: { t: "text", id: "r-2", text: "A" } }, { type: "OP", screen: "s", op: { t: "text", id: "r-2", text: "B" } });
    expect(changesOf(s, "s").map(c => [c.kind, c.op.text])).toEqual([["hide", undefined], ["text", "B"]]);
    s = run(s, { type: "DECIDE", key: "s|r-2|text", status: "question", note: "Nome claro?" });
    expect(changesOf(s, "s")[1].decision).toEqual({ status: "question", note: "Nome claro?" });
    s = run(s, { type: "OP", screen: "s", op: { t: "show", id: "r-3" } });
    expect(changesOf(s, "s").map(c => c.kind)).toEqual(["text"]);
    s = run(s, { type: "UNDO" });
    expect(changesOf(s, "s").map(c => c.kind)).toEqual(["hide", "text"]);
    s = run(s, { type: "REDO" }, { type: "RESET_ELEMENT", screen: "s", id: "r-2" });
    expect(changesOf(s, "s")).toEqual([]);
    s = run(s, { type: "OP", screen: "s", op: { t: "hide", id: "r-3" } }, { type: "RESET_SCREEN", screen: "s" });
    expect(allChanges(s)).toEqual([]);
  });

  it("exports a file that imports back to the same proposal, and a readable decision record", () => {
    const s = run(initialModeling(), { type: "OP", screen: "v2-services-desktop", op: { t: "hide", id: "a-1" } }, { type: "DECIDE", key: "v2-services-desktop|a-1|hide", status: "approved" });
    const file = JSON.parse(JSON.stringify(exportModeling(s)));
    const back = run(initialModeling(), { type: "IMPORT", payload: file, knownScreens: ["v2-services-desktop"] });
    expect(back.screens).toEqual(s.screens);
    expect(decisionsMarkdown(s, { titles: { "v2-services-desktop": "Serviços" } })).toMatch(/## Aprovado \(1\)[\s\S]*Serviços/);
  });

  it("captured snapshots are sanitised: stable ids, no scripts, no inline handlers", () => {
    const index = JSON.parse(fs.readFileSync(path.join(here, "snapshots", "index.json"), "utf8"));
    expect(index.filter(s => s.source === "original").map(s => s.id).sort()).toEqual(["orig-a-desktop", "orig-a-mobile", "orig-b-desktop", "orig-b-mobile", "orig-c-desktop", "orig-c-mobile"]);
    for (const meta of index) {
      const snap = snapshot(meta.id);
      expect(snap.html).not.toMatch(/<script|\son[a-z]+=|javascript:/i);
      const doc = docFor(snap.html);
      const ids = [...doc.querySelectorAll("[data-mid]")].map(n => n.getAttribute("data-mid"));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

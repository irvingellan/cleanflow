import { describe, expect, it } from "vitest";
import { changesOf, defaultLayout, exportStudio, initialStudio, studioReducer, validateImport } from "./studioModel.js";

const run = (state, ...actions) => actions.reduce(studioReducer, state);

describe("workshop model", () => {
  it("moves a block to another region and records it as a change", () => {
    const s = run(initialStudio(), { type: "MOVE", screen: "job", id: "payment", region: "main", index: 0 });
    expect(s.layouts.job.filter(b => b.region === "main")[0].id).toBe("payment");
    expect(changesOf(s)).toEqual([expect.objectContaining({ target: "job/payment", kind: "moved", from: "details", to: "main" })]);
  });

  it("steps a block up within its region", () => {
    const s = run(initialStudio(), { type: "STEP", screen: "now", id: "queue", delta: -1 });
    expect(s.layouts.now.filter(b => b.region === "main").map(b => b.id)).toEqual(["queue", "startWith"]);
  });

  it("ignores a step past the edge", () => {
    const s0 = initialStudio();
    expect(run(s0, { type: "STEP", screen: "now", id: "startWith", delta: -1 })).toBe(s0);
  });

  it("hides and restores, keeping the original untouched", () => {
    const s = run(initialStudio(), { type: "MOVE", screen: "header", id: "cleanerView", region: "hidden" });
    expect(changesOf(s)[0].kind).toBe("hidden");
    expect(defaultLayout("header").find(b => b.id === "cleanerView").region).toBe("bar");
    const back = run(s, { type: "RESTORE", screen: "header", id: "cleanerView" });
    expect(changesOf(back)).toEqual([]);
  });

  it("renames, and renaming back to the original removes the override", () => {
    let s = run(initialStudio(), { type: "RENAME", key: "a.assign", text: "Escolher cleaner", original: "Atribuir cleaner" });
    expect(s.labels).toEqual({ "a.assign": "Escolher cleaner" });
    s = run(s, { type: "RENAME", key: "a.assign", text: "Atribuir cleaner", original: "Atribuir cleaner" });
    expect(s.labels).toEqual({});
  });

  it("records decisions with notes", () => {
    const s = run(initialStudio(), { type: "RENAME", key: "now.queue", text: "Fila", original: "Precisa de você" },
      { type: "DECIDE", target: "label/now.queue", status: "question", note: "Fila soa técnico?" });
    expect(changesOf(s)[0].decision).toEqual({ status: "question", note: "Fila soa técnico?" });
  });

  it("undo and redo walk the history", () => {
    const s1 = run(initialStudio(), { type: "MOVE", screen: "now", id: "future", region: "hidden" });
    const s2 = run(s1, { type: "UNDO" });
    expect(changesOf(s2)).toEqual([]);
    const s3 = run(s2, { type: "REDO" });
    expect(changesOf(s3)).toHaveLength(1);
  });

  it("reset all returns to the original and can be undone", () => {
    const s1 = run(initialStudio(), { type: "MOVE", screen: "now", id: "future", region: "hidden" }, { type: "RESET_ALL" });
    expect(changesOf(s1)).toEqual([]);
    expect(changesOf(run(s1, { type: "UNDO" }))).toHaveLength(1);
  });

  it("exports and re-imports the same session", () => {
    const s = run(initialStudio(), { type: "MOVE", screen: "job", id: "activity", region: "main" }, { type: "RENAME", key: "j.moreDetails", text: "Extras", original: "Mais detalhes" });
    const payload = JSON.parse(JSON.stringify(exportStudio(s)));
    const imported = run(initialStudio(), { type: "IMPORT", payload });
    expect(changesOf(imported).map(c => c.target)).toEqual(changesOf(s).map(c => c.target));
  });

  it("rejects unknown schemas and sanitises bad layouts", () => {
    expect(validateImport({ schema: 99 })).toBeNull();
    const parsed = validateImport({ schema: 1, layouts: { now: [{ id: "evil", region: "main" }] }, labels: { x: 5, ok: "fine" }, decisions: { a: { status: "hacked" } } });
    expect(parsed.layouts.now).toEqual(defaultLayout("now"));
    expect(parsed.labels).toEqual({ ok: "fine" });
    expect(parsed.decisions).toEqual({});
  });
});

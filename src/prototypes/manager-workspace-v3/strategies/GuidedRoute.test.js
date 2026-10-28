import { describe, expect, it } from "vitest";
import { buildDemoState } from "../model/demoData.js";
import { domainReducer } from "../model/store.js";
import { ROUTE } from "./GuidedRoute.jsx";

const seen = (selected = [], overlays = [], cleaner = false) => ({ selected: new Set(selected), overlays: new Set(overlays), cleaner });
const done = (data, ui, s) => ROUTE.map(step => Boolean(step.done(data, ui, s)));

describe("guided manager route", () => {
  it("has 14 steps and starts with none done", () => {
    const data = buildDemoState("2026-10-20");
    expect(ROUTE).toHaveLength(14);
    expect(done(data, {}, seen()).filter(Boolean)).toHaveLength(0);
  });

  it("detects steps from what was actually done, and submitted is never counted as completed by itself", () => {
    let data = buildDemoState("2026-10-20");
    data = domainReducer(data, { type: "SEND_OFFERS", jobId: "j14", cleanerIds: ["paula"], comp: { mode: "fixed", amount: 95 }, link: "x", concept: "details" });
    const s = seen(["j14", "j07", "j05"], ["offer", "review"], true);
    const states = done(data, { selectedJobId: "j05", hybridScreen: "work", overlay: null, cleanerView: null }, s);
    expect(states.filter(Boolean)).toHaveLength(13); // all but "reply received"
    expect(data.jobs.find(j => j.id === "j05").status).toBe("IN_PROGRESS");
  });
});

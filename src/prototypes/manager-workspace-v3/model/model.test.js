import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasCleanerMessage } from "./cleanerCopy.js";
import { buildDemoState } from "./demoData.js";
import { hasMessage } from "./messages.js";
import { attentionFor, attentionQueue, dayCounts, filteredJobs, nextActionFor, parseIntent, statusOf } from "./selectors.js";
import { domainReducer, initialState } from "./store.js";
import { addDays, laDateKey, rangeFor, shiftRange, startOfWeek } from "./time.js";

const TODAY = "2026-10-20"; // a Tuesday
const fresh = () => buildDemoState(TODAY);
const job = (data, id) => data.jobs.find(j => j.id === id);

describe("operational days in America/Los_Angeles", () => {
  it("uses Los Angeles calendar days, not UTC", () => {
    expect(laDateKey(new Date("2026-10-21T06:30:00Z"))).toBe("2026-10-20"); // 23:30 PDT
    expect(laDateKey(new Date("2026-10-21T07:30:00Z"))).toBe("2026-10-21"); // 00:30 PDT
  });
  it("keeps day boundaries correct across the end of daylight saving time", () => {
    expect(laDateKey(new Date("2026-11-01T07:30:00Z"))).toBe("2026-11-01"); // 00:30 PDT
    expect(laDateKey(new Date("2026-11-02T07:30:00Z"))).toBe("2026-11-01"); // 23:30 PST
    expect(laDateKey(new Date("2026-11-02T08:30:00Z"))).toBe("2026-11-02"); // 00:30 PST
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
  });
  it("builds Today, Tomorrow, Week and specific-day ranges", () => {
    expect(rangeFor("today", TODAY, TODAY)).toMatchObject({ start: TODAY, end: TODAY });
    expect(rangeFor("tomorrow", TODAY, TODAY)).toMatchObject({ start: "2026-10-21", end: "2026-10-21" });
    expect(rangeFor("week", TODAY, TODAY)).toMatchObject({ start: "2026-10-19", end: "2026-10-25" });
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19");
    expect(shiftRange(rangeFor("today", TODAY, TODAY), 1, TODAY).kind).toBe("tomorrow");
    expect(shiftRange(rangeFor("tomorrow", TODAY, TODAY), 1, TODAY)).toMatchObject({ kind: "day", start: "2026-10-22" });
    expect(shiftRange(rangeFor("week", TODAY, TODAY), -1, TODAY)).toMatchObject({ start: "2026-10-12", end: "2026-10-18" });
  });
});

describe("synthetic demo data", () => {
  it("is dense enough for the 30–40 job scenario and uses only fictitious access codes", () => {
    const data = fresh();
    expect(data.jobs.length).toBeGreaterThanOrEqual(40);
    expect(data.properties.every(p => /^DEMO-\d{4}$/.test(p.accessCode))).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/@|https:\/\/(?!demo\.cleanflow\.invalid)/);
  });
});

describe("presentation-independent selectors", () => {
  it("never exposes internal status names", () => {
    const data = fresh();
    data.jobs.forEach(j => expect(statusOf(j).key).toMatch(/^st\./));
  });
  it("derives the attention each scenario needs", () => {
    const data = fresh();
    expect(attentionFor(data, job(data, "j01"))[0].kind).toBe("overdue"); // open since yesterday
    expect(attentionFor(data, job(data, "j14"))[0].kind).toBe("noCleanerToday");
    expect(attentionFor(data, job(data, "j15"))[0].kind).toBe("interest");
    expect(attentionFor(data, job(data, "j06"))[0].kind).toBe("reviewProblem"); // submitted with a missing required photo
    expect(attentionFor(data, job(data, "j05"))[0].kind).toBe("review");
    expect(attentionFor(data, job(data, "j13"))[0].kind).toBe("notNotified");
    expect(attentionFor(data, job(data, "j09")).map(a => a.kind)).toContain("staleLink");
    expect(attentionFor(data, job(data, "j10"))).toHaveLength(0); // on track
  });
  it("orders the attention queue by urgency and includes overdue work", () => {
    const data = fresh();
    const queue = attentionQueue(data, rangeFor("today", TODAY, TODAY));
    expect(queue[0].job.id).toBe("j01");
    expect(queue.map(q => q.rank)).toEqual([...queue.map(q => q.rank)].sort((a, b) => a - b));
  });
  it("answers the daily questions consistently with the filters", () => {
    const data = fresh();
    const range = rangeFor("today", TODAY, TODAY);
    const counts = dayCounts(data, range);
    expect(counts.review).toBe(filteredJobs(data, range, "review").length);
    expect(counts.responses).toBe(filteredJobs(data, range, "responses").length);
    expect(counts.total).toBe(filteredJobs(data, range, "all").length);
  });
  it("resolves typed intents to services", () => {
    const data = fresh();
    expect(parseIntent(data, "revisar ocean").jobs[0].id).toBe("j06");
    expect(parseIntent(data, "atribuir juniper").jobs[0].id).toBe("j14");
    expect(parseIntent(data, "novo serviço").intent).toBe("create");
  });
});

describe("operational transitions", () => {
  it("interest never assigns; assignment is a separate manager action", () => {
    let data = fresh();
    data = domainReducer(data, { type: "SEND_OFFERS", jobId: "j14", cleanerIds: ["nora", "lucia"], comp: { mode: "fixed", amount: 95, source: "property" }, link: "x", concept: "details" });
    expect(job(data, "j14").status).toBe("OFFERED");
    const before = data.notifications.length;
    data = domainReducer(data, { type: "OFFER_RESPONSE", jobId: "j14", cleanerId: "nora", cleanerName: "Nora", response: "interested", via: "link" });
    expect(job(data, "j14").status).toBe("OFFERED");
    expect(job(data, "j14").cleanerIds).toEqual([]);
    expect(nextActionFor(data, job(data, "j14")).action).toBe("reviewOffers");
    expect(data.notifications.length).toBe(before + 1);
    data = domainReducer(data, { type: "ASSIGN", jobId: "j14", cleanerId: "nora", cleanerName: "Nora" });
    expect(job(data, "j14")).toMatchObject({ status: "ASSIGNED", cleanerIds: ["nora"], ack: "not_notified" });
  });
  it("a reply recorded from a text message does not pretend to be a push", () => {
    let data = fresh();
    const before = data.notifications.length;
    data = domainReducer(data, { type: "OFFER_RESPONSE", jobId: "j17", cleanerId: "joana", cleanerName: "Joana", response: "interested", via: "message" });
    expect(job(data, "j17").offers.find(o => o.cleanerId === "joana")).toMatchObject({ response: "interested", via: "message" });
    expect(data.notifications.length).toBe(before);
  });
  it("keeps draft, submitted, reviewed and completed as distinct states", () => {
    let data = fresh();
    expect(job(data, "j07").checklist.state).toBe("draft");
    data = domainReducer(data, { type: "CL_SUBMIT", jobId: "j07", cleanerName: "Sofia", note: "", missingNote: "camera" });
    expect(job(data, "j07").checklist.state).toBe("submitted");
    expect(job(data, "j07").status).toBe("IN_PROGRESS");
    data = domainReducer(data, { type: "REVIEW_CHECKLIST", jobId: "j07", outcome: "approved" });
    expect(job(data, "j07").checklist.state).toBe("reviewed");
    expect(job(data, "j07").status).toBe("IN_PROGRESS");
    data = domainReducer(data, { type: "COMPLETE_JOB", jobId: "j07" });
    expect(job(data, "j07").status).toBe("COMPLETED");
  });
  it("saving a checklist template creates a new version without rewriting submitted reports", () => {
    let data = fresh();
    const tpl = data.templates["tpl-sunset"];
    data = domainReducer(data, { type: "TEMPLATE_SAVE", templateId: tpl.id, sections: tpl.sections.slice(0, 2) });
    expect(data.templates["tpl-sunset"].version).toBe(tpl.version + 1);
    expect(job(data, "j05").checklist.templateVersion).toBe(tpl.version);
  });
  it("photos are only ever added; a failed upload can be retried", () => {
    let data = fresh();
    const count = job(data, "j07").checklist.photos.length;
    data = domainReducer(data, { type: "CL_PHOTOS_ADD", jobId: "j07", photos: [{ id: "p1", itemId: "showerPhoto", sectionId: "bath", status: "uploading", progress: 0 }] });
    data = domainReducer(data, { type: "CL_PHOTO_STATUS", jobId: "j07", photoId: "p1", status: "failed" });
    data = domainReducer(data, { type: "CL_PHOTO_STATUS", jobId: "j07", photoId: "p1", status: "saved" });
    expect(job(data, "j07").checklist.photos).toHaveLength(count + 1);
    expect(job(data, "j07").checklist.items.showerPhoto).toBe(true);
  });
});

describe("copy coverage", () => {
  const dir = path.resolve(__dirname, "..");
  const files = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.jsx?$/.test(e.name) && !e.name.includes(".test.") && files.push(path.join(d, e.name))));
  walk(dir);
  const source = files.map(f => fs.readFileSync(f, "utf8")).join("\n");
  it("every literal manager key exists", () => {
    const keys = [...source.matchAll(/\bt\("([a-z]+\.[A-Za-z0-9_.]+)"/g)].map(m => m[1]);
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.filter(k => !hasMessage(k))).toEqual([]);
  });
  it("every literal cleaner key exists", () => {
    const keys = [...source.matchAll(/\bct\(lang, "([a-z]+\.[A-Za-z0-9_.]+)"/g)].map(m => m[1]);
    expect(keys.filter(k => !hasCleanerMessage(k))).toEqual([]);
  });
  it("every computed key family is complete", () => {
    const families = {
      att: ["overdue", "issue", "reviewProblem", "review", "interest", "noCleanerToday", "noCleanerTomorrow", "notNotified", "notConfirmed", "staleLink", "offersWaiting", "noCleanerLater", "readyToComplete", "onTrack", "done"],
      a: ["assign", "sendOffer", "reviewOffers", "remind", "review", "complete", "newLink", "issue", "viewProgress", "message", "viewReport", "property", "cleanerView"],
      stage: ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"],
      cl: ["none", "draft", "submitted", "reviewed", "changes"],
      f: ["needsYou", "all", "noCleaner", "responses", "notConfirmed", "review", "inProgress", "completed"],
      type: ["turnover", "cleaning", "touchup", "custom"],
    };
    const missing = Object.entries(families).flatMap(([prefix, names]) => names.map(n => `${prefix}.${n}`)).filter(k => !hasMessage(k));
    expect(missing).toEqual([]);
  });
});

describe("Production exclusion", () => {
  it("the Production entry points never import the prototype", () => {
    const root = path.resolve(__dirname, "../../../..");
    ["src/main.jsx", "src/App.jsx", "index.html", "vite.config.js"].forEach(file => {
      expect(fs.readFileSync(path.join(root, file), "utf8")).not.toMatch(/prototypes\/manager-workspace-v3/);
    });
  });
});

describe("store", () => {
  it("starts in the recommended hybrid layout on the Now screen", () => {
    expect(initialState(TODAY).ui).toMatchObject({ mode: "hybrid", hybridScreen: "now" });
  });
});

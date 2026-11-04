import { checklistItems } from "./demoData.js";
import { dayDiff, inRange, minutesUntil } from "./time.js";

// Presentation-independent operational truth. Every layout reads these
// selectors; no layout derives status, attention or next actions on its own.

export const STAGES = ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"];

export function stageIndex(job) { return Math.max(0, STAGES.indexOf(job.status)); }

export function templateFor(state, job) {
  const property = state.properties.find(p => p.id === job.propertyId);
  return state.templates[property.checklistTemplateId];
}

export function checklistSummary(state, job) {
  const c = job.checklist || { state: "none", items: {}, photos: [] };
  const tpl = templateFor(state, job);
  const items = checklistItems(tpl.sections);
  const done = items.filter(i => c.items?.[i.id]).length;
  const requiredPhotos = items.filter(i => i.photo);
  const missingPhotos = requiredPhotos.filter(i => !c.items?.[i.id]);
  const missingItems = items.filter(i => !i.photo && !c.items?.[i.id]);
  const saved = (c.photos || []).filter(p => p.status === "saved").length;
  const failed = (c.photos || []).filter(p => p.status === "failed").length;
  const uploading = (c.photos || []).filter(p => p.status === "uploading").length;
  return { state: c.state, done, total: items.length, missingPhotos, missingItems, photos: saved, failed, uploading, link: c.link, templateVersion: c.templateVersion, currentVersion: tpl.version };
}

export function offerSummary(job) {
  const interested = job.offers.filter(o => o.response === "interested");
  const declined = job.offers.filter(o => o.response === "declined");
  const waiting = job.offers.filter(o => !o.response);
  return { sent: job.offers.length, interested, declined, waiting };
}

/** Plain-language status. Never exposes an enum name. */
export function statusOf(job) {
  const offers = offerSummary(job);
  const c = job.checklist?.state || "none";
  if (job.status === "COMPLETED") return { key: "st.completed", tone: "success" };
  if (job.status === "IN_PROGRESS") {
    if (c === "submitted") return { key: "st.submitted", tone: "attention" };
    if (c === "reviewed") return { key: "st.reviewed", tone: "success" };
    if (c === "changes") return { key: "st.changes", tone: "warning" };
    if (c === "draft") return { key: "st.draft", tone: "brand" };
    return { key: "st.inProgress", tone: "brand" };
  }
  if (job.status === "ASSIGNED") {
    if (job.ack === "confirmed") return { key: "st.confirmed", tone: "brand" };
    if (job.ack === "not_notified") return { key: "st.notNotified", tone: "attention" };
    return { key: "st.awaitingConfirmation", tone: "attention" };
  }
  if (offers.interested.length) return { key: "st.interest", tone: "attention", params: { count: offers.interested.length } };
  if (offers.sent) return { key: "st.offered", tone: "info" };
  return { key: "st.unassigned", tone: "warning" };
}

const RANK = { overdue: 1, issue: 2, noCleanerToday: 3, reviewProblem: 3, interest: 4, review: 4, notNotified: 5, notConfirmed: 6, staleLink: 6, noCleanerTomorrow: 6, offersWaiting: 8, noCleanerLater: 9 };

/** Attention items for one service, most urgent first. */
export function attentionFor(state, job) {
  const now = state.clock;
  const items = [];
  const day = dayDiff(now.date, job.date);
  const until = minutesUntil(now, job.date, job.start);
  const offers = offerSummary(job);
  const cl = checklistSummary(state, job);
  const push = (kind, tone, action, params = {}) => items.push({ kind, tone, action, rank: RANK[kind], params });

  if (job.status !== "COMPLETED" && day < 0) push("overdue", "warning", cl.state === "submitted" ? "review" : "complete");
  job.issues.filter(i => i.status === "open").forEach(issue => push("issue", "risk", "issue", { issue }));
  if (cl.state === "submitted") {
    if (cl.missingPhotos.length || cl.missingItems.length) push("reviewProblem", "risk", "review", { count: cl.missingPhotos.length + cl.missingItems.length });
    else push("review", "attention", "review");
  }
  if (job.status === "UNASSIGNED" || job.status === "OFFERED") {
    if (offers.interested.length) push("interest", "attention", "reviewOffers", { name: offers.interested.map(o => o.cleanerId) });
    else if (day <= 0) push("noCleanerToday", "warning", offers.sent ? "reviewOffers" : "assign", { offers: offers.sent });
    else if (day === 1) push("noCleanerTomorrow", "warning", offers.sent ? "reviewOffers" : "assign", { offers: offers.sent });
    else if (offers.waiting.length) push("offersWaiting", "info", "reviewOffers", { offers: offers.sent });
    else push("noCleanerLater", "neutral", "assign");
  }
  if (job.status === "ASSIGNED" && day >= 0 && (until === null || until < 36 * 60)) {
    if (job.ack === "not_notified") push("notNotified", "attention", "remind");
    else if (job.ack === "pending") push("notConfirmed", "attention", "remind");
  }
  if (cl.link === "stale" && job.status === "IN_PROGRESS") push("staleLink", "attention", "newLink");
  return items.sort((a, b) => a.rank - b.rank);
}

export function needsYou(state, job) {
  return attentionFor(state, job).some(a => a.tone !== "neutral");
}

/** The single recommended next action for a service. */
export function nextActionFor(state, job) {
  const top = attentionFor(state, job)[0];
  if (top) return { action: top.action, kind: top.kind, tone: top.tone };
  const cl = checklistSummary(state, job);
  if (job.status === "IN_PROGRESS" && cl.state === "reviewed") return { action: "complete", kind: "readyToComplete", tone: "success" };
  if (job.status === "IN_PROGRESS") return { action: "viewProgress", kind: "onTrack", tone: "neutral" };
  if (job.status === "ASSIGNED") return { action: "message", kind: "onTrack", tone: "neutral" };
  if (job.status === "COMPLETED") return { action: "viewReport", kind: "done", tone: "success" };
  return { action: "assign", kind: "noCleanerLater", tone: "neutral" };
}

/** Other actions that are valid for this service, beside the recommended one. */
export function otherActionsFor(state, job, primary) {
  const actions = [];
  const add = a => { if (a !== primary && !actions.includes(a)) actions.push(a); };
  if (job.status === "UNASSIGNED" || job.status === "OFFERED") { add("assign"); add("sendOffer"); if (job.offers.length) add("reviewOffers"); }
  if (job.status === "ASSIGNED") { add("remind"); add("assign"); }
  if (job.status === "IN_PROGRESS") {
    const cl = checklistSummary(state, job);
    if (cl.state === "submitted") add("review");
    if (cl.state !== "submitted") add("viewProgress");
    add("complete");
  }
  add("property");
  if (job.status !== "COMPLETED") add("cleanerView");
  return actions;
}

export function jobsInRange(state, range) {
  return state.jobs.filter(j => inRange(j.date, range)).sort(compareJobs);
}

export function compareJobs(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.start || "99:99").localeCompare(b.start || "99:99");
}

/** Everything that needs the manager now: overdue work plus the selected range. */
export function attentionQueue(state, range) {
  const pool = state.jobs.filter(j => inRange(j.date, range) || (j.date < state.clock.date && j.status !== "COMPLETED"));
  return pool.flatMap(job => attentionFor(state, job).filter(a => a.tone !== "neutral").slice(0, 1).map(a => ({ ...a, job })))
    .sort((a, b) => a.rank - b.rank || compareJobs(a.job, b.job));
}

export const QUESTION_KEYS = ["noCleaner", "responses", "notConfirmed", "review", "readyToComplete", "issues"];

/** Counts behind the eight daily questions, for one range. */
export function dayCounts(state, range) {
  const jobs = jobsInRange(state, range);
  const att = j => attentionFor(state, j).map(a => a.kind);
  return {
    total: jobs.length,
    needsYou: jobs.filter(j => needsYou(state, j)).length,
    onTrack: jobs.filter(j => !needsYou(state, j) && j.status !== "COMPLETED").length,
    completed: jobs.filter(j => j.status === "COMPLETED").length,
    noCleaner: jobs.filter(j => (j.status === "UNASSIGNED" || j.status === "OFFERED") && !offerSummary(j).interested.length).length,
    responses: jobs.filter(j => att(j).includes("interest")).length,
    notConfirmed: jobs.filter(j => att(j).some(k => k === "notConfirmed" || k === "notNotified")).length,
    review: jobs.filter(j => j.checklist?.state === "submitted").length,
    readyToComplete: jobs.filter(j => j.status === "IN_PROGRESS" && j.checklist?.state === "reviewed").length,
    issues: jobs.filter(j => att(j).includes("issue")).length,
    inProgress: jobs.filter(j => j.status === "IN_PROGRESS").length,
  };
}

export const FILTERS = {
  all: () => true,
  needsYou: (state, job) => needsYou(state, job),
  noCleaner: (state, job) => job.status === "UNASSIGNED" || job.status === "OFFERED",
  responses: (state, job) => attentionFor(state, job).some(a => a.kind === "interest"),
  notConfirmed: (state, job) => attentionFor(state, job).some(a => a.kind === "notConfirmed" || a.kind === "notNotified"),
  review: (state, job) => job.checklist?.state === "submitted",
  inProgress: (state, job) => job.status === "IN_PROGRESS",
  completed: (state, job) => job.status === "COMPLETED",
};

export function filteredJobs(state, range, filter = "all", search = "") {
  const q = search.trim().toLocaleLowerCase();
  return jobsInRange(state, range)
    .filter(job => (FILTERS[filter] || FILTERS.all)(state, job))
    .filter(job => !q || searchText(state, job).includes(q));
}

export function searchText(state, job) {
  const p = state.properties.find(x => x.id === job.propertyId);
  return [p.name, p.area, ...job.cleanerIds].join(" ").toLocaleLowerCase();
}

export function groupByDay(jobs) {
  const groups = [];
  jobs.forEach(job => {
    const last = groups[groups.length - 1];
    if (last && last.date === job.date) last.jobs.push(job); else groups.push({ date: job.date, jobs: [job] });
  });
  return groups;
}

/** Cleaners free on a date: no overlapping assignment that day (demo heuristic, not a rule). */
export function cleanerLoad(state, cleanerId, date) {
  return state.jobs.filter(j => j.date === date && j.cleanerIds.includes(cleanerId) && j.status !== "COMPLETED");
}

export function unreadCount(state, cleanerId = null) { return state.notifications.filter(n => !n.read && (cleanerId ? n.audience?.cleanerId === cleanerId : !n.audience)).length; }

/** Simple deterministic intent parser for Intent-First and the hybrid command bar. */
export function parseIntent(state, text) {
  const q = text.trim().toLocaleLowerCase();
  if (!q) return { intent: null, jobs: [] };
  const verbs = [
    ["assign", ["atribu", "assign", "asign", "sem cleaner", "no cleaner", "cleaner"]],
    ["review", ["revis", "review", "checklist"]],
    ["remind", ["lembr", "remind", "record", "confirm"]],
    ["offer", ["ofert", "offer"]],
    ["issues", ["problem", "issue"]],
    ["create", ["novo", "nova", "new", "nuevo", "criar", "create"]],
  ];
  const intent = (verbs.find(([, words]) => words.some(w => q.includes(w))) || [null])[0];
  const named = state.properties.filter(p => q.includes(p.name.toLocaleLowerCase().split(" ")[0]));
  let jobs = state.jobs.filter(j => j.status !== "COMPLETED" && j.date >= state.clock.date || attentionFor(state, j).length);
  if (named.length) jobs = jobs.filter(j => named.some(p => p.id === j.propertyId));
  if (intent === "assign") jobs = jobs.filter(j => j.status === "UNASSIGNED" || j.status === "OFFERED");
  if (intent === "review") jobs = jobs.filter(j => j.checklist?.state === "submitted");
  if (intent === "remind") jobs = jobs.filter(j => j.status === "ASSIGNED" && j.ack !== "confirmed");
  if (intent === "offer") jobs = jobs.filter(j => j.status === "UNASSIGNED" || j.status === "OFFERED");
  if (intent === "issues") jobs = jobs.filter(j => j.issues.some(i => i.status === "open"));
  if (!intent && !named.length) jobs = [];
  return { intent, named, jobs: jobs.sort(compareJobs).sort((a, b) => (attentionFor(state, a)[0]?.rank || 99) - (attentionFor(state, b)[0]?.rank || 99)) };
}

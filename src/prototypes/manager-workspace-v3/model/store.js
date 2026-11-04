import { createContext, createElement, useContext, useEffect, useMemo, useReducer } from "react";
import { buildDemoState, checklistItems } from "./demoData.js";
import { laDateKey, rangeFor } from "./time.js";

// One synthetic, presentation-independent state for all four layouts.
// Switching layout only changes `ui.mode`; operational truth lives in `data`.

const STORAGE_KEY = "cleanflow-manager-workspace-v3-demo";
const SCHEMA = 5;

export function initialState(today = laDateKey()) {
  return {
    schema: SCHEMA,
    data: buildDemoState(today),
    ui: {
      mode: "hybrid", hybridScreen: "now", range: rangeFor("today", today, today), filter: "needsYou", search: "",
      selectedJobId: null, overlay: null, cleanerView: null, mobileTab: "home", toast: null, lang: "pt", theme: null,
      notificationFilter: "all", notificationQuery: "", inboxDemoState: "ready", offerConcept: "details", pushBanner: null,
    },
  };
}

function load() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const today = laDateKey();
    if (stored?.schema === SCHEMA && stored.data?.today === today) return stored;
  } catch { /* storage may be unavailable; fall back to a fresh demo */ }
  return initialState();
}

const tick = data => ({ ...data, clock: { ...data.clock, minutes: Math.min(data.clock.minutes + 1, 23 * 60 + 59) } });
const now = data => ({ date: data.clock.date, min: data.clock.minutes });

function updateJob(data, jobId, change) {
  return { ...data, jobs: data.jobs.map(j => (j.id === jobId ? change(j) : j)) };
}
function logged(job, data, key, params = {}) {
  return [...job.activity, { at: now(data), key, params }];
}
function notify(data, notification) {
  return { ...data, notifications: [{ id: `n${Date.now()}${Math.random().toString(16).slice(2, 5)}`, at: now(data), read: false, delivery: { targets: 2, accepted: true, displayed: "unknown", openedAt: null, openTracked: true }, source: "cleaner", simulated: true, ...notification }, ...data.notifications] };
}

const bodyKeyFor = { cleanerInterested: "nb.offerInterest", checklistReceived: "nb.checklist", assignmentConfirmed: "nb.assignConfirmed" };

// A cleaner-audience event. Delivery reflects that cleaner's device evidence; the
// inbox entry exists whatever happens to the push.
function notifyCleaner(data, cleanerId, n) {
  const dev = (data.deviceHealth || []).find(x => x.owner === cleanerId && x.current);
  const ready = dev && dev.permission === "granted" && ["active", "stale"].includes(dev.registration);
  const delivery = !dev || !ready ? { targets: 0, accepted: null, displayed: "unknown", openedAt: null, openTracked: true }
    : { targets: 1, accepted: true, displayed: "unknown", openedAt: null, openTracked: true };
  return notify(data, { audience: { cleanerId }, source: "system", delivery, ...n });
}
const changeOf = (d, cleanerId, kind, job, extra = {}) => ({ id: `ch${Date.now()}${Math.random().toString(16).slice(2, 5)}`, cleanerId, kind, jobId: job.id, propertyId: job.propertyId, at: now(d), ...extra });

export function domainReducer(data, action) {
  const d = tick(data);
  const prop = jobId => d.properties.find(p => p.id === d.jobs.find(j => j.id === jobId).propertyId);
  switch (action.type) {
    case "ASSIGN":
      return updateJob(d, action.jobId, job => ({ ...job, status: "ASSIGNED", cleanerIds: [action.cleanerId], ack: "not_notified",
        offers: job.offers.map(o => (o.cleanerId === action.cleanerId ? o : o)),
        activity: logged(job, d, "act.assigned", { name: action.cleanerName }) }));
    case "SEND_OFFERS": {
      const offers = action.cleanerIds.map(id => ({ cleanerId: id, sentAt: now(d), response: null, respondedAt: null, via: "link" }));
      return updateJob(d, action.jobId, job => ({ ...job, status: "OFFERED", offers: [...job.offers.filter(o => !action.cleanerIds.includes(o.cleanerId)), ...offers],
        comp: action.comp, offerLink: action.link, offerConcept: action.concept,
        activity: logged(job, d, "act.offersSent", { count: offers.length }) }));
    }
    case "OFFER_RESPONSE": {
      const job = d.jobs.find(j => j.id === action.jobId);
      const next = updateJob(d, action.jobId, j => ({ ...j, offers: j.offers.map(o => (o.cleanerId === action.cleanerId ? { ...o, response: action.response, respondedAt: now(d), via: action.via } : o)),
        activity: logged(j, d, action.response === "interested" ? (action.via === "message" ? "act.interestByMessage" : "act.interest") : "act.declined", { name: action.cleanerName }) }));
      if (action.via === "message") return next;
      return notify(next, { category: action.response === "interested" ? "cleanerInterested" : "offerDeclined", bodyKey: action.response === "interested" ? "nb.offerInterest" : "nb.offerDeclined", jobId: job.id, titleKey: action.response === "interested" ? "n.offerInterest" : "n.offerDeclined", params: { name: action.cleanerName, property: prop(job.id).name } });
    }
    case "REMINDER_PREPARED":
      return updateJob(d, action.jobId, job => ({ ...job, ack: job.ack === "not_notified" ? "pending" : job.ack, activity: logged(job, d, "act.reminder", {}) }));
    case "CLEANER_CONFIRMED":
      return updateJob(d, action.jobId, job => ({ ...job, ack: "confirmed", activity: logged(job, d, "act.confirmed", { name: action.cleanerName }) }));
    case "NEW_LINK":
      return updateJob(d, action.jobId, job => ({ ...job, checklist: { ...job.checklist, link: "active" }, activity: logged(job, d, "act.newLink", {}) }));
    case "RESOLVE_ISSUE":
      return updateJob(d, action.jobId, job => ({ ...job, issues: job.issues.map(i => (i.id === action.issueId ? { ...i, status: "resolved" } : i)), activity: logged(job, d, "act.issueResolved", {}) }));
    case "REVIEW_CHECKLIST":
      return updateJob(d, action.jobId, job => ({ ...job, checklist: { ...job.checklist, state: action.outcome === "approved" ? "reviewed" : "changes", reviewedAt: now(d), reviewNote: action.note || "" },
        activity: logged(job, d, action.outcome === "approved" ? "act.reviewed" : "act.changesRequested", {}) }));
    case "COMPLETE_JOB":
      return updateJob(d, action.jobId, job => ({ ...job, status: "COMPLETED", completedAt: now(d), activity: logged(job, d, "act.completed", {}) }));
    case "CL_TOGGLE": {
      return updateJob(d, action.jobId, job => ({ ...job, status: job.status === "ASSIGNED" ? "IN_PROGRESS" : job.status,
        checklist: { ...job.checklist, state: job.checklist.state === "none" || job.checklist.state === "changes" ? "draft" : job.checklist.state,
          items: { ...job.checklist.items, [action.itemId]: !job.checklist.items?.[action.itemId] }, savedAt: now(d) } }));
    }
    case "CL_PHOTOS_ADD":
      return updateJob(d, action.jobId, job => ({ ...job, status: job.status === "ASSIGNED" ? "IN_PROGRESS" : job.status,
        checklist: { ...job.checklist, state: job.checklist.state === "none" ? "draft" : job.checklist.state, savedAt: now(d),
          photos: [...(job.checklist.photos || []), ...action.photos] } }));
    case "CL_PHOTO_REMOVE": // a draft photo can be removed; it frees one slot of the limit
      return updateJob(d, action.jobId, job => {
        const gone = job.checklist.photos.find(p => p.id === action.photoId);
        const photos = job.checklist.photos.filter(p => p.id !== action.photoId);
        const items = { ...job.checklist.items };
        if (gone && !photos.some(p => p.itemId === gone.itemId && p.status === "saved")) items[gone.itemId] = false;
        return { ...job, checklist: { ...job.checklist, photos, items, savedAt: now(d) } };
      });
    case "CL_RETRY_FAILED": // only the failed photos go back in the queue
      return updateJob(d, action.jobId, job => ({ ...job, checklist: { ...job.checklist, photos: job.checklist.photos.map(p => (p.status === "failed" ? { ...p, status: "queued", progress: 0, willFail: false } : p)) } }));
    case "CL_PHOTO_STATUS": {
      return updateJob(d, action.jobId, job => {
        const photos = job.checklist.photos.map(p => (p.id === action.photoId ? { ...p, status: action.status, progress: action.progress ?? p.progress } : p));
        const items = { ...job.checklist.items };
        const photo = photos.find(p => p.id === action.photoId);
        if (action.status === "saved" && photo) items[photo.itemId] = true;
        return { ...job, checklist: { ...job.checklist, photos, items } };
      });
    }
    case "CL_SUBMIT":
      return notify(updateJob(d, action.jobId, job => ({ ...job, checklist: { ...job.checklist, state: "submitted", submittedAt: now(d), workDone: true, notes: action.note || job.checklist.notes, missingNote: action.missingNote || "" },
        activity: logged(job, d, "act.submitted", { name: action.cleanerName }) })), { category: "checklistReceived", bodyKey: "nb.checklist", jobId: action.jobId, titleKey: "n.checklist", params: { name: action.cleanerName, property: prop(action.jobId).name } });
    case "CREATE_JOB": {
      const id = action.job.id || `j${String(d.jobs.length + 1).padStart(2, "0")}n`;
      const property = d.properties.find(p => p.id === action.job.propertyId);
      const tpl = d.templates[property.checklistTemplateId];
      const job = { id, offers: [], offerLink: null, offerConcept: null, issues: [], notes: "", cleanerIds: [], ack: null, status: "UNASSIGNED", durationMin: 180,
        guestOut: null, guestIn: null, checklist: { state: "none", items: {}, photos: [], link: "none", templateVersion: tpl.version }, createdBy: "manager", proposal: action.job.comp?.mode === "hourly",
        activity: [{ at: now(d), key: "act.created", params: {} }], ...action.job };
      return { ...d, jobs: [...d.jobs, job], lastCreatedId: id };
    }
    case "TEMPLATE_SAVE": {
      const tpl = d.templates[action.templateId];
      const next = { ...tpl, version: tpl.version + 1, sections: action.sections, history: [...tpl.history, { version: tpl.version + 1, note: "edited", at: now(d) }] };
      return { ...d, templates: { ...d.templates, [tpl.id]: next }, properties: d.properties.map(p => (p.checklistTemplateId === tpl.id ? { ...p, templateVersion: next.version } : p)) };
    }
    case "HUB_DEVICE":
      return { ...data, deviceHealth: data.deviceHealth.map(x => (x.id === action.id ? { ...x, ...action.patch } : x)) };
    case "HUB_TEST": // result: "confirmed" only when the person/device confirmed display
      return { ...d, deviceHealth: d.deviceHealth.map(x => (x.id === action.id ? { ...x, lastTest: { result: action.result, at: now(d) }, ...(action.result === "confirmed" ? { lastConfirmed: now(d) } : {}) } : x)) };
    case "HUB_COVERAGE":
      return { ...data, hub: { ...data.hub, coverage: { ...data.hub.coverage, status: action.status, pending: action.status === "pending" ? 3 : action.status === "partial" ? 5 : 0 } } };
    case "HUB_MOVE_JOB": { // manager moves a job; each assigned cleaner gets a change + inbox event
      const job = d.jobs.find(j => j.id === action.jobId);
      if (!job) return data;
      let next = updateJob(d, job.id, j => ({ ...j, date: action.date, start: action.start ?? j.start, activity: logged(j, d, "act.moved", { date: action.date }) }));
      for (const c of job.cleanerIds) {
        next = { ...next, hub: { ...next.hub, changes: [...next.hub.changes, changeOf(d, c, "moved", job, { from: { date: job.date, start: job.start }, to: { date: action.date, start: action.start ?? job.start } })] } };
        next = notifyCleaner(next, c, { category: "cleanerMoved", jobId: job.id, titleKey: "cn.moved", bodyKey: "cnb.moved", params: { property: prop(job.id).name } });
      }
      return next;
    }
    case "HUB_REVOKE": { // assignment removed: leaves the cleaner's active schedule; she never sees who replaces her
      const job = d.jobs.find(j => j.id === action.jobId);
      if (!job || !job.cleanerIds.includes(action.cleanerId)) return data;
      let next = updateJob(d, job.id, j => { const ids = j.cleanerIds.filter(c => c !== action.cleanerId); return { ...j, cleanerIds: ids, status: ids.length ? j.status : "UNASSIGNED", ack: ids.length ? j.ack : null, activity: logged(j, d, "act.revoked", {}) }; });
      next = { ...next, hub: { ...next.hub, changes: [...next.hub.changes, changeOf(d, action.cleanerId, "removed", job, { from: { date: job.date, start: job.start } })] } };
      return notifyCleaner(next, action.cleanerId, { category: "cleanerRemoved", jobId: null, titleKey: "cn.removed", bodyKey: "cnb.removed", params: { property: prop(job.id).name, date: job.date } });
    }
    case "HUB_EVENT": // a business event for a cleaner whose push may not arrive
      return notifyCleaner(d, action.cleanerId, { category: action.category, jobId: action.jobId, titleKey: action.titleKey, bodyKey: action.bodyKey, params: { property: prop(action.jobId).name }, ...(action.delivery ? { delivery: action.delivery } : {}) });
    case "REQUEST_DECIDE": // recorded only; nothing is committed to clients or cleaners automatically
      return { ...data, requests: data.requests.map(r => (r.id === action.id ? { ...r, status: action.status, decidedAt: now(d) } : r)) };
    case "NOTIF_READ":
      return { ...data, notifications: data.notifications.map(n => (n.id === action.id ? { ...n, read: true } : n)) };
    case "NOTIF_READ_ALL":
      return { ...data, notifications: data.notifications.map(n => ({ ...n, read: true })) };
    case "NOTIF_UNREAD":
      return { ...data, notifications: data.notifications.map(n => (n.id === action.id ? { ...n, read: false } : n)) };
    case "NOTIF_PUSH_SIM": { // a new push arrives and is displayed as a banner
      const sample = action.sample;
      return notify(d, { ...sample, id: action.id, bodyKey: sample.bodyKey || bodyKeyFor[sample.category], params: { ...sample.params, property: prop(sample.jobId).name },
        delivery: { targets: 2, accepted: true, displayed: "confirmed", openedAt: null, openTracked: true } });
    }
    case "NOTIF_OPENED": // tapped from the push banner: opened, but NOT read
      return { ...d, notifications: d.notifications.map(n => (n.id === action.id ? { ...n, tappedBeforeRead: !n.read, delivery: { ...n.delivery, openedAt: now(d) } } : n)) };
    case "NOTIF_PREF":
      return { ...data, notificationSettings: { ...data.notificationSettings, prefs: { ...data.notificationSettings.prefs, [action.category]: action.value } } };
    case "NOTIF_PERMISSION":
      return { ...data, notificationSettings: { ...data.notificationSettings, permission: action.permission } };
    default:
      return data;
  }
}

function reducer(state, action) {
  if (action.type === "UI") return { ...state, ui: { ...state.ui, ...action.patch } };
  if (action.type === "RESET") return initialState();
  const data = domainReducer(state.data, action);
  return data === state.data ? state : { ...state, data, ui: action.toast ? { ...state.ui, toast: { ...action.toast, id: Date.now() } } : state.ui };
}

const StoreContext = createContext(null);

export function StoreProvider({ children, initial }) {
  const [state, dispatch] = useReducer(reducer, initial, init => init || load());
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* demo state is optional */ }
  }, [state]);
  const api = useMemo(() => ({
    state, data: state.data, ui: state.ui, dispatch,
    setUi: patch => dispatch({ type: "UI", patch }),
    act: (type, payload, toast) => dispatch({ type, ...payload, toast }),
    reset: () => dispatch({ type: "RESET" }),
  }), [state]);
  return createElement(StoreContext.Provider, { value: api }, children);
}

export function useStore() { return useContext(StoreContext); }

export { checklistItems };

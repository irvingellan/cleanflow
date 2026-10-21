import { createContext, createElement, useContext, useEffect, useMemo, useReducer } from "react";
import { buildDemoState, checklistItems } from "./demoData.js";
import { laDateKey, rangeFor } from "./time.js";

// One synthetic, presentation-independent state for all four layouts.
// Switching layout only changes `ui.mode`; operational truth lives in `data`.

const STORAGE_KEY = "cleanflow-manager-workspace-v3-demo";
const SCHEMA = 3;

export function initialState(today = laDateKey()) {
  return {
    schema: SCHEMA,
    data: buildDemoState(today),
    ui: {
      mode: "hybrid", hybridScreen: "now", range: rangeFor("today", today, today), filter: "needsYou", search: "",
      selectedJobId: null, overlay: null, cleanerView: null, mobileTab: "home", toast: null, lang: "pt", theme: null,
      notificationFilter: "all", inboxDemoState: "ready", offerConcept: "details",
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
  return { ...data, notifications: [{ id: `n${Date.now()}${Math.random().toString(16).slice(2, 5)}`, at: now(data), read: false, delivery: { accepted: true, displayed: "unknown", openedAt: null }, simulated: true, ...notification }, ...data.notifications] };
}

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
      return notify(next, { type: "offer", jobId: job.id, titleKey: action.response === "interested" ? "n.offerInterest" : "n.offerDeclined", params: { name: action.cleanerName, property: prop(job.id).name } });
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
        activity: logged(job, d, "act.submitted", { name: action.cleanerName }) })), { type: "checklist", jobId: action.jobId, titleKey: "n.checklist", params: { name: action.cleanerName, property: prop(action.jobId).name } });
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
    case "NOTIF_READ":
      return { ...data, notifications: data.notifications.map(n => (n.id === action.id ? { ...n, read: true } : n)) };
    case "NOTIF_READ_ALL":
      return { ...data, notifications: data.notifications.map(n => ({ ...n, read: true })) };
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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDate, formatServiceTime, removedServiceLabel } from "../../lib/presentation.js";
import { FIRST_ACCEPT_WINS } from "../jobs/automaticOffers.js";
import { serviceTypeLabel, serviceTypeMessage } from "../jobs/serviceTypeMessages.js";
import { HubIcon } from "./HubIcon.jsx";
import { NotificationInbox, NotificationInboxBadge, useNotificationInbox } from "../notifications/NotificationInbox.jsx";
import { inboxMessage } from "../notifications/notificationInboxMessages.js";
import { notificationInboxEnabled } from "../notifications/notificationInboxMode.js";
import { useCleanerNotificationSettings } from "../notifications/useCleanerNotificationSettings.js";
import { cleanerMessagingWorkerPath, cleanerPushOpenInboxEvent } from "../notifications/cleanerPushBinding.js";
import { InstallGuide } from "./InstallGuide.jsx";
import {
  addDaysToKey,
  agendaMonths,
  assignedStatusKey,
  checklistSituation,
  entriesInMonth,
  findAgendaEntry,
  formatAccessCodeInput,
  localDateKey,
  normalizeAccessCodeInput,
  normalizeJobAccess,
} from "./cleanerAgendaModel.js";
import { detectHubLanguage, hubLanguages, hubOfferPay, hubTranslate } from "./cleanerHubMessages.js";
import { AvailabilityPanel } from "../availability/AvailabilityPanel.jsx";
import { availabilityMessage } from "../availability/availabilityMessages.js";
import { RescheduleResponse } from "./RescheduleResponse.jsx";
import { useCleanerHub } from "./useCleanerHub.js";
import "./cleanerHub.css";

// Cleaner Hub V1 — "Minha agenda", connected to real CleanFlow Assignments.
// Visual structure and classes come from the approved Cleaner Hub V1 prototype.

const TABS = [["agenda", "calendar"], ["offers", "send"], ["account", "user"]];
const languageNames = { pt: "Português", en: "English", es: "Español" };
const languageStorageKey = "cleanflow.cleanerHub.language";
const themeStorageKey = "cleanflow.cleanerHub.theme";
const themeChoices = ["light", "dark", "auto"];
const onboardingStorageKey = "cleanflow.cleanerHub.onboarded";

function readStorage(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* per-device convenience only */ }
}

export function detectPlatform(userAgent = navigator.userAgent, touchPoints = navigator.maxTouchPoints || 0) {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "other";
}

export function detectDisplayMode() {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true) return "standalone";
    return window.matchMedia ? "browser" : "unknown";
  } catch {
    return "unknown";
  }
}

function useTranslator(preferred) {
  const [lang, setLang] = useState(() => detectHubLanguage(readStorage(languageStorageKey) || preferred));
  useEffect(() => {
    if (!readStorage(languageStorageKey) && preferred) setLang(detectHubLanguage(preferred));
  }, [preferred]);
  const t = useMemo(() => {
    const translate = (key, params) => hubTranslate(lang, key, params);
    translate.lang = lang;
    translate.locale = { pt: "pt-BR", en: "en-US", es: "es-US" }[lang];
    translate.time = (value) => formatServiceTime(value, lang);
    translate.clock = (date) => date ? new Intl.DateTimeFormat(translate.locale, { hour: "numeric", minute: "2-digit" }).format(date) : hubTranslate(lang, "hb.fresh.never");
    return translate;
  }, [lang]);
  const choose = (next) => { writeStorage(languageStorageKey, next); setLang(next); };
  return [t, choose];
}

export function normalizeHubTheme(value) {
  return themeChoices.includes(value) ? value : "light";
}

function useHubTheme() {
  const [preference, setPreference] = useState(() => normalizeHubTheme(readStorage(themeStorageKey)));
  const [media] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)"));
  const [systemDark, setSystemDark] = useState(() => Boolean(media?.matches));
  useEffect(() => {
    if (!media) return undefined;
    const update = (event) => setSystemDark(event.matches);
    media.addEventListener?.("change", update);
    update(media);
    return () => media.removeEventListener?.("change", update);
  }, [media]);
  const choose = (value) => {
    writeStorage(themeStorageKey, value);
    setPreference(value);
  };
  const theme = preference === "auto" ? (systemDark ? "dark" : "light") : preference;
  return { theme, preference, choose };
}

function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);
  useEffect(() => {
    const capture = (event) => { event.preventDefault(); setPromptEvent(event); };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);
  return promptEvent;
}

function dayLabel(t, dateKey, today) {
  if (!dateKey) return t("hb.dateNotSet");
  if (dateKey === today) return t("hb.day.today");
  if (dateKey === addDaysToKey(today, 1)) return t("hb.day.tomorrow");
  if (dateKey === addDaysToKey(today, -1)) return t("hb.day.yesterday");
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(t.locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date(year, month - 1, day, 12));
}

/* ---------- small pieces ---------- */

function FreshnessBanner({ t, freshness, onRetry, online = true }) {
  if (freshness.state === "live") {
    return (
      <div className="hb-coverage is-verified">
        <HubIcon name="checkCircle" size={16} />
        <span><strong>{t("hb.fresh.live")}</strong><span>{t("hb.fresh.live.body")}</span></span>
      </div>
    );
  }
  if (freshness.state === "loading") {
    return <div className="hb-coverage is-unknown" role="status"><HubIcon name="refresh" size={16} /><span><strong>{t("hb.fresh.loading")}</strong></span></div>;
  }
  if (freshness.state === "error") {
    return (
      <div className="hb-coverage is-partial" role="alert">
        <HubIcon name="alert" size={16} />
        <span>
          <strong>{t("hb.fresh.stale")}</strong>
          <span>{t(online ? "hb.fresh.error" : "hb.fresh.offline")}</span>
          {online && onRetry && <button type="button" className="mw-linkbtn" onClick={() => onRetry()}>{t("hb.fresh.retry")}</button>}
        </span>
      </div>
    );
  }
  return (
    <div className="hb-coverage is-partial" role="status">
      <HubIcon name="alert" size={16} />
      <span><strong>{t("hb.fresh.stale")}</strong><span>{t(`hb.fresh.stale.${freshness.reason || "error"}`, { time: t.clock(freshness.lastVerifiedAt) })}</span></span>
    </div>
  );
}

function offerStatusKey(entry) {
  return entry.offerDistributionMode === FIRST_ACCEPT_WINS && entry.offerStatus === "PENDING"
    ? "hb.offer.autoPending"
    : `hb.offer.${entry.offerStatus}`;
}

function monthLabel(t, month) {
  if (!month) return t("hb.dateNotSet");
  const [year, number] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat(t.locale, { month: "long", year: "numeric" }).format(new Date(year, number - 1, 15, 12));
  return label.charAt(0).toLocaleUpperCase(t.locale) + label.slice(1);
}

const checklistChipStates = ["available", "started", "submitted"];

function AgendaResponse({ t, entry, onAnswer, propertyName }) {
  if (entry.kind !== "ASSIGNED" || !entry.reschedule) return null;
  return <RescheduleResponse key={entry.reschedule.scheduleRevision} language={t.lang}
    propertyName={propertyName} reschedule={entry.reschedule} disabled={entry.rescheduleBusy}
    onAnswer={onAnswer && (decision => onAnswer(entry, decision))} />;
}

function ScheduleFeedback({ t, feedback }) {
  const status = useRef(null);
  useLayoutEffect(() => {
    if (feedback && document.activeElement === document.body) status.current?.focus({ preventScroll: true });
  }, [feedback]);
  if (!feedback) return null;
  const key = { CONFIRMED: "inbox.reschedule.confirmed", DECLINED: "inbox.reschedule.declined",
    stale: "inbox.reschedule.stale", error: "inbox.actionError" }[feedback.state];
  return <p className="hb-schedule-feedback" ref={status} tabIndex={-1} role={["stale", "error"].includes(feedback.state) ? "alert" : "status"}>
    {feedback.propertyName && <strong>{feedback.propertyName} · </strong>}{inboxMessage(t.lang, key)}
  </p>;
}

function JobCard({ t, entry, onOpen, onAnswer }) {
  const offer = entry.kind === "OFFER";
  const taken = offer && entry.offerStatus === "ALREADY_TAKEN";
  const checklist = offer ? null : checklistSituation(entry);
  const service = !taken && (!offer || entry.serviceType) ? serviceTypeLabel(t.lang, entry.serviceType) : null;
  const address = !taken && entry.address;
  const place = address || entry.propertyName;
  const amount = !taken && hubOfferPay(entry, t.lang);
  return (
    <li>
      <button type="button" className="hb-job" onClick={() => onOpen(entry)} data-job-id={entry.jobId}>
        <span className="hb-job-main">
          <strong>{service || place || t("hb.st.offer")}</strong>
          {service && place && <span className="hb-job-line"><HubIcon name="pin" size={15} />{place}</span>}
          <span className="hb-job-line tnum">
            <HubIcon name="calendar" size={15} />
            {entry.scheduledDate ? formatDate(entry.scheduledDate, null, t.lang) : t("hb.dateNotSet")}
            {" · "}{t.time(entry.scheduledStart) || t("hb.timeNotSet")}
          </span>
          {address && entry.propertyName && address !== entry.propertyName && <span className="hb-job-property">{entry.propertyName}</span>}
          <span className="hb-job-meta">
            {amount && <strong>{amount}</strong>}
            <span>{t(offer ? offerStatusKey(entry) : `hb.st.${assignedStatusKey(entry)}`)}</span>
            {checklist && entry.jobStatus !== "COMPLETED" && checklistChipStates.includes(checklist.state) && (
              <span data-checklist-state={checklist.state}>{t(`hb.clst.${checklist.state}.chip`)}</span>
            )}
          </span>
        </span>
        <HubIcon name="arrowR" size={16} />
      </button>
      {onAnswer && <AgendaResponse t={t} entry={entry} onAnswer={onAnswer} />}
    </li>
  );
}

function DayGroups({ t, entries, today, onOpen, onAnswer }) {
  const days = [...new Set(entries.map((entry) => entry.scheduledDate || ""))];
  return days.map((day) => (
    <section key={day || "none"} className="hb-day" aria-label={dayLabel(t, day, today)}>
      <h3 className="mw-micro">{dayLabel(t, day, today)}</h3>
      <ul className="hb-jobs">
        {entries.filter((entry) => (entry.scheduledDate || "") === day).map((entry) => <JobCard key={entry.id} t={t} entry={entry} onOpen={onOpen} onAnswer={onAnswer} />)}
      </ul>
    </section>
  ));
}

/**
 * "Agendadas": every future confirmed Job the server sent, never a fixed
 * number. "Todas" lists all of them grouped by month; "Por mês" steps through
 * the months that have work. The count is the loaded list, so when the
 * schedule is not confirmed right now the summary says it may be incomplete.
 */
function Scheduled({ t, entries, today, live, onOpen, onAnswer, navigation, setNavigation }) {
  const months = agendaMonths(entries);
  const { mode, month } = navigation;
  const setMode = (mode) => setNavigation((current) => ({ ...current, mode }));
  const setMonth = (month) => setNavigation((current) => ({ ...current, month }));
  const current = months.includes(month) ? month : months[0] ?? "";
  useEffect(() => {
    if (month !== current) setNavigation((previous) => ({ ...previous, month: current }));
  }, [current, month, setNavigation]);
  const position = months.indexOf(current);
  const summary = (
    <p className="hb-sched-sum" data-testid="scheduled-summary">
      {t("hb.sched.summary", { count: entries.length })}
      {!live && <span className="hb-sched-partial"> {t("hb.sched.partial")}</span>}
    </p>
  );
  if (!entries.length) {
    return (
      <>
        {summary}
        <div className={`hb-empty${live ? "" : " is-uncertain"}`}>
          <HubIcon name={live ? "checkCircle" : "info"} size={22} />
          <p>{t(live ? "hb.empty.scheduled" : "hb.empty.notDefinitive")}</p>
        </div>
      </>
    );
  }
  return (
    <div className="hb-sched">
      {summary}
      <div className="hb-sched-modes" role="group" aria-label={t("hb.sched.modes")}>
        {["all", "month"].map((key) => (
          <button key={key} type="button" className="hb-chipbtn" aria-pressed={mode === key} onClick={() => setMode(key)} data-sched-mode={key}>{t(`hb.sched.${key}`)}</button>
        ))}
      </div>
      {mode === "month" ? (
        <>
          <div className="hb-monthnav" data-testid="month-nav">
            <button type="button" className="hb-iconbtn" disabled={position <= 0} onClick={() => setMonth(months[position - 1])} aria-label={t("hb.sched.prevMonth")}><HubIcon name="arrowL" size={18} /></button>
            <strong aria-live="polite">{monthLabel(t, current)} <span className="mw-sec tnum">· {t("hb.sched.inMonth", { count: entriesInMonth(entries, current).length })}</span></strong>
            <button type="button" className="hb-iconbtn" disabled={position >= months.length - 1} onClick={() => setMonth(months[position + 1])} aria-label={t("hb.sched.nextMonth")}><HubIcon name="arrowR" size={18} /></button>
          </div>
          <p className="mw-hint">{t("hb.sched.monthOf", { n: position + 1, total: months.length })}</p>
          <DayGroups t={t} entries={entriesInMonth(entries, current)} today={today} onOpen={onOpen} onAnswer={onAnswer} />
        </>
      ) : months.map((key) => (
        <section key={key || "none"} className="hb-month" aria-label={monthLabel(t, key)}>
          <h3 className="hb-month-title">{monthLabel(t, key)} <span className="mw-sec tnum">· {entriesInMonth(entries, key).length}</span></h3>
          <DayGroups t={t} entries={entriesInMonth(entries, key)} today={today} onOpen={onOpen} onAnswer={onAnswer} />
        </section>
      ))}
    </div>
  );
}

/* ---------- screens ---------- */

function Agenda({ t, hub, name, segment, setSegment, go, today, scheduledNavigation, setScheduledNavigation }) {
  const { schedule, freshness } = hub;
  const list = segment === "today" ? schedule.today : segment === "upcoming" ? schedule.upcoming : schedule.completed;
  const pendingOffers = schedule.offers.filter((entry) => entry.offerStatus === "PENDING").length;
  const openJobs = [...schedule.today, ...schedule.upcoming];
  const pendingChanges = openJobs.filter(entry => entry.reschedule?.state === "PENDING");
  const pendingChecklists = openJobs.filter((entry) => checklistSituation(entry).pending);
  return (
    <div className="hb-screen">
      <header className="hb-hello">
        <h2>{name ? t("hb.hello", { name }) : t("hb.helloNoName")}</h2>
        <p className="mw-sec">{t("hb.helloSub", { count: schedule.openCount })}</p>
      </header>
      <ScheduleFeedback t={t} feedback={hub.scheduleFeedback} />
      {pendingChanges.map(entry => (
        <section key={entry.jobId} data-reschedule-banner={entry.jobId}
          aria-label={[inboxMessage(t.lang, "inbox.reschedule.title"), entry.propertyName].filter(Boolean).join(" · ")}>
          <AgendaResponse t={t} entry={entry} propertyName={entry.propertyName} onAnswer={hub.answerReschedule} />
        </section>
      ))}
      <FreshnessBanner t={t} freshness={freshness} onRetry={hub.retryStartup} online={hub.online} />
      {pendingChecklists.length > 0 && (
        <section className="hb-clnotice" aria-label={t("hb.clpending.title", { count: pendingChecklists.length })} data-testid="checklist-pending">
          <HubIcon name="clipCheck" size={18} />
          <div className="mw-grow">
            <strong>{t("hb.clpending.title", { count: pendingChecklists.length })}</strong>
            <ul>
              {pendingChecklists.slice(0, 3).map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="mw-linkbtn" onClick={() => go({ type: "job", jobId: entry.jobId })}>
                    {entry.propertyName || "—"} · {dayLabel(t, entry.scheduledDate, today)} · {t(`hb.clst.${checklistSituation(entry).state}.chip`)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <div className="cfv2-segmented mw-seg-control hb-seg" role="group" aria-label={t("hb.view")}>
        {[["today", schedule.today.length], ["upcoming", schedule.upcoming.length], ["completed", schedule.completed.length]].map(([key, count]) => (
          <button key={key} type="button" aria-pressed={segment === key} onClick={() => setSegment(key)} aria-label={t(`hb.seg.${key}.aria`, { count })}>
            {t(`hb.seg.${key}`)} <span className="tnum hb-count">{count}</span>
          </button>
        ))}
      </div>
      {segment === "upcoming"
        ? <Scheduled t={t} entries={list} today={today} onAnswer={hub.answerReschedule} live={freshness.state === "live"} onOpen={(entry) => go({ type: "job", jobId: entry.jobId })} navigation={scheduledNavigation} setNavigation={setScheduledNavigation} />
        : list.length
          ? <DayGroups t={t} entries={list} today={today} onAnswer={hub.answerReschedule} onOpen={(entry) => go({ type: "job", jobId: entry.jobId })} />
          : (
            <div className={`hb-empty${freshness.state === "live" ? "" : " is-uncertain"}`}>
              <HubIcon name={freshness.state === "live" ? "checkCircle" : "info"} size={22} />
              <p>{t(segment === "completed" ? "hb.empty.completed" : freshness.state === "live" ? "hb.empty.live" : "hb.empty.notDefinitive")}</p>
            </div>
          )}
      {pendingOffers > 0 && segment !== "completed" && (
        <button type="button" className="hb-offerlink" onClick={() => go({ type: "tab", tab: "offers" })}>
          <HubIcon name="send" size={16} />{t("hb.offersWaiting", { count: pendingOffers })}<HubIcon name="arrowR" size={14} />
        </button>
      )}
    </div>
  );
}

const accessIcons = { door: "lock", gate: "lock", lockbox: "lock", parking: "pin", wifi: "info", alarm: "alert", note: "info" };

/**
 * FB01 — practical information. Loaded on demand through the optional
 * `hub.loadJobAccess(jobId)` server read; the screen never derives access
 * data from the agenda projection, the property name or local storage, and
 * keeps nothing after leaving the Job. Without that read it says where the
 * information still comes from.
 */
export function AccessSection({ t, hub, entry }) {
  const supported = typeof hub.loadJobAccess === "function";
  const open = ["ASSIGNED", "IN_PROGRESS"].includes(entry.jobStatus);
  const scope = [hub.session?.uid, hub.session?.organizationId, hub.session?.cleanerId, hub.session?.sessionId, entry.jobId].join(":");
  const [access, setAccess] = useState(() => ({ scope, state: supported && open ? "loading" : supported ? "closed" : "unsupported" }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setAccess({ scope, state: !supported ? "unsupported" : !open ? "closed" : "loading" });
    if (!supported || !open) return undefined;
    let current = true;
    hub.loadJobAccess(entry.jobId)
      .then((result) => { if (current) setAccess({ ...normalizeJobAccess(result), scope }); })
      .catch(() => { if (current) setAccess({ state: "error", scope }); });
    return () => { current = false; };
  }, [supported, open, hub.loadJobAccess, entry.jobId, scope, attempt]);

  // Never render a previous Job/session or a closed Job's data, including the
  // render before the effect clears that state. Release A keeps this read off.
  const state = !supported ? "unsupported" : !open ? "closed" : access.scope !== scope ? "loading" : access.state;
  return (
    <section className="hb-access" aria-labelledby="hb-access-title" data-access-state={state}>
      <h3 id="hb-access-title"><HubIcon name="lock" size={16} />{t("hb.access.title")}</h3>
      {state === "loading" && <p className="mw-hint" role="status">{t("hb.access.loading")}</p>}
      {state === "available" && (
        <>
          {access.address && <p className="hb-access-address"><HubIcon name="pin" size={15} /><span>{access.address}</span></p>}
          {access.items.length > 0 && (
            <dl className="hb-access-items">
              {access.items.map((item, index) => (
                <div key={`${item.kind}-${index}`}>
                  <dt><HubIcon name={accessIcons[item.kind] || "info"} size={14} />{item.label || t(`hb.access.kind.${item.kind}`)}</dt>
                  <dd className={item.kind === "note" ? "" : "tnum"}>{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {access.instructions && (
            <details className="hb-house">
              <summary>{t("hb.access.house")}</summary>
              <p>{access.instructions}</p>
            </details>
          )}
          <p className="mw-hint">{t("hb.access.private")}</p>
        </>
      )}
      {["not-provided", "not-yet", "revoked", "denied", "closed", "unsupported", "error"].includes(state) && (
        <div className={`hb-access-note${state === "revoked" || state === "denied" ? " is-blocked" : ""}`} role={state === "error" ? "alert" : undefined}>
          <p>{t(`hb.access.${state}`, { time: access.availableFromMs ? new Intl.DateTimeFormat(t.locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(access.availableFromMs)) : "" })}</p>
          {state === "error" && <button type="button" className="mw-linkbtn" onClick={() => setAttempt((value) => value + 1)}>{t("hb.access.retry")}</button>}
        </div>
      )}
    </section>
  );
}

const checklistActionStates = {
  none: "hb.job.openChecklist",
  unknown: "hb.job.openChecklist",
  available: "hb.clst.available.action",
  started: "hb.clst.started.action",
};

function JobInstructions({ t, notes }) {
  if (!notes) return null;
  return (
    <section className="hb-instructions" aria-labelledby="hb-instructions-title">
      <h3 id="hb-instructions-title">{t("hb.job.instructions")}</h3>
      <p>{notes}</p>
    </section>
  );
}

function RemovedService({ t, label, message }) {
  const status = useRef(null);
  useLayoutEffect(() => {
    if (message && document.activeElement === document.body) status.current?.focus({ preventScroll: true });
  }, [message]);
  return (
    <div className="hb-screen">
      <div className="hb-empty is-uncertain" role="status" ref={status} tabIndex={-1}>
        <HubIcon name="userX" size={22} />
        <p>{message || (label ? inboxMessage(t.lang, "inbox.event.UNASSIGNED") : t("hb.job.notYours"))}</p>
        {label && <strong>{label}</strong>}
      </div>
    </div>
  );
}

function AgendaDetail({ t, hub, view, today }) {
  const entry = findAgendaEntry(hub.entries, view.jobId);
  const { kind, propertyName, scheduledDate, scheduledStart } = entry || {};
  // This view is keyed by Job and authenticated session. Keep only the identity
  // already shown so a live removal cannot retain notes, pay or access details.
  const [lastSeen, setLastSeen] = useState(null);
  useLayoutEffect(() => {
    if (kind && (view.type !== "job" || kind === "ASSIGNED")) {
      setLastSeen({ kind, propertyName, scheduledDate, scheduledStart });
    }
  }, [view.type, kind, propertyName, scheduledDate, scheduledStart]);
  const removedLabel = !entry || (view.type === "job" && kind !== "ASSIGNED")
    ? removedServiceLabel(lastSeen, t.lang) : "";
  if (view.type === "job" || kind === "ASSIGNED" || (!entry && (lastSeen?.kind === "ASSIGNED" || !view.wasAutomatic))) {
    return <JobView t={t} hub={hub} entry={entry} jobId={view.jobId} today={today} removedLabel={removedLabel} />;
  }
  return <OfferView t={t} hub={hub} entry={entry} today={today} removedLabel={removedLabel} />;
}

function JobView({ t, hub, entry, jobId, today, removedLabel }) {
  const [checklist, setChecklist] = useState({ state: "idle" });
  const checklistAttempt = useRef(0);
  const canTryChecklist = entry?.kind === "ASSIGNED" && ["ASSIGNED", "IN_PROGRESS"].includes(entry.jobStatus);
  useEffect(() => {
    setChecklist({ state: "idle" });
    return () => { checklistAttempt.current += 1; };
  }, [jobId, canTryChecklist]);
  if (!entry || entry.kind !== "ASSIGNED") {
    const declined = hub.scheduleFeedback?.jobId === jobId && hub.scheduleFeedback.state === "DECLINED";
    return <RemovedService t={t} label={removedLabel} message={declined ? inboxMessage(t.lang, "inbox.reschedule.declined") : null} />;
  }
  const status = assignedStatusKey(entry);
  const situation = checklistSituation(entry);
  const actionKey = checklistActionStates[situation.state];
  const hasRunStatus = situation.state !== "none" && situation.state !== "unknown";

  async function openChecklist() {
    const attempt = ++checklistAttempt.current;
    setChecklist({ state: "opening" });
    try {
      const result = await hub.openChecklist(entry.jobId);
      if (attempt !== checklistAttempt.current) return;
      if (result?.state === "ready" && result.token) {
        window.location.assign(`/checklist?t=${encodeURIComponent(result.token)}`);
        return;
      }
      setChecklist({ state: result?.state || "unavailable" });
    } catch {
      if (attempt !== checklistAttempt.current) return;
      setChecklist({ state: "error" });
    }
  }

  return (
    <div className="hb-screen">
      <div className="hb-jobhead">
        <span className={`hb-status is-${status}`}>{t(`hb.st.${status}`)}</span>
        <h2>{entry.propertyName || "—"}</h2>
      </div>
      {hub.scheduleFeedback?.jobId === jobId && ["error", "stale"].includes(hub.scheduleFeedback.state) && <ScheduleFeedback t={t} feedback={hub.scheduleFeedback} />}
      <AgendaResponse t={t} entry={entry} onAnswer={hub.answerReschedule} />
      <dl className="hb-facts">
        <div><dt><HubIcon name="calendar" size={15} />{t("hb.job.when")}</dt><dd>{`${dayLabel(t, entry.scheduledDate, today)} · ${t.time(entry.scheduledStart) || t("hb.timeNotSet")}`}</dd></div>
        <div><dt><HubIcon name="pin" size={15} />{t(entry.address ? "hb.job.address" : "hb.job.where")}</dt><dd>{entry.address || entry.propertyName || "—"}</dd></div>
        <div><dt><HubIcon name="clipboard" size={15} />{serviceTypeMessage(t.lang, "field")}</dt><dd>{serviceTypeLabel(t.lang, entry.serviceType)}</dd></div>
        <div><dt><HubIcon name="dollar" size={15} />{t("hb.job.agreedPay")}</dt><dd>{hubOfferPay(entry, t.lang) || t("hb.job.payNotSet")}</dd></div>
      </dl>
      <JobInstructions t={t} notes={entry.notes} />
      <section className={`hb-checkcard is-${situation.state}`} data-checklist-state={situation.state} aria-labelledby="hb-checklist-title">
        <div className="hb-checkhead">
          <h3 id="hb-checklist-title">{t("hb.job.checklist")}</h3>
          {hasRunStatus && <span className={`hb-clchip is-${situation.state}`}>{t(`hb.clst.${situation.state}.chip`)}</span>}
        </div>
        {canTryChecklist ? (
          <>
            {hasRunStatus && <p className="mw-sec">{t(`hb.clst.${situation.state}.body`)}</p>}
            {actionKey && (
              <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={openChecklist} disabled={checklist.state === "opening"}>
                <HubIcon name="clipCheck" size={17} />{t(checklist.state === "opening" ? "hb.job.opening" : actionKey)}
              </button>
            )}
            {!["idle", "opening"].includes(checklist.state) && <p className="mw-hint" role="status">{t(`hb.cl.${checklist.state}`)}</p>}
          </>
        ) : <p className="mw-hint">{t(entry.jobStatus === "COMPLETED" ? "hb.job.checklistDone" : "hb.job.checklistLater")}</p>}
      </section>
      <AccessSection t={t} hub={hub} entry={entry} />
      {/* FB01: status and acknowledgment stay recorded; they are only moved out of the way. */}
      <details className="hb-record">
        <summary>{t("hb.job.record")}</summary>
        <dl className="hb-facts">
          <div><dt><HubIcon name="clipboard" size={15} />{t("hb.job.status")}</dt><dd>{t(`hb.st.${status}`)}</dd></div>
          <div><dt><HubIcon name="check" size={15} />{t("hb.job.ack")}</dt><dd>{t(entry.acknowledged ? "hb.job.ackYes" : "hb.job.ackNo")}</dd></div>
        </dl>
      </details>
      <p className="mw-hint"><HubIcon name="lock" size={14} /> {t("hb.job.privacy")}</p>
    </div>
  );
}

function OfferView({ t, hub, entry, today, removedLabel }) {
  const [reply, setReply] = useState("idle");
  const observedSchedule = entry?.scheduleRevision;
  useEffect(() => {
    setReply(previous => previous === "staleSchedule" ? "idle" : previous);
  }, [observedSchedule]);

  if (reply === "declined" || reply === "unavailable" || !entry) {
    const message = reply === "alreadyTaken" ? "hb.offer.ALREADY_TAKEN" : reply === "declined" ? "hb.offer.DECLINED" : "hb.offer.unavailable";
    return <RemovedService t={t} label={removedLabel || removedServiceLabel(entry, t.lang)} message={t(message)} />;
  }

  const automatic = entry.offerDistributionMode === FIRST_ACCEPT_WINS;
  const taken = entry.offerStatus === "ALREADY_TAKEN" || reply === "alreadyTaken";
  const canRespond = entry.offerStatus === "PENDING" && ["idle", "sending", "error"].includes(reply);
  const waitingForNetwork = automatic && hub.freshness.reason === "offline";

  async function answer(status) {
    setReply("sending");
    try {
      const revision = entry.scheduleRevision;
      const current = {
        ...(Number.isSafeInteger(revision) && revision > 0 ? { scheduleRevision: revision } : {}),
        ...(entry.replacementOfferId ? { offerId: entry.replacementOfferId } : {}),
      };
      const result = Object.keys(current).length
        ? await hub.respondToOffer(entry.jobId, status, current) : await hub.respondToOffer(entry.jobId, status);
      if (result?.state === "assigned" && result.status === "ACCEPTED" && status === "ACCEPTED") {
        setReply("assigned");
      } else if (result?.state === "already-taken") {
        setReply("alreadyTaken");
      } else if (result?.state === "stale-schedule") {
        setReply("staleSchedule");
      } else if (result?.state === "answered") {
        setReply(status === "DECLINED" ? "declined" : "sent");
      } else {
        setReply("unavailable");
      }
    } catch {
      setReply("error");
    }
  }

  const amount = hubOfferPay(entry, t.lang, true);
  const statusKey = taken ? "hb.offer.ALREADY_TAKEN" : reply === "assigned" ? "hb.offer.assigned" : offerStatusKey(entry);
  return (
    <div className="hb-screen">
      <div className="hb-jobhead">
        <span className="mw-micro">{t(reply === "assigned" && !taken ? "hb.st.confirmed" : "hb.st.offer")}</span>
        <h2>{entry.propertyName || "—"}</h2>
      </div>
      <dl className="hb-facts">
        {!taken && entry.serviceType && <div><dt><HubIcon name="clipboard" size={15} />{serviceTypeMessage(t.lang, "field")}</dt><dd>{serviceTypeLabel(t.lang, entry.serviceType)}</dd></div>}
        {!taken && entry.address && <div><dt><HubIcon name="pin" size={15} />{t("hb.job.address")}</dt><dd>{entry.address}</dd></div>}
        <div><dt><HubIcon name="calendar" size={15} />{t("hb.job.when")}</dt><dd>{`${dayLabel(t, entry.scheduledDate, today)} · ${t.time(entry.scheduledStart) || t("hb.timeNotSet")}`}</dd></div>
        {!taken && <div><dt><HubIcon name="dollar" size={15} />{t("hb.job.pay")}</dt><dd>{amount || t("hb.job.payNotSet")}</dd></div>}
        <div><dt><HubIcon name="clipboard" size={15} />{t("hb.job.status")}</dt><dd role={taken || reply === "assigned" ? "status" : undefined}>{t(statusKey)}</dd></div>
      </dl>
      {!taken && <JobInstructions t={t} notes={entry.notes} />}
      {canRespond && !taken && (
        <div className="hb-offer-actions">
          <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" disabled={reply === "sending" || waitingForNetwork} onClick={() => answer(automatic ? "ACCEPTED" : "INTERESTED")}>{t(reply === "sending" ? "hb.offer.sending" : automatic ? "hb.offer.accept" : "hb.offer.interested")}</button>
          <button type="button" className="cfv2-button cfv2-button-secondary mw-btn mw-btn-block" disabled={reply === "sending" || waitingForNetwork} onClick={() => answer("DECLINED")}>{t("hb.offer.decline")}</button>
        </div>
      )}
      {!taken && ["sent", "error"].includes(reply) && <p className="mw-hint" role="status">{t(`hb.offer.${reply}`)}</p>}
      {!taken && reply === "staleSchedule" && <p className="mw-hint" role="status">{inboxMessage(t.lang, "inbox.reschedule.stale")}</p>}
      {waitingForNetwork && <p className="mw-hint" role="status">{t("hb.offer.onlineRequired")}</p>}
      {!taken && reply !== "assigned" && <p className="mw-hint">{t(automatic ? "hb.offers.autoNote" : "hb.offers.note")}</p>}
    </div>
  );
}

function Offers({ t, hub, go }) {
  const { offers } = hub.schedule;
  return (
    <div className="hb-screen">
      <header className="hb-hello"><h2>{t("hb.offers.title")}</h2><p className="mw-sec">{t("hb.offers.sub")}</p></header>
      {!offers.length && <div className={`hb-empty${hub.freshness.state === "live" ? "" : " is-uncertain"}`}><HubIcon name="send" size={22} /><p>{t("hb.offers.empty")}</p></div>}
      <ul className="hb-jobs">
        {offers.map((entry) => <JobCard key={entry.id} t={t} entry={entry} onOpen={() => go({ type: "offer", jobId: entry.jobId, wasAutomatic: entry.offerDistributionMode === FIRST_ACCEPT_WINS })} />)}
      </ul>
      {offers.some((entry) => entry.offerDistributionMode !== FIRST_ACCEPT_WINS) && <p className="mw-hint">{t("hb.offers.note")}</p>}
    </div>
  );
}

export function CleanerPushSettings({ t, push, go }) {
  const { state } = push;
  const recoverable = ["permission-default", "missing", "invalidated", "worker-missing", "worker-mismatch", "error"].includes(state);
  return (
    <div className="hb-onb-note tone-info">
      <HubIcon name="bell" size={18} />
      <div>
        <strong>{t("hb.acc.notifications")}</strong>
        <p className="mw-hint" role="status">{t(`hb.push.${state}`)}</p>
        {notificationInboxEnabled() && <p className="mw-hint">{t("hb.push.inboxAlways")}</p>}
        {recoverable && push.canEnable !== false && <button type="button" className="cfv2-button cfv2-button-primary mw-btn" onClick={push.enable}>{t("hb.push.enable")}</button>}
        {state === "registered" && push.test && <>
          <button type="button" className="mw-linkbtn" onClick={push.test} disabled={push.testState === "sending"}>
            {t(push.testState === "sending" ? "hb.push.testSending" : "hb.push.test")}
          </button>
          {push.testState && push.testState !== "sending" && <p className="mw-hint" role="status">
            {t(`hb.push.test.${["sent", "not-delivered", "pending", "rate-limited", "daily-limit", "no-devices"].includes(push.testState) ? push.testState : "error"}`)
              .replace("{seconds}", String(push.testRetryAfterSeconds))}
          </p>}
        </>}
        {state === "ios-standalone-required" && <button type="button" className="mw-linkbtn" onClick={() => go({ type: "install" })}>{t("hb.acc.install")}</button>}
        {(["permission-denied", "offline", "superseded", "error", "pilot-ineligible", "pilot-check-required", "unavailable"].includes(state) || (recoverable && push.canEnable === false)) && <button type="button" className="mw-linkbtn" onClick={push.recheck}>{t("hb.push.recheck")}</button>}
      </div>
    </div>
  );
}

function Account({ t, name, setLang, appearance, go, onSignOut, signingOut, push, installed }) {
  return (
    <div className="hb-screen">
      <header className="hb-profile"><span className="mw-avatar is-large">{(name || "CF").slice(0, 2).toUpperCase()}</span><div><h2>{name || t("hb.helloNoName")}</h2><p className="mw-sec">{t("hb.acc.role")}</p></div></header>
      <ul className="hb-menu">
        <li><button type="button" onClick={() => go({ type: "availability" })}><HubIcon name="calendar" size={18} /><span className="mw-grow">{availabilityMessage(t.lang, "title")}</span><HubIcon name="arrowR" size={16} /></button></li>
        {!installed && <li><button type="button" onClick={() => go({ type: "install" })}><HubIcon name="phone" size={18} /><span className="mw-grow">{t("hb.acc.install")}</span><HubIcon name="arrowR" size={16} /></button></li>}
      </ul>
      <CleanerPushSettings t={t} push={push} go={go} />
      <div className="mw-setgroup">
        <h4>{t("hb.acc.language")}</h4>
        <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("hb.acc.language")}>
          {hubLanguages.map((id) => <button key={id} type="button" aria-pressed={t.lang === id} onClick={() => setLang(id)}>{languageNames[id]}</button>)}
        </div>
      </div>
      <div className="mw-setgroup">
        <h4>{t("hb.acc.appearance")}</h4>
        <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("hb.acc.appearance")}>
          {themeChoices.map((value) => (
            <button key={value} type="button" aria-pressed={appearance.preference === value} onClick={() => appearance.choose(value)}>
              {t(`hb.theme.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="cfv2-button cfv2-button-danger mw-btn mw-btn-block" onClick={onSignOut} disabled={signingOut}>{t(signingOut ? "hb.acc.signingOut" : "hb.acc.signOut")}</button>
      <p className="mw-hint">{t("hb.acc.signOutNote")}</p>
    </div>
  );
}

/* ---------- sign-in and first run ---------- */

function AccessCode({ t, onRedeem, platform, displayMode, installPrompt, initialCode }) {
  const [code, setCode] = useState(formatAccessCodeInput(initialCode));
  const [state, setState] = useState("idle");
  const iosTab = platform === "ios" && displayMode !== "standalone";
  const [guide, setGuide] = useState(false);
  const [iosAnyway, setIosAnyway] = useState(false);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [guide]);

  async function submit(event) {
    event.preventDefault();
    setState("checking");
    try {
      await onRedeem(normalizeAccessCodeInput(code));
    } catch (error) {
      setState(["functions/unavailable", "functions/internal", "functions/deadline-exceeded", "auth/network-request-failed"].includes(error?.code) ? "network" : "invalid");
    }
  }

  if (guide) {
    return <div className="hb-screen"><InstallGuide t={t} platform={platform} displayMode={displayMode} installPrompt={installPrompt} onSkip={() => setGuide(false)} /></div>;
  }
  return (
    <div className="hb-screen hb-onb">
      <h2 ref={heading} tabIndex={-1}>{t("hb.code.title")}</h2>
      <p className="hb-onb-body">{t("hb.code.body")}</p>
      {iosTab && !iosAnyway ? (
        <div className="hb-onb-note tone-attention">
          <HubIcon name="phone" size={18} />
          <div>
            <p>{t("hb.code.iosFirst")}</p>
            <div className="hb-onb-actions">
              <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={() => setGuide(true)}>{t("hb.code.iosGuide")}</button>
              <button type="button" className="mw-linkbtn" onClick={() => setIosAnyway(true)}>{t("hb.code.iosAnyway")}</button>
            </div>
          </div>
        </div>
      ) : (
        <form className="hb-code" onSubmit={submit}>
          <label className="mw-field">
            <span>{t("hb.code.label")}</span>
            <input
              name="cleaner-access-code"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              maxLength={14}
              value={code}
              onChange={(event) => { setCode(formatAccessCodeInput(event.target.value)); setState("idle"); }}
              placeholder="XXXX-XXXX-XXXX"
              aria-invalid={state === "invalid" || undefined}
            />
          </label>
          {["invalid", "network"].includes(state) && <p className="mw-hint hb-error" role="alert">{t(`hb.code.${state}`)}</p>}
          <p className="mw-hint">{t("hb.code.note")}</p>
          <button type="submit" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" disabled={normalizeAccessCodeInput(code).length !== 12 || state === "checking"}>
            {t(state === "checking" ? "hb.code.checking" : "hb.code.submit")}
          </button>
        </form>
      )}
    </div>
  );
}

function FirstRun({ t, hub, platform, displayMode, installPrompt, onDone }) {
  const steps = displayMode === "standalone" ? ["schedule", "reopen"] : ["schedule", "install", "reopen"];
  const [step, setStep] = useState(0);
  const id = steps[step];
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const next = () => (step + 1 < steps.length ? setStep(step + 1) : onDone());
  const preview = [...hub.schedule.today, ...hub.schedule.upcoming].slice(0, 3);
  return (
    <div className="hb-screen hb-onb">
      <div className="hb-onb-progress" aria-label={t("hb.onb.progress", { n: step + 1, total: steps.length })}>{steps.map((key, index) => <span key={key} className={index <= step ? "is-on" : ""} />)}</div>
      {id === "install"
        ? <InstallGuide t={t} platform={platform} displayMode={displayMode} installPrompt={installPrompt} onInstalled={next} onSkip={next} />
        : (
          <>
            <h2 ref={heading} tabIndex={-1}>{t(`hb.onb.${id}.title`)}</h2>
            <p className="hb-onb-body">{t(`hb.onb.${id}.body`)}</p>
            {id === "schedule" && (preview.length
              ? <ul className="hb-jobs hb-onb-jobs">{preview.map((entry) => <JobCard key={entry.id} t={t} entry={entry} onOpen={() => {}} />)}</ul>
              : <div className="hb-onb-note tone-info"><HubIcon name="calendar" size={18} /><p>{t("hb.onb.schedule.empty")}</p></div>)}
            {id === "reopen" && <div className="hb-onb-note tone-info"><span className="ig-art-icon">CF</span><p>{t("hb.onb.reopen.body")}</p></div>}
            <div className="hb-onb-actions">
              <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={next}>{t(step === steps.length - 1 ? "hb.onb.finish" : "hb.onb.continue")}</button>
            </div>
          </>
        )}
    </div>
  );
}

/* ---------- shell ---------- */

function Shell({ t, theme, children, bar, tabs }) {
  return (
    <div className="hb-root cleaner-hub-live" data-theme={theme} lang={t.lang === "pt" ? "pt-BR" : t.lang}>
      <div className="hb-stage">
        <div className="hb-app" role="application" aria-label={t("hb.appLabel")}>
          <header className="hb-bar">{bar}</header>
          <main className="hb-main" id="hb-main">{children}</main>
          {tabs}
        </div>
      </div>
    </div>
  );
}

function Brand({ t }) {
  return <span className="hb-brand"><span className="hb-logo" aria-hidden="true"><HubIcon name="broom" size={16} /></span>{t("hb.brand")}</span>;
}

export function CleanerHubApp({ hubOptions, initialCode = "" }) {
  const hub = useCleanerHub(hubOptions);
  const [t, setLang] = useTranslator(hub.membership.preferredLanguage);
  const appearance = useHubTheme();
  const { theme } = appearance;
  const installPrompt = useInstallPrompt();
  const [platform] = useState(detectPlatform);
  const [displayMode] = useState(detectDisplayMode);
  const [view, setView] = useState(() => ({
    type: notificationInboxEnabled() && new URLSearchParams(window.location.search).get("inbox") === "1" ? "inbox" : "tab",
    tab: "agenda",
  }));
  const [segment, setSegment] = useState("today");
  const [scheduledNavigation, setScheduledNavigation] = useState({ mode: "all", month: "" });
  const agendaReturn = useRef(null);
  const [signingOut, setSigningOut] = useState(false);
  const [onboarded, setOnboarded] = useState(() => readStorage(onboardingStorageKey));
  const main = useRef(null);
  const { session } = hub;
  const sessionScope = [session.uid, session.organizationId, session.cleanerId, session.sessionId].join(":");
  useEffect(() => {
    setScheduledNavigation({ mode: "all", month: "" });
    agendaReturn.current = null;
  }, [sessionScope]);
  const active = session.status === "signed-in" && hub.membership.state === "active" && !hub.revoked;
  const inbox = useNotificationInbox({
    role: "CLEANER", sessionKey: active ? sessionScope : null, service: hubOptions?.inboxService,
    scheduleResponses: hub.scheduleResponses,
  });
  const push = useCleanerNotificationSettings({ session, active, platform, displayMode, language: t.lang });
  const browserTitle = `${t("hb.brand")} · CleanFlow`;
  useEffect(() => {
    const previousTitle = document.title;
    document.title = browserTitle;
    return () => { document.title = previousTitle; };
  }, [browserTitle]);
  const today = localDateKey(new Date());
  const go = (next, back = false) => {
    if (view.type === "tab" && view.tab === "agenda" && next.type === "job") {
      const scroller = document.getElementById("hb-main");
      const card = [...main.current.querySelectorAll("[data-job-id]")].find((element) => element.dataset.jobId === next.jobId);
      agendaReturn.current = {
        scope: sessionScope, jobId: next.jobId, scrollTop: scroller.scrollTop,
        offset: card ? card.getBoundingClientRect().top - scroller.getBoundingClientRect().top : null,
      };
    } else if (!back || view.type !== "job") agendaReturn.current = null;
    setView((current) => ({ ...next, tab: next.tab || current.tab, returnToAgenda: back && view.type === "job" }));
  };
  useEffect(() => {
    const worker = notificationInboxEnabled() ? navigator.serviceWorker : null;
    const openInbox = (event) => {
      if (event.data?.type === cleanerPushOpenInboxEvent
        && event.source?.scriptURL === new URL(cleanerMessagingWorkerPath, window.location.origin).href) {
        setView((current) => ({ type: "inbox", tab: current.tab }));
      }
    };
    worker?.addEventListener?.("message", openInbox);
    return () => worker?.removeEventListener?.("message", openInbox);
  }, []);
  useLayoutEffect(() => {
    const scroller = document.getElementById("hb-main");
    if (!scroller) return;
    const saved = agendaReturn.current;
    const returning = view.returnToAgenda && view.type === "tab" && view.tab === "agenda" && saved?.scope === sessionScope;
    const card = returning && [...main.current.querySelectorAll("[data-job-id]")].find((element) => element.dataset.jobId === saved.jobId);
    scroller.scrollTo?.(0, card && saved.offset !== null ? saved.scrollTop : 0);
    if (card && saved.offset !== null) scroller.scrollTop += card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - saved.offset;
    if (returning) (card || main.current.querySelector('.hb-seg button[aria-pressed="true"]'))?.focus({ preventScroll: true });
  }, [view.type, view.tab, view.jobId, view.returnToAgenda, sessionScope]);

  // First visit defaults to Upcoming when nothing is scheduled today.
  const firstSnapshot = useRef(true);
  useEffect(() => {
    if (firstSnapshot.current && active && hub.freshness.lastVerifiedAt) {
      firstSnapshot.current = false;
      if (!hub.schedule.today.length && hub.schedule.upcoming.length) setSegment("upcoming");
    }
  }, [active, hub.freshness.lastVerifiedAt, hub.schedule.today.length, hub.schedule.upcoming.length]);

  async function signOut() {
    setSigningOut(true);
    try { await hub.signOut(); } finally { window.location.replace("/agenda"); }
  }

  function openInboxTarget(destination) {
    if (!["JOB", "OFFER"].includes(destination?.kind) || typeof destination.jobId !== "string") return false;
    const targetType = destination.kind === "JOB" ? "job" : "offer";
    go({ type: targetType, jobId: destination.jobId, wasAutomatic: true });
    return true;
  }

  if (hub.revoked) {
    return (
      <Shell t={t} theme={theme} bar={<Brand t={t} />}>
        <div className="hb-screen hb-onb">
          <h2>{t("hb.revoked.title")}</h2>
          <p className="hb-onb-body">{t("hb.revoked.body")}</p>
          <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={() => window.location.replace("/agenda")}>{t("hb.code.submit")}</button>
        </div>
      </Shell>
    );
  }
  if (["loading", "unverified"].includes(session.status) || (session.status === "signed-in" && !active)) {
    const failed = !hub.online || session.status === "unverified" || hub.membership.state === "error";
    return (
      <Shell t={t} theme={theme} bar={<Brand t={t} />}>
        <div className="hb-screen">
          <FreshnessBanner t={t} freshness={{ state: failed ? "error" : "loading" }} onRetry={hub.retryStartup} online={hub.online} />
        </div>
      </Shell>
    );
  }
  if (session.status !== "signed-in") {
    return (
      <Shell t={t} theme={theme} bar={<Brand t={t} />}>
        {session.status === "not-cleaner" && <p className="mw-hint hb-error" role="alert">{t("hb.notCleaner")}</p>}
        <AccessCode t={t} onRedeem={hub.redeem} platform={platform} displayMode={displayMode} installPrompt={installPrompt} initialCode={initialCode} />
      </Shell>
    );
  }

  const name = hub.membership.displayName;
  const onboardingDone = onboarded === session.uid;
  const pendingOffers = hub.schedule.offers.filter((entry) => entry.offerStatus === "PENDING").length;
  const sub = view.type !== "tab";
  let body;
  if (!onboardingDone && !hub.freshness.lastVerifiedAt) {
    body = <div className="hb-screen"><FreshnessBanner t={t} freshness={hub.freshness} onRetry={hub.retryStartup} online={hub.online} /></div>;
  } else if (!onboardingDone) {
    body = <FirstRun t={t} hub={hub} platform={platform} displayMode={displayMode} installPrompt={installPrompt} onDone={() => { writeStorage(onboardingStorageKey, session.uid); setOnboarded(session.uid); }} />;
  } else if (view.type === "job" || view.type === "offer") {
    body = <AgendaDetail key={`${sessionScope}:${view.jobId}`} t={t} hub={hub} view={view} today={today} />;
  } else if (notificationInboxEnabled() && view.type === "inbox") body = <div className="hb-screen"><NotificationInbox inbox={inbox} language={t.lang} onOpen={openInboxTarget} /></div>;
  else if (view.type === "availability") body = <div className="hb-screen"><AvailabilityPanel key={sessionScope} language={t.lang} today={today} service={hub.availabilityService} entries={hub.entries} /></div>;
  else if (view.type === "install") body = <div className="hb-screen"><InstallGuide t={t} platform={platform} displayMode={displayMode} installPrompt={installPrompt} onSkip={() => go({ type: "tab" })} /></div>;
  else if (view.tab === "offers") body = <Offers t={t} hub={hub} go={go} />;
  else if (view.tab === "account") body = <Account t={t} name={name} setLang={setLang} appearance={appearance} go={go} onSignOut={signOut} signingOut={signingOut} push={push} installed={displayMode === "standalone"} />;
  else body = <Agenda t={t} hub={hub} name={name} segment={segment} setSegment={setSegment} go={go} today={today} scheduledNavigation={scheduledNavigation} setScheduledNavigation={setScheduledNavigation} />;

  const freshChip = hub.freshness.state === "live" ? "live" : hub.freshness.state === "loading" ? "loading" : "stale";
  return (
    <Shell
      t={t}
      theme={theme}
      bar={<>
        {sub && onboardingDone
          ? <button type="button" className="mw-linkbtn" onClick={() => go({ type: "tab" }, true)}><HubIcon name="arrowL" size={16} />{t("hb.back")}</button>
          : <Brand t={t} />}
        {notificationInboxEnabled() && onboardingDone && view.type !== "inbox" && (
          <button type="button" className="mw-linkbtn hb-inbox-trigger" onClick={() => go({ type: "inbox" })}>
            <HubIcon name="inbox" size={18} /><span className="hb-inbox-trigger__label">{inboxMessage(t.lang, "inbox.title")}</span>
            <NotificationInboxBadge inbox={inbox} language={t.lang} className="mw-badge" />
          </button>
        )}
        <span className={`hb-barchip hb-fresh is-${freshChip}`} role="status"><HubIcon name={freshChip === "live" ? "checkCircle" : freshChip === "loading" ? "refresh" : "alert"} size={14} />{t(`hb.fresh.chip.${freshChip}`)}</span>
      </>}
      tabs={onboardingDone && (
        <nav className="hb-tabs" aria-label={t("hb.tabs")}>
          {TABS.map(([id, icon]) => (
            <button key={id} type="button" aria-current={view.tab === id && view.type === "tab" ? "page" : undefined} onClick={() => setView({ type: "tab", tab: id })}>
              <HubIcon name={icon} size={22} />{t(`hb.tab.${id}`)}
              {id === "offers" && pendingOffers > 0 && <span className="mw-badge">{pendingOffers}</span>}
            </button>
          ))}
        </nav>
      )}
    >
      <div ref={main}>{body}</div>
    </Shell>
  );
}

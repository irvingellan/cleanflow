import { useEffect, useMemo, useRef, useState } from "react";
import { FIRST_ACCEPT_WINS } from "../jobs/automaticOffers.js";
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
import { detectHubLanguage, hubLanguages, hubMoney, hubTranslate } from "./cleanerHubMessages.js";
import { useCleanerHub } from "./useCleanerHub.js";
import "./cleanerHub.css";

// Cleaner Hub V1 — "Minha agenda", connected to real CleanFlow Assignments.
// Visual structure and classes come from the approved Cleaner Hub V1 prototype.

const TABS = [["agenda", "calendar"], ["offers", "send"], ["account", "user"]];
const languageNames = { pt: "Português", en: "English", es: "Español" };
const languageStorageKey = "cleanflow.cleanerHub.language";
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
    translate.time = (hhmm) => {
      if (!hhmm) return null;
      const [hours, minutes] = hhmm.split(":").map(Number);
      return new Intl.DateTimeFormat(translate.locale, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hours, minutes));
    };
    translate.clock = (date) => date ? new Intl.DateTimeFormat(translate.locale, { hour: "numeric", minute: "2-digit" }).format(date) : hubTranslate(lang, "hb.fresh.never");
    return translate;
  }, [lang]);
  const choose = (next) => { writeStorage(languageStorageKey, next); setLang(next); };
  return [t, choose];
}

function useSystemTheme() {
  const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const [dark, setDark] = useState(Boolean(query?.matches));
  useEffect(() => {
    if (!query?.addEventListener) return undefined;
    const update = (event) => setDark(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [query]);
  return dark ? "dark" : "light";
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

function whenText(t, point, today) {
  if (!point) return "";
  return [dayLabel(t, point.date, today), t.time(point.start)].filter(Boolean).join(" ");
}

/* ---------- small pieces ---------- */

function FreshnessBanner({ t, freshness }) {
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
    return <div className="hb-coverage is-partial" role="alert"><HubIcon name="alert" size={16} /><span><strong>{t("hb.fresh.stale")}</strong><span>{t("hb.fresh.error")}</span></span></div>;
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

function JobCard({ t, entry, today, onOpen, showDate = false }) {
  const offer = entry.kind === "OFFER";
  const status = assignedStatusKey(entry);
  const checklist = offer ? null : checklistSituation(entry);
  return (
    <li>
      <button type="button" className={`hb-job is-${offer ? "offer" : "assigned"}`} onClick={() => onOpen(entry)} data-job-id={entry.jobId}>
        <span className="hb-job-time">
          <strong className="tnum">{t.time(entry.scheduledStart) || "—"}</strong>
          <span>{offer || showDate ? dayLabel(t, entry.scheduledDate, today) : ""}</span>
        </span>
        <span className="mw-grow hb-job-main">
          <strong>{entry.propertyName || "—"}</strong>
          {!entry.scheduledStart && <span className="mw-sec">{t("hb.timeNotSet")}</span>}
          {offer
            ? <span className={`hb-status is-${entry.offerStatus === "INTERESTED" ? "interested" : "waiting"}`}>{t(offerStatusKey(entry))}</span>
            : <span className={`hb-status is-${status}`}>{t(`hb.st.${status}`)}</span>}
          {checklist && entry.jobStatus !== "COMPLETED" && checklistChipStates.includes(checklist.state) && (
            <span className={`hb-clchip is-${checklist.state}`} data-checklist-state={checklist.state}>
              <HubIcon name="clipCheck" size={13} />{t(`hb.clst.${checklist.state}.chip`)}
            </span>
          )}
        </span>
        <HubIcon name="arrowR" size={18} />
      </button>
    </li>
  );
}

function DayGroups({ t, entries, today, onOpen }) {
  const days = [...new Set(entries.map((entry) => entry.scheduledDate || ""))];
  return days.map((day) => (
    <section key={day || "none"} className="hb-day" aria-label={dayLabel(t, day, today)}>
      <h3 className="mw-micro">{dayLabel(t, day, today)}</h3>
      <ul className="hb-jobs">
        {entries.filter((entry) => (entry.scheduledDate || "") === day).map((entry) => <JobCard key={entry.id} t={t} entry={entry} today={today} onOpen={onOpen} />)}
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
function Scheduled({ t, entries, today, live, onOpen }) {
  const months = agendaMonths(entries);
  const [mode, setMode] = useState("all");
  const [month, setMonth] = useState(months[0] ?? "");
  const current = months.includes(month) ? month : months[0] ?? "";
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
          <DayGroups t={t} entries={entriesInMonth(entries, current)} today={today} onOpen={onOpen} />
        </>
      ) : months.map((key) => (
        <section key={key || "none"} className="hb-month" aria-label={monthLabel(t, key)}>
          <h3 className="hb-month-title">{monthLabel(t, key)} <span className="mw-sec tnum">· {entriesInMonth(entries, key).length}</span></h3>
          <DayGroups t={t} entries={entriesInMonth(entries, key)} today={today} onOpen={onOpen} />
        </section>
      ))}
    </div>
  );
}

/* ---------- screens ---------- */

function Agenda({ t, hub, name, segment, setSegment, go, today }) {
  const { schedule, freshness } = hub;
  const list = segment === "today" ? schedule.today : segment === "upcoming" ? schedule.upcoming : schedule.completed;
  const pendingOffers = schedule.offers.filter((entry) => entry.offerStatus === "PENDING").length;
  const pendingChecklists = [...schedule.today, ...schedule.upcoming].filter((entry) => checklistSituation(entry).pending);
  return (
    <div className="hb-screen">
      <header className="hb-hello">
        <h2>{name ? t("hb.hello", { name }) : t("hb.helloNoName")}</h2>
        <p className="mw-sec">{t("hb.helloSub", { count: schedule.openCount })}</p>
      </header>
      <FreshnessBanner t={t} freshness={freshness} />
      {schedule.changes.length > 0 && (
        <section className="hb-changes" aria-label={t("hb.changes")}>
          <h3 className="mw-micro">{t("hb.changes")}</h3>
          <ul>
            {schedule.changes.slice(0, 4).map((change) => (
              <li key={change.id} className={`hb-change is-${change.change === "RESCHEDULED" ? "moved" : change.change === "ASSIGNED" ? "added" : "removed"}`}>
                <span className="hb-change__icon" aria-hidden="true"><HubIcon name={change.change === "RESCHEDULED" ? "clock" : change.change === "ASSIGNED" ? "calendar" : "userX"} size={16} /></span>
                <span className="mw-grow">
                  <strong>{change.propertyName || "—"}</strong>
                  <span>{t(`hb.ch.${change.change}`, {
                    from: whenText(t, change.from, today),
                    to: whenText(t, change.to, today),
                    when: whenText(t, change.to || change.from, today),
                  })}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
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
        ? <Scheduled t={t} entries={list} today={today} live={freshness.state === "live"} onOpen={(entry) => go({ type: "job", jobId: entry.jobId })} />
        : list.length
          ? <DayGroups t={t} entries={list} today={today} onOpen={(entry) => go({ type: "job", jobId: entry.jobId })} />
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

const checklistActionStates = { available: "hb.clst.available.action", started: "hb.clst.started.action", unknown: "hb.job.openChecklist" };

function JobView({ t, hub, jobId, today }) {
  const entry = findAgendaEntry(hub.entries, jobId);
  const [checklist, setChecklist] = useState({ state: "idle" });
  const checklistAttempt = useRef(0);
  const canTryChecklist = entry?.kind === "ASSIGNED" && ["ASSIGNED", "IN_PROGRESS"].includes(entry.jobStatus);
  useEffect(() => {
    setChecklist({ state: "idle" });
    return () => { checklistAttempt.current += 1; };
  }, [jobId, canTryChecklist]);
  if (!entry || entry.kind !== "ASSIGNED") {
    return <div className="hb-screen"><div className="hb-empty is-uncertain"><HubIcon name="userX" size={22} /><p>{t("hb.job.notYours")}</p></div></div>;
  }
  const status = assignedStatusKey(entry);
  const situation = checklistSituation(entry);
  const actionKey = checklistActionStates[situation.state];

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
      <dl className="hb-facts">
        <div><dt><HubIcon name="calendar" size={15} />{t("hb.job.when")}</dt><dd>{`${dayLabel(t, entry.scheduledDate, today)} · ${t.time(entry.scheduledStart) || t("hb.timeNotSet")}`}</dd></div>
        <div><dt><HubIcon name="pin" size={15} />{t("hb.job.where")}</dt><dd>{entry.propertyName || "—"}</dd></div>
      </dl>
      <section className={`hb-checkcard is-${situation.state}`} data-checklist-state={situation.state} aria-labelledby="hb-checklist-title">
        <div className="hb-checkhead">
          <h3 id="hb-checklist-title">{t("hb.job.checklist")}</h3>
          {situation.state !== "unknown" && <span className={`hb-clchip is-${situation.state}`}>{t(`hb.clst.${situation.state}.chip`)}</span>}
        </div>
        {canTryChecklist ? (
          <>
            <p className="mw-sec">{t(`hb.clst.${situation.state}.body`)}</p>
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

function OfferView({ t, hub, jobId, today, wasAutomatic }) {
  const entry = findAgendaEntry(hub.entries, jobId);
  const [reply, setReply] = useState("idle");

  if (entry?.kind === "ASSIGNED" || (!entry && !wasAutomatic)) {
    return <JobView key={jobId} t={t} hub={hub} jobId={jobId} today={today} />;
  }
  if (!entry) {
    return <div className="hb-screen"><div className="hb-empty is-uncertain"><HubIcon name="userX" size={22} /><p role="status">{t(reply === "alreadyTaken" ? "hb.offer.ALREADY_TAKEN" : "hb.offer.unavailable")}</p></div></div>;
  }

  const automatic = entry.offerDistributionMode === FIRST_ACCEPT_WINS;
  const taken = entry.offerStatus === "ALREADY_TAKEN" || reply === "alreadyTaken";
  const canRespond = entry.offerStatus === "PENDING" && ["idle", "sending", "error"].includes(reply);
  const waitingForNetwork = automatic && hub.freshness.reason === "offline";

  async function answer(status) {
    setReply("sending");
    try {
      const result = await hub.respondToOffer(entry.jobId, status);
      if (result?.state === "assigned" && result.status === "ACCEPTED" && status === "ACCEPTED") {
        setReply("assigned");
      } else if (result?.state === "already-taken") {
        setReply("alreadyTaken");
      } else {
        setReply(result?.state === "answered" ? "sent" : "unavailable");
      }
    } catch {
      setReply("error");
    }
  }

  const amount = hubMoney(entry.offeredCompensation, t.lang);
  const statusKey = taken ? "hb.offer.ALREADY_TAKEN" : reply === "assigned" ? "hb.offer.assigned" : offerStatusKey(entry);
  return (
    <div className="hb-screen">
      <div className="hb-jobhead">
        <span className="mw-micro">{t(reply === "assigned" && !taken ? "hb.st.confirmed" : "hb.st.offer")}</span>
        <h2>{entry.propertyName || "—"}</h2>
      </div>
      <dl className="hb-facts">
        <div><dt><HubIcon name="calendar" size={15} />{t("hb.job.when")}</dt><dd>{`${dayLabel(t, entry.scheduledDate, today)} · ${t.time(entry.scheduledStart) || t("hb.timeNotSet")}`}</dd></div>
        <div><dt><HubIcon name="dollar" size={15} />{t("hb.job.pay")}</dt><dd>{amount || t("hb.job.payNotSet")}</dd></div>
        <div><dt><HubIcon name="clipboard" size={15} />{t("hb.job.status")}</dt><dd role={taken || reply === "assigned" ? "status" : undefined}>{t(statusKey)}</dd></div>
      </dl>
      {canRespond && !taken && (
        <div className="hb-offer-actions">
          <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" disabled={reply === "sending" || waitingForNetwork} onClick={() => answer(automatic ? "ACCEPTED" : "INTERESTED")}>{t(reply === "sending" ? "hb.offer.sending" : automatic ? "hb.offer.accept" : "hb.offer.interested")}</button>
          <button type="button" className="cfv2-button cfv2-button-secondary mw-btn mw-btn-block" disabled={reply === "sending" || waitingForNetwork} onClick={() => answer("DECLINED")}>{t("hb.offer.decline")}</button>
        </div>
      )}
      {!taken && ["sent", "unavailable", "error"].includes(reply) && <p className="mw-hint" role="status">{t(`hb.offer.${reply}`)}</p>}
      {waitingForNetwork && <p className="mw-hint" role="status">{t("hb.offer.onlineRequired")}</p>}
      {!taken && reply !== "assigned" && <p className="mw-hint">{t(automatic ? "hb.offers.autoNote" : "hb.offers.note")}</p>}
    </div>
  );
}

function Offers({ t, hub, go, today }) {
  const { offers } = hub.schedule;
  return (
    <div className="hb-screen">
      <header className="hb-hello"><h2>{t("hb.offers.title")}</h2><p className="mw-sec">{t("hb.offers.sub")}</p></header>
      {!offers.length && <div className={`hb-empty${hub.freshness.state === "live" ? "" : " is-uncertain"}`}><HubIcon name="send" size={22} /><p>{t("hb.offers.empty")}</p></div>}
      <ul className="hb-jobs">
        {offers.map((entry) => <JobCard key={entry.id} t={t} entry={entry} today={today} onOpen={() => go({ type: "offer", jobId: entry.jobId, wasAutomatic: entry.offerDistributionMode === FIRST_ACCEPT_WINS })} />)}
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
        {state === "pilot-ineligible" && push.pairingReference && <label className="mw-hint hb-pairing">
          {t("hb.push.pairingReference")}
          <input type="text" readOnly value={push.pairingReference} aria-label={t("hb.push.pairingReference")} />
          <span>{t("hb.push.pairingHelp")}</span>
        </label>}
        {recoverable && push.canEnable !== false && <button type="button" className="cfv2-button cfv2-button-primary mw-btn" onClick={push.enable}>{t("hb.push.enable")}</button>}
        {state === "ios-standalone-required" && <button type="button" className="mw-linkbtn" onClick={() => go({ type: "install" })}>{t("hb.acc.install")}</button>}
        {(["permission-denied", "offline", "superseded", "error", "pilot-ineligible", "pilot-check-required", "unavailable"].includes(state) || (recoverable && push.canEnable === false)) && <button type="button" className="mw-linkbtn" onClick={push.recheck}>{t("hb.push.recheck")}</button>}
      </div>
    </div>
  );
}

function Account({ t, name, setLang, go, onSignOut, signingOut, push, installed }) {
  return (
    <div className="hb-screen">
      <header className="hb-profile"><span className="mw-avatar is-large">{(name || "CF").slice(0, 2).toUpperCase()}</span><div><h2>{name || t("hb.helloNoName")}</h2><p className="mw-sec">{t("hb.acc.role")}</p></div></header>
      {!installed && <ul className="hb-menu">
        <li><button type="button" onClick={() => go({ type: "install" })}><HubIcon name="phone" size={18} /><span className="mw-grow">{t("hb.acc.install")}</span><HubIcon name="arrowR" size={16} /></button></li>
      </ul>}
      <CleanerPushSettings t={t} push={push} go={go} />
      <div className="mw-setgroup">
        <h4>{t("hb.acc.language")}</h4>
        <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("hb.acc.language")}>
          {hubLanguages.map((id) => <button key={id} type="button" aria-pressed={t.lang === id} onClick={() => setLang(id)}>{languageNames[id]}</button>)}
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

function FirstRun({ t, hub, platform, displayMode, installPrompt, today, onDone }) {
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
              ? <ul className="hb-jobs hb-onb-jobs">{preview.map((entry) => <JobCard key={entry.id} t={t} entry={entry} today={today} onOpen={() => {}} />)}</ul>
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
  const theme = useSystemTheme();
  const installPrompt = useInstallPrompt();
  const [platform] = useState(detectPlatform);
  const [displayMode] = useState(detectDisplayMode);
  const [view, setView] = useState(() => ({
    type: notificationInboxEnabled() && new URLSearchParams(window.location.search).get("inbox") === "1" ? "inbox" : "tab",
    tab: "agenda",
  }));
  const [segment, setSegment] = useState("today");
  const [signingOut, setSigningOut] = useState(false);
  const [onboarded, setOnboarded] = useState(() => readStorage(onboardingStorageKey));
  const main = useRef(null);
  const { session } = hub;
  const sessionScope = [session.uid, session.organizationId, session.cleanerId, session.sessionId].join(":");
  const active = session.status === "signed-in" && hub.membership.state === "active" && !hub.revoked;
  const inbox = useNotificationInbox({
    role: "CLEANER", sessionKey: active ? session.sessionId : null, service: hubOptions?.inboxService,
  });
  const push = useCleanerNotificationSettings({ session, active, platform, displayMode, language: t.lang });
  const browserTitle = `${t("hb.brand")} · CleanFlow`;
  useEffect(() => {
    const previousTitle = document.title;
    document.title = browserTitle;
    return () => { document.title = previousTitle; };
  }, [browserTitle]);
  const today = localDateKey(new Date());
  const go = (next) => setView((current) => ({ ...next, tab: next.tab || current.tab }));
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
  useEffect(() => { document.getElementById("hb-main")?.scrollTo?.(0, 0); }, [view.type, view.tab, view.jobId]);

  // First visit defaults to Upcoming when nothing is scheduled today.
  const firstSnapshot = useRef(true);
  useEffect(() => {
    if (firstSnapshot.current && hub.freshness.state !== "loading") {
      firstSnapshot.current = false;
      if (!hub.schedule.today.length && hub.schedule.upcoming.length) setSegment("upcoming");
    }
  }, [hub.freshness.state, hub.schedule.today.length, hub.schedule.upcoming.length]);

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

  if (session.status === "loading") {
    return <Shell t={t} theme={theme} bar={<Brand t={t} />}><div className="hb-screen"><div className="hb-coverage is-unknown" role="status"><HubIcon name="refresh" size={16} /><span><strong>{t("hb.fresh.loading")}</strong></span></div></div></Shell>;
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
  if (session.status !== "signed-in") {
    return (
      <Shell t={t} theme={theme} bar={<Brand t={t} />}>
        {session.status === "not-cleaner" && <p className="mw-hint hb-error" role="alert">{t("hb.notCleaner")}</p>}
        {session.status === "unverified" && <FreshnessBanner t={t} freshness={{ state: "stale", reason: "offline", lastVerifiedAt: null }} />}
        <AccessCode t={t} onRedeem={hub.redeem} platform={platform} displayMode={displayMode} installPrompt={installPrompt} initialCode={initialCode} />
      </Shell>
    );
  }

  const name = hub.membership.displayName;
  const onboardingDone = onboarded === session.uid;
  const pendingOffers = hub.schedule.offers.filter((entry) => entry.offerStatus === "PENDING").length;
  const sub = view.type !== "tab";
  let body;
  if (!onboardingDone) {
    body = <FirstRun t={t} hub={hub} platform={platform} displayMode={displayMode} installPrompt={installPrompt} today={today} onDone={() => { writeStorage(onboardingStorageKey, session.uid); setOnboarded(session.uid); }} />;
  } else if (view.type === "job") body = <JobView key={`${sessionScope}:${view.jobId}`} t={t} hub={hub} jobId={view.jobId} today={today} />;
  else if (view.type === "offer") body = <OfferView key={`${sessionScope}:${view.jobId}`} t={t} hub={hub} jobId={view.jobId} today={today} wasAutomatic={view.wasAutomatic} />;
  else if (notificationInboxEnabled() && view.type === "inbox") body = <div className="hb-screen"><NotificationInbox inbox={inbox} language={t.lang} onOpen={openInboxTarget} /></div>;
  else if (view.type === "install") body = <div className="hb-screen"><InstallGuide t={t} platform={platform} displayMode={displayMode} installPrompt={installPrompt} onSkip={() => go({ type: "tab" })} /></div>;
  else if (view.tab === "offers") body = <Offers t={t} hub={hub} go={go} today={today} />;
  else if (view.tab === "account") body = <Account t={t} name={name} setLang={setLang} go={go} onSignOut={signOut} signingOut={signingOut} push={push} installed={displayMode === "standalone"} />;
  else body = <Agenda t={t} hub={hub} name={name} segment={segment} setSegment={setSegment} go={go} today={today} />;

  const freshChip = hub.freshness.state === "live" ? "live" : hub.freshness.state === "loading" ? "loading" : "stale";
  return (
    <Shell
      t={t}
      theme={theme}
      bar={<>
        {sub && onboardingDone
          ? <button type="button" className="mw-linkbtn" onClick={() => go({ type: "tab" })}><HubIcon name="arrowL" size={16} />{t("hb.back")}</button>
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

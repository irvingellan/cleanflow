import { useEffect, useRef, useState } from "react";
import { CleanerChecklist, CleanerOffer } from "../cleaner/CleanerViews.jsx";
import { NotificationCenter } from "../flows/Inbox.jsx";
import { cleaners } from "../model/demoData.js";
import { checklistSummary, unreadCount } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { addDays } from "../model/time.js";
import { Icon } from "../ui/Icon.jsx";
import { SimTag, compText, dayWord, propertyOf, useT, useViewport } from "../ui/kit.jsx";
import { DeviceList, DeviceReadiness, ReadinessChip, RecoveryFlow } from "./DeviceHealth.jsx";
import { InstallGuide } from "./InstallGuide.jsx";
import { SCENARIOS, deviceReadiness, emptyMessageKey, scheduleFor } from "./hubModel.js";

// Cleaner Hub V1 — "Minha agenda". Mobile-first; on wider screens it stays a
// phone-width column with the simulation panel beside it. All data is synthetic.

const TABS = [["agenda", "calendar"], ["offers", "send"], ["inbox", "inbox"], ["account", "user"]];

function useHub() {
  const store = useStore();
  const { data, ui, setUi } = store;
  const cleanerId = data.hub.cleanerId;
  const cleaner = cleaners.find(c => c.id === cleanerId);
  const device = data.deviceHealth.find(d => d.owner === cleanerId && d.current);
  const view = ui.hubView || { type: "tab" };
  const tab = ui.hubTab || "agenda";
  const go = (v, extra = {}) => setUi({ hubView: v, ...extra });
  return { ...store, cleanerId, cleaner, device, view, tab, go };
}

/* ---------- small pieces ---------- */

function CoverageBanner() {
  const t = useT();
  const { data } = useStore();
  const c = data.hub.coverage;
  return (
    <div className={`hb-coverage is-${c.status}`} role={c.status === "verified" ? undefined : "status"}>
      <Icon name={c.status === "verified" ? "checkCircle" : c.status === "unknown" ? "info" : "alert"} size={16} />
      <span><strong>{t(`hb.cov.${c.status}`)}</strong><span>{t(`hb.cov.${c.status}.body`, { time: t.stamp(c.verifiedAt), count: c.pending })}</span></span>
    </div>
  );
}

function JobCard({ job, onOpen, kind = "assigned" }) {
  const t = useT();
  const { data } = useStore();
  const property = propertyOf(data, job);
  const cl = checklistSummary(data, job);
  const status = job.status === "COMPLETED" ? "done" : job.status === "IN_PROGRESS" ? (cl.state === "submitted" ? "submitted" : "progress") : "confirmed";
  return (
    <li>
      <button type="button" className={`hb-job is-${kind}`} onClick={() => onOpen(job)} data-job-id={job.id}>
        <span className="hb-job-time"><strong className="tnum">{job.start ? t.time(job.start) : "—"}</strong><span>{t("hb.hours", { h: Math.round(job.durationMin / 60) })}</span></span>
        <span className="mw-grow hb-job-main">
          <strong>{property.name}</strong>
          <span className="mw-sec">{property.area} · {t(`type.${job.type}`)}</span>
          {kind === "assigned" && <span className={`hb-status is-${status}`}>{t(`hb.st.${status}`)}</span>}
          {kind === "offer" && <span className="hb-status is-offer">{t("hb.st.offer")}</span>}
        </span>
        <Icon name="arrowR" size={18} />
      </button>
    </li>
  );
}

function DayGroups({ jobs, onOpen, kind }) {
  const t = useT();
  const { data } = useStore();
  const days = [...new Set(jobs.map(j => j.date))];
  return days.map(d => (
    <section key={d} className="hb-day" aria-label={dayWord(t, data, d)}>
      <h3 className="mw-micro">{dayWord(t, data, d)}</h3>
      <ul className="hb-jobs">{jobs.filter(j => j.date === d).map(j => <JobCard key={j.id} job={j} onOpen={onOpen} kind={kind} />)}</ul>
    </section>
  ));
}

/* ---------- screens ---------- */

function Agenda() {
  const t = useT();
  const { data, ui, setUi, cleanerId, cleaner, device, go } = useHub();
  const s = scheduleFor(data, cleanerId);
  const seg = ui.hubSeg || "upcoming";
  const list = seg === "today" ? s.today : seg === "upcoming" ? [...s.today, ...s.upcoming] : s.completed;
  const r = deviceReadiness(device);
  const cov = data.hub.coverage.status;
  return (
    <div className="hb-screen">
      <header className="hb-hello">
        <h2>{t("hb.hello", { name: cleaner.name })}</h2>
        <p className="mw-sec">{t("hb.helloSub", { count: s.today.length + s.upcoming.length })}</p>
      </header>
      <CoverageBanner />
      {r.state !== "ready" && (
        <button type="button" className={`hb-nudge tone-${r.state === "unknown" ? "neutral" : "attention"}`} onClick={() => go({ type: "setup" })}>
          <Icon name="bell" size={18} /><span className="mw-grow"><strong>{t(`hb.nudge.${r.state}`)}</strong><span>{t("hb.nudgeSub")}</span></span><Icon name="arrowR" size={16} />
        </button>
      )}
      {s.changes.length > 0 && (
        <section className="hb-changes" aria-label={t("hb.changes")}>
          <h3 className="mw-micro">{t("hb.changes")}</h3>
          <ul>{s.changes.slice(0, 3).map(c => (
            <li key={c.id} className={`hb-change is-${c.kind}`}>
              <Icon name={c.kind === "moved" ? "calendar" : "userX"} size={16} />
              <span className="mw-grow"><strong>{data.properties.find(p => p.id === c.propertyId)?.name}</strong>
                <span>{c.kind === "moved" ? t("hb.ch.moved", { from: `${dayWord(t, data, c.from.date)} ${c.from.start ? t.time(c.from.start) : ""}`, to: `${dayWord(t, data, c.to.date)} ${c.to.start ? t.time(c.to.start) : ""}` }) : t("hb.ch.removed", { when: dayWord(t, data, c.from.date) })}</span></span>
            </li>
          ))}</ul>
        </section>
      )}
      <div className="cfv2-segmented mw-seg-control hb-seg" role="group" aria-label={t("hb.view")}>
        {[["today", s.today.length], ["upcoming", s.today.length + s.upcoming.length], ["completed", s.completed.length]].map(([k, n]) => (
          <button key={k} type="button" aria-pressed={seg === k} onClick={() => setUi({ hubSeg: k })}>{t(`hb.seg.${k}`)} <span className="tnum">{n}</span></button>
        ))}
      </div>
      {list.length ? <DayGroups jobs={list} onOpen={j => go({ type: "job", jobId: j.id })} kind="assigned" />
        : <div className={`hb-empty${cov === "verified" ? "" : " is-uncertain"}`}><Icon name={cov === "verified" ? "checkCircle" : "info"} size={22} /><p>{t(seg === "completed" ? "hb.empty.completed" : emptyMessageKey(cov))}</p></div>}
      {s.offers.length > 0 && seg !== "completed" && (
        <button type="button" className="hb-offerlink" onClick={() => setUi({ hubTab: "offers", hubView: { type: "tab" } })}>
          <Icon name="send" size={16} />{t("hb.offersWaiting", { count: s.offers.length })}<Icon name="arrowR" size={14} />
        </button>
      )}
    </div>
  );
}

function JobView({ jobId }) {
  const t = useT();
  const { data, cleanerId, go } = useHub();
  const job = data.jobs.find(j => j.id === jobId);
  if (!job || !job.cleanerIds.includes(cleanerId)) {
    return <div className="hb-screen"><div className="hb-empty is-uncertain"><Icon name="userX" size={22} /><p>{t("hb.job.notYours")}</p></div></div>;
  }
  const property = propertyOf(data, job);
  const today = job.date === data.clock.date;
  const canChecklist = today && ["ASSIGNED", "IN_PROGRESS"].includes(job.status);
  const cl = checklistSummary(data, job);
  const facts = [
    ["calendar", t("hb.job.when"), `${dayWord(t, data, job.date)} · ${job.start ? t.time(job.start) : t("c.timeNotSet")} · ${t("hb.hours", { h: Math.round(job.durationMin / 60) })}`],
    ["pin", t("hb.job.where"), `${property.area}`, t("hb.job.whereNote")],
    ["clipboard", t("hb.job.type"), t(`type.${job.type}`)],
    ["dollar", t("hb.job.pay"), compText(t, job.comp)],
    ["info", t("hb.job.instructions"), property.instructions[t.lang] || property.instructions.en],
  ];
  return (
    <div className="hb-screen">
      <div className="hb-jobhead">
        <span className="mw-micro">{t(job.status === "COMPLETED" ? "hb.st.done" : "hb.st.confirmed")}</span>
        <h2>{property.name}</h2>
      </div>
      <dl className="hb-facts">
        {facts.map(([icon, label, value, note]) => <div key={label}><dt><Icon name={icon} size={15} />{label}</dt><dd>{value}{note && <span className="mw-sec">{note}</span>}</dd></div>)}
      </dl>
      <section className="hb-checkcard">
        <h3>{t("hb.job.checklist")}</h3>
        <p className="mw-sec">{t(`cl.${cl.state}`)}{cl.state !== "none" ? ` · ${t("j.items", { done: cl.done, total: cl.total })}` : ""}</p>
        {canChecklist
          ? <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={() => go({ type: "checklist", jobId })}><Icon name="clipCheck" size={17} />{t("hb.job.openChecklist")}</button>
          : <p className="mw-hint">{t(job.status === "COMPLETED" ? "hb.job.checklistDone" : "hb.job.checklistLater")}</p>}
      </section>
      <p className="mw-hint"><Icon name="lock" size={14} /> {t("hb.job.privacy")}</p>
    </div>
  );
}

function Offers() {
  const t = useT();
  const { data, cleanerId, go } = useHub();
  const s = scheduleFor(data, cleanerId);
  return (
    <div className="hb-screen">
      <header className="hb-hello"><h2>{t("hb.offers.title")}</h2><p className="mw-sec">{t("hb.offers.sub")}</p></header>
      {!s.offers.length && <div className="hb-empty"><Icon name="send" size={22} /><p>{t("hb.offers.empty")}</p></div>}
      <ul className="hb-jobs">
        {s.offers.map(job => {
          const mine = job.offers.find(o => o.cleanerId === cleanerId);
          const property = propertyOf(data, job);
          return (
            <li key={job.id}>
              <button type="button" className="hb-job is-offer" onClick={() => go({ type: "offer", jobId: job.id })} data-job-id={job.id}>
                <span className="hb-job-time"><strong className="tnum">{job.start ? t.time(job.start) : "—"}</strong><span>{dayWord(t, data, job.date)}</span></span>
                <span className="mw-grow hb-job-main"><strong>{property.area}</strong><span className="mw-sec">{t(`type.${job.type}`)}</span>
                  <span className={`hb-status is-${mine.response || "waiting"}`}>{t(`hb.offer.${mine.response || "waiting"}`)}</span></span>
                <Icon name="arrowR" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mw-hint">{t("hb.offers.note")}</p>
    </div>
  );
}

function Setup() {
  const t = useT();
  const { data, device, go, setUi } = useHub();
  const [banner, setBanner] = useState(false);
  const [mode, setMode] = useState("status");
  useEffect(() => { if (!banner) return undefined; const id = setTimeout(() => setBanner(false), 5000); return () => clearTimeout(id); }, [banner]);
  const props = { device, onInstall: () => go({ type: "install" }), onInbox: () => setUi({ hubTab: "inbox", hubView: { type: "tab" } }), onTestBanner: () => setBanner(true) };
  return (
    <div className="hb-screen">
      <header className="hb-hello"><h2>{t("hb.setup.title")}</h2><p className="mw-sec">{t("hb.setup.sub")}</p></header>
      {banner && <div className="hb-testpush" role="status"><span className="mw-push-app">CF</span><span className="mw-grow"><strong>CleanFlow</strong><span>{t("hb.setup.testPush")}</span></span><SimTag /></div>}
      <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("hb.setup.title")}>
        {["status", "recover", "devices"].map(k => <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}>{t(`hb.setup.${k}`)}</button>)}
      </div>
      {mode === "status" && <DeviceReadiness {...props} />}
      {mode === "recover" && <RecoveryFlow {...props} onSupport={() => setUi({ toast: { id: Date.now(), text: t("hb.supportSim"), icon: "msg" } })} />}
      {mode === "devices" && <DeviceList devices={data.deviceHealth.filter(d => d.owner === device.owner)} currentId={device.id} role="cleaner" />}
    </div>
  );
}

function Account() {
  const t = useT();
  const { ui, setUi, cleaner, device, go } = useHub();
  return (
    <div className="hb-screen">
      <header className="hb-profile"><span className="mw-avatar is-large">{cleaner.name.slice(0, 2).toUpperCase()}</span><div><h2>{cleaner.name}</h2><p className="mw-sec">{t("hb.acc.role")}</p></div></header>
      <ul className="hb-menu">
        <li><button type="button" onClick={() => go({ type: "setup" })}><Icon name="bell" size={18} /><span className="mw-grow">{t("hb.acc.notifications")}</span><ReadinessChip device={device} compact /></button></li>
        <li><button type="button" onClick={() => go({ type: "install" })}><Icon name="phone" size={18} /><span className="mw-grow">{t("hb.acc.install")}</span><Icon name="arrowR" size={16} /></button></li>
        <li><button type="button" onClick={() => go({ type: "onboarding", step: 0 })}><Icon name="spark" size={18} /><span className="mw-grow">{t("hb.acc.onboarding")}</span><Icon name="arrowR" size={16} /></button></li>
      </ul>
      <div className="mw-setgroup">
        <h4>{t("app.language")}</h4>
        <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("app.language")}>
          {[["pt", "Português"], ["en", "English"], ["es", "Español"]].map(([l, n]) => <button key={l} type="button" aria-pressed={ui.lang === l} onClick={() => setUi({ lang: l })}>{n}</button>)}
        </div>
        <h4>{t("pref.theme")}</h4>
        <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("pref.theme")}>
          {[["light", "pref.light"], ["dark", "pref.dark"], [null, "pref.system"]].map(([v, k]) => <button key={k} type="button" aria-pressed={(ui.theme || null) === v} onClick={() => setUi({ theme: v })}>{t(k)}</button>)}
        </div>
      </div>
      <button type="button" className="cfv2-button cfv2-button-danger mw-btn mw-btn-block" onClick={() => setUi({ toast: { id: Date.now(), text: t("acc.signedOutSim"), icon: "info" } })}>{t("acc.signOut")}</button>
    </div>
  );
}

/* ---------- first-time onboarding ---------- */

const STEPS = ["welcome", "identity", "schedule", "install", "why", "permission", "registered", "reopen"];

function Onboarding({ step }) {
  const t = useT();
  const { data, cleanerId, cleaner, device, go, act } = useHub();
  const [code, setCode] = useState("");
  const s = scheduleFor(data, cleanerId);
  const next = () => go(step + 1 < STEPS.length ? { type: "onboarding", step: step + 1 } : { type: "tab" }, step + 1 < STEPS.length ? {} : { hubTab: "agenda" });
  const back = () => go(step > 0 ? { type: "onboarding", step: step - 1 } : { type: "tab" });
  const id = STEPS[step];
  const r = deviceReadiness(device);
  const iosTab = device.platform === "ios" && device.displayMode === "browser";
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  return (
    <div className="hb-screen hb-onb">
      <div className="hb-onb-progress" aria-label={t("hb.onb.progress", { n: step + 1, total: STEPS.length })}>{STEPS.map((x, i) => <span key={x} className={i <= step ? "is-on" : ""} />)}</div>
      <h2 ref={heading} tabIndex={-1}>{t(`hb.onb.${id}.title`, { name: cleaner.name })}</h2>
      <p className="hb-onb-body">{t(`hb.onb.${id}.body`)}</p>
      {id === "identity" && (
        <form className="hb-code" onSubmit={e => { e.preventDefault(); next(); }}>
          <label className="mw-field"><span>{t("hb.onb.identity.label")}</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
          <button type="button" className="mw-linkbtn" onClick={() => setCode("246810")}>{t("hb.onb.identity.demo")}</button>
          <p className="mw-hint">{t("hb.onb.identity.note")}</p>
          <button type="submit" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" disabled={code.length !== 6}>{t("hb.onb.continue")}</button>
        </form>
      )}
      {id === "schedule" && (
        <ul className="hb-jobs hb-onb-jobs">{[...s.today, ...s.upcoming].slice(0, 3).map(j => <JobCard key={j.id} job={j} onOpen={() => {}} />)}</ul>
      )}
      {id === "install" && <InstallGuide platform={device.platform} context={device.displayMode} installPrompt={device.platform === "android"} onInstalled={() => { act("HUB_DEVICE", { id: device.id, patch: { displayMode: "standalone" } }); next(); }} onSkip={next} />}
      {id === "why" && (
        <ul className="hb-why">
          {["new", "changes", "reminder"].map(k => <li key={k}><Icon name={k === "new" ? "calendar" : k === "changes" ? "refresh" : "clock"} size={18} />{t(`hb.onb.why.${k}`)}</li>)}
          <li className="is-never"><Icon name="lock" size={18} />{t("hb.onb.why.never")}</li>
        </ul>
      )}
      {id === "permission" && (iosTab
        ? <div className="hb-onb-note tone-attention"><Icon name="phone" size={18} /><p>{t("hb.onb.permission.needHome")}</p></div>
        : <DeviceReadiness device={device} showEvidence={false} onInstall={() => go({ type: "onboarding", step: 3 })} />)}
      {id === "registered" && (
        <div className={`hb-onb-note tone-${r.state === "ready" ? "success" : r.state === "unknown" ? "info" : "attention"}`}>
          <Icon name={r.state === "ready" ? "checkCircle" : "info"} size={18} />
          <p>{t(device.registration === "active" ? (r.state === "ready" ? "hb.onb.registered.ready" : "hb.onb.registered.notTested") : "hb.onb.registered.no")}</p>
        </div>
      )}
      {id === "reopen" && <div className="hb-onb-note tone-info"><span className="ig-art-icon">CF</span><p>{t("hb.onb.reopen.icon")}</p></div>}
      {!["identity", "install"].includes(id) && (
        <div className="hb-onb-actions">
          <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={next}>{t(step === STEPS.length - 1 ? "hb.onb.finish" : id === "permission" && r.state !== "ready" && r.state !== "unknown" ? "hb.onb.skipNotif" : "hb.onb.continue")}</button>
          {step > 0 && <button type="button" className="mw-linkbtn" onClick={back}><Icon name="arrowL" size={14} />{t("c.back")}</button>}
        </div>
      )}
    </div>
  );
}

/* ---------- scenarios / simulation panel ---------- */

export function useScenario() {
  const { data, act, setUi } = useStore();
  return id => {
    const sc = SCENARIOS.find(x => x.id === id);
    const cid = data.hub.cleanerId;
    const dev = data.deviceHealth.find(d => d.owner === cid && d.current);
    act("HUB_COVERAGE", { status: sc.coverage || "verified" });
    if (sc.role === "cleaner" && sc.device) {
      act("HUB_DEVICE", { id: dev.id, patch: { platform: "ios", supported: true, appVersion: "current", displayMode: sc.device.displayMode, permission: sc.device.permission, registration: sc.device.registration, lastTest: sc.device.lastTest ? { result: sc.device.lastTest, at: { date: data.clock.date, min: data.clock.minutes - 90 } } : null, lastConfirmed: sc.device.lastTest === "confirmed" ? { date: data.clock.date, min: data.clock.minutes - 90 } : dev.lastConfirmed } });
    }
    const mine = data.jobs.filter(j => j.cleanerIds.includes(cid) && j.date > data.clock.date && j.status === "ASSIGNED").sort((a, b) => (a.date < b.date ? -1 : 1));
    if (sc.event === "moved" && mine[0]) act("HUB_MOVE_JOB", { jobId: mine[0].id, date: addDays(mine[0].date, 1), start: "13:00" });
    if (sc.event === "revoked" && mine[mine.length - 1]) act("HUB_REVOKE", { jobId: mine[mine.length - 1].id, cleanerId: cid });
    if (sc.event === "missed" && mine[0]) act("HUB_EVENT", { cleanerId: cid, jobId: mine[0].id, category: "cleanerReminder", titleKey: "cn.reminder", bodyKey: "cnb.reminder", delivery: { targets: 1, accepted: true, displayed: "unknown", openedAt: null, openTracked: true } });
    if (sc.event === "interested") {
      const offerJob = data.jobs.find(j => j.offers.some(o => o.cleanerId === cid && !o.response) && !j.cleanerIds.includes(cid));
      if (offerJob) act("OFFER_RESPONSE", { jobId: offerJob.id, cleanerId: cid, cleanerName: "Renata", response: "interested", via: "link" });
    }
    if (sc.role === "manager") {
      setUi({ role: "manager", overlay: sc.screen === "away" ? { type: "away" } : { type: "account", section: "notifications" }, mgrDevice: sc.device || null, scenario: id });
      return;
    }
    const views = { agenda: [{ type: "tab" }, "agenda"], offers: [{ type: "tab" }, "offers"], inbox: [{ type: "tab" }, "inbox"], setup: [{ type: "setup" }, "agenda"], onboarding: [{ type: "onboarding", step: 0 }, "agenda"] };
    const [view, tab] = views[sc.screen];
    setUi({ role: "cleaner", hubView: view, hubTab: tab, hubSeg: "upcoming", scenario: id, overlay: null });
  };
}

export function ScenarioPanel({ onClose }) {
  const t = useT();
  const { data, ui, act, reset, setUi } = useStore();
  const apply = useScenario();
  const dev = data.deviceHealth.find(d => d.owner === data.hub.cleanerId && d.current);
  const sel = (key, values) => (
    <label className="hb-simfield"><span>{t(`hb.sim.${key}`)}</span>
      <select value={String(dev[key] ?? "")} onChange={e => act("HUB_DEVICE", { id: dev.id, patch: { [key]: e.target.value === "true" ? true : e.target.value === "false" ? false : e.target.value } })}>
        {values.map(v => <option key={String(v)} value={String(v)}>{t(`hb.simv.${key}.${v}`)}</option>)}
      </select>
    </label>
  );
  return (
    <aside className="hb-sim" aria-label={t("hb.sim.title")}>
      <header className="tt-head"><strong>{t("hb.sim.title")}</strong><SimTag />{onClose && <button type="button" className="mw-iconbtn" aria-label={t("c.close")} onClick={onClose}><Icon name="x" size={16} /></button>}</header>
      <p className="mw-hint">{t("hb.sim.note")}</p>
      <ol className="hb-scenarios">
        {SCENARIOS.map(s => <li key={s.id}><button type="button" aria-pressed={ui.scenario === s.id} onClick={() => apply(s.id)}><span className="hb-scen-id">{s.id}</span>{t(`hb.sc.${s.id}`)}</button></li>)}
      </ol>
      <h4 className="mw-micro">{t("hb.sim.device")}</h4>
      <div className="hb-simgrid">
        {sel("platform", ["ios", "android"])}
        {sel("displayMode", ["browser", "standalone", "unknown"])}
        {sel("permission", ["default", "granted", "denied", "unknown"])}
        {sel("registration", ["none", "active", "stale", "error", "unknown"])}
        {sel("appVersion", ["current", "outdated"])}
        {sel("supported", [true, false])}
      </div>
      <label className="hb-simfield"><span>{t("hb.sim.coverage")}</span>
        <select value={data.hub.coverage.status} onChange={e => act("HUB_COVERAGE", { status: e.target.value })}>{["verified", "partial", "pending", "unknown"].map(v => <option key={v} value={v}>{t(`hb.cov.${v}`)}</option>)}</select>
      </label>
      <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={() => { reset(); setUi({ role: "cleaner" }); }}><Icon name="refresh" size={14} />{t("app.reset")}</button>
    </aside>
  );
}

/* ---------- shell ---------- */

export function CleanerHub({ onExit }) {
  const t = useT();
  const vp = useViewport();
  const { data, ui, setUi, cleanerId, device, view, tab, go } = useHub();
  const [simOpen, setSimOpen] = useState(false);
  const unread = unreadCount(data, cleanerId);
  const offers = scheduleFor(data, cleanerId).offers.filter(j => !j.offers.find(o => o.cleanerId === cleanerId)?.response).length;
  const main = useRef(null);
  useEffect(() => { main.current?.scrollTo?.(0, 0); }, [view.type, tab]);
  let body;
  if (view.type === "job") body = <JobView jobId={view.jobId} />;
  else if (view.type === "checklist") { const job = data.jobs.find(j => j.id === view.jobId); body = job ? <div className="hb-embed"><CleanerChecklist key={job.id} job={job} cleaner={cleaners.find(c => c.id === cleanerId)} /></div> : null; }
  else if (view.type === "offer") { const job = data.jobs.find(j => j.id === view.jobId); body = job ? <div className="hb-embed"><CleanerOffer key={job.id} job={job} cleaner={cleaners.find(c => c.id === cleanerId)} /></div> : null; }
  else if (view.type === "setup") body = <Setup />;
  else if (view.type === "install") body = <div className="hb-screen"><InstallGuide platform={device.platform} context={device.displayMode} installPrompt={device.platform === "android"} onInstalled={() => { setUi({ hubView: { type: "setup" } }); }} onSkip={() => go({ type: "tab" })} /></div>;
  else if (view.type === "onboarding") body = <Onboarding step={view.step || 0} />;
  else if (tab === "offers") body = <Offers />;
  else if (tab === "inbox") body = <div className="hb-screen"><header className="hb-hello"><h2>{t("hb.inbox.title")}</h2><p className="mw-sec">{t("hb.inbox.sub")}</p></header><NotificationCenter role="cleaner" cleanerId={cleanerId} onOpenJob={n => go(n.jobId ? { type: "job", jobId: n.jobId } : { type: "tab" })} /></div>;
  else if (tab === "account") body = <Account />;
  else body = <Agenda />;
  const sub = view.type !== "tab" && view.type !== "onboarding";
  return (
    <div className="hb-root" lang={ui.lang === "pt" ? "pt-BR" : ui.lang}>
      <div className="hb-stage">
        <div className={`hb-app${device.displayMode === "browser" ? " is-browser" : ""}`} role="application" aria-label={t("hb.appLabel")}>
          {device.displayMode === "browser" && <div className="hb-urlbar" aria-hidden="true"><Icon name="lock" size={11} />cleanflow.app</div>}
          <header className="hb-bar">
            {sub ? <button type="button" className="mw-linkbtn" onClick={() => go({ type: "tab" })}><Icon name="arrowL" size={16} />{t("c.back")}</button> : <span className="hb-brand"><span className="hb-logo">CF</span>{t("hb.brand")}</span>}
            <button type="button" className="hb-barchip" onClick={() => go({ type: "setup" })} aria-label={`${t("hb.acc.notifications")}: ${t(`dh.state.${deviceReadiness(device).state}`)}`}><ReadinessChip device={device} compact /></button>
          </header>
          <main ref={main} className="hb-main" id="hb-main">{body}</main>
          {view.type !== "onboarding" && (
            <nav className="hb-tabs" aria-label={t("hb.tabs")}>
              {TABS.map(([id, icon]) => (
                <button key={id} type="button" aria-current={tab === id && view.type === "tab" ? "page" : undefined} onClick={() => setUi({ hubTab: id, hubView: { type: "tab" } })}>
                  <Icon name={icon} size={22} />{t(`hb.tab.${id}`)}
                  {id === "inbox" && unread > 0 && <span className="mw-badge">{unread}</span>}
                  {id === "offers" && offers > 0 && <span className="mw-badge">{offers}</span>}
                </button>
              ))}
            </nav>
          )}
        </div>
        {(vp.xwide || simOpen) && <ScenarioPanel onClose={vp.xwide ? null : () => setSimOpen(false)} />}
      </div>
      <div className="hb-exit">
        {!vp.xwide && <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => setSimOpen(o => !o)} aria-pressed={simOpen}><Icon name="flask" size={14} />{t("hb.sim.open")}</button>}
        <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={onExit}><Icon name="arrowL" size={14} />{t("hb.exit")}</button>
      </div>
    </div>
  );
}


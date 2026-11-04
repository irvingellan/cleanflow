import { cleaners } from "../model/demoData.js";
import { attentionQueue, offerSummary } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { rangeFor } from "../model/time.js";
import { Icon } from "../ui/Icon.jsx";
import { Overlay, SimTag, dayWord, propertyOf, useT } from "../ui/kit.jsx";
import { deviceReadiness } from "./hubModel.js";

// Manager low-interruption view: "while you were away". It sorts what only the
// manager can decide from what the portal already answered. Nothing here is
// approved, sent or committed automatically.

const name = id => cleaners.find(c => c.id === id)?.name || "—";

export function awayItems(data) {
  const today = rangeFor("today", data.clock.date, data.clock.date);
  const offers = data.jobs.filter(j => j.status === "OFFERED");
  const interested = offers.filter(j => offerSummary(j).interested.length);
  const checklist = data.jobs.filter(j => j.checklist?.state === "submitted");
  const delivery = data.notifications.filter(n => !n.audience && (n.delivery?.accepted === false || n.delivery?.displayed === "generic" || n.delivery?.targets === 0));
  const cleanerDelivery = data.notifications.filter(n => n.audience && n.delivery?.targets === 0);
  const devices = data.deviceHealth.filter(d => !d.other && deviceReadiness(d).state !== "ready");
  const requests = data.requests.filter(r => r.status === "open");
  const urgent = [
    ...requests.filter(r => r.kind === "swap").map(r => ({ id: r.id, kind: "swap", r })),
    ...interested.map(j => ({ id: `i-${j.id}`, kind: "interest", job: j })),
    ...attentionQueue(data, today).filter(i => i.kind === "noCleanerToday").slice(0, 2).map(i => ({ id: `n-${i.job.id}`, kind: "noCleaner", job: i.job })),
  ];
  return { offers, interested, checklist, delivery, cleanerDelivery, devices, requests, urgent };
}

export function AwayCenter({ onClose }) {
  const t = useT();
  const { data, act, setUi } = useStore();
  const a = awayItems(data);
  const routine = data.hub.routine;
  const openJob = job => setUi({ overlay: null, selectedJobId: job.id, hybridScreen: "work", filter: "all" });
  const decide = (id, status) => act("REQUEST_DECIDE", { id, status }, { text: t("aw.recorded"), icon: "check" });
  const section = (key, count, children, tone = "neutral") => (
    <section className={`aw-sec tone-${tone}`} aria-labelledby={`aw-${key}`}>
      <h3 id={`aw-${key}`}><span>{t(`aw.s.${key}`)}</span><span className="mw-count">{count}</span></h3>
      {children}
    </section>
  );
  return (
    <Overlay title={t("aw.title")} onClose={onClose} wide>
      <p className="mw-sec">{t("aw.since", { time: t.stamp({ min: 6 * 60 }) })} <SimTag /></p>
      <div className="aw-digest">
        <div><strong className="tnum">{a.urgent.length}</strong><span>{t("aw.d.decide")}</span></div>
        <div><strong className="tnum">{routine.questionsAnswered}</strong><span>{t("aw.d.answered")}</span></div>
        <div><strong className="tnum">{a.devices.length + a.delivery.length}</strong><span>{t("aw.d.delivery")}</span></div>
        <div><strong className="tnum">{a.checklist.length}</strong><span>{t("aw.d.checklists")}</span></div>
      </div>
      {section("urgent", a.urgent.length, (
        <ul className="aw-list">
          {a.urgent.map(item => (
            <li key={item.id}>
              {item.kind === "swap" && <>
                <span className="mw-grow"><strong>{t("aw.swap", { name: name(item.r.from) })}</strong><span className="mw-sec">{t("aw.swapBody", { property: item.r.jobId ? propertyOf(data, data.jobs.find(j => j.id === item.r.jobId)).name : "—" })}</span></span>
                <span className="aw-actions"><button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => decide(item.r.id, "approved")}>{t("aw.approve")}</button><button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={() => decide(item.r.id, "declined")}>{t("aw.decline")}</button></span>
              </>}
              {item.kind === "interest" && <>
                <span className="mw-grow"><strong>{t("aw.interest", { property: propertyOf(data, item.job).name })}</strong><span className="mw-sec">{offerSummary(item.job).interested.map(o => name(o.cleanerId)).join(", ")} · {t("aw.interestBody")}</span></span>
                <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small" onClick={() => setUi({ overlay: { type: "assign", jobId: item.job.id } })}>{t("a.reviewOffers")}</button>
              </>}
              {item.kind === "noCleaner" && <>
                <span className="mw-grow"><strong>{t("aw.noCleaner", { property: propertyOf(data, item.job).name })}</strong><span className="mw-sec">{t("aw.noCleanerBody")}</span></span>
                <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => openJob(item.job)}>{t("inbox.open")}</button>
              </>}
            </li>
          ))}
          {!a.urgent.length && <li className="mw-sec">{t("aw.none")}</li>}
        </ul>
      ), a.urgent.length ? "attention" : "success")}
      {section("client", a.requests.filter(r => r.kind === "client").length, (
        <ul className="aw-list">{a.requests.filter(r => r.kind === "client").map(r => (
          <li key={r.id}><span className="mw-grow"><strong>{t("aw.client", { property: data.properties.find(p => p.id === r.property)?.name })}</strong><span className="mw-sec">{t("aw.clientBody", { day: dayWord(t, data, data.clock.date) })}</span></span>
            <span className="aw-actions"><button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => setUi({ overlay: { type: "newService" } })}>{t("aw.createService")}</button><button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={() => decide(r.id, "declined")}>{t("aw.notNow")}</button></span></li>
        ))}</ul>
      ))}
      {section("checklists", a.checklist.length, (
        <ul className="aw-list">{a.checklist.map(j => <li key={j.id}><span className="mw-grow"><strong>{propertyOf(data, j).name}</strong><span className="mw-sec">{t("aw.checklistBody", { name: name(j.cleanerIds[0]) })}</span></span><button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => setUi({ overlay: { type: "review", jobId: j.id } })}>{t("a.review")}</button></li>)}</ul>
      ))}
      {section("delivery", a.devices.length + a.delivery.length + a.cleanerDelivery.length, (
        <ul className="aw-list">
          {a.devices.map(d => <li key={d.id}><Icon name="phone" size={16} /><span className="mw-grow"><strong>{t(d.labelKey)}</strong><span className="mw-sec">{t(`dh.state.${deviceReadiness(d).state}`)} · {t(`dh.reason.${deviceReadiness(d).reasons[0]}`)}</span></span><button type="button" className="mw-linkbtn" onClick={() => setUi({ overlay: { type: "account", section: "notifications" }, mgrDevice: d.id })}>{t("aw.seeDevice")}</button></li>)}
          {a.delivery.map(n => <li key={n.id}><Icon name="bell" size={16} /><span className="mw-grow"><strong>{t(n.titleKey, n.params)}</strong><span className="mw-sec">{n.delivery.displayed === "generic" ? t("deliv.generic") : t("aw.deliveryRejected")}</span></span></li>)}
          {a.cleanerDelivery.map(n => <li key={n.id}><Icon name="bell" size={16} /><span className="mw-grow"><strong>{t("aw.cleanerNoDevice", { name: name(n.audience.cleanerId) })}</strong><span className="mw-sec">{t("aw.cleanerNoDeviceBody")}</span></span></li>)}
        </ul>
      ), "warning")}
      {section("answered", routine.questionsAnswered, (
        <p className="mw-sec">{t("aw.answeredBody", { views: routine.scheduleViews, answered: routine.questionsAnswered })} <SimTag /></p>
      ), "success")}
      {section("offers", a.offers.length, (
        <ul className="aw-list">{a.offers.map(j => { const s = offerSummary(j); return <li key={j.id}><span className="mw-grow"><strong>{propertyOf(data, j).name}</strong><span className="mw-sec">{t("cx.offerLong", { sent: s.sent, interested: s.interested.length, declined: s.declined.length, waiting: s.waiting.length })}</span></span><button type="button" className="mw-linkbtn" onClick={() => openJob(j)}>{t("inbox.open")}</button></li>; })}</ul>
      ))}
      <p className="mw-hint">{t("aw.never")}</p>
    </Overlay>
  );
}

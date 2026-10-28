import { useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState, Skeleton } from "../../../components/v2/primitives.jsx";
import { CATEGORIES, FILTERS, PUSH_SAMPLES, categoryOf, deliverySteps, filterNotifications } from "../model/notificationModel.js";
import { unreadCount } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { Icon } from "../ui/Icon.jsx";
import { Overlay, SimTag, dayWord, useT, useViewport } from "../ui/kit.jsx";

// Manager Notification Center (prototype). Everything here is synthetic:
// Production sends some pushes but does not keep this history yet.

const stepIcon = { done: "checkCircle", failed: "alertCircle", unknown: "info", notTracked: "minus" };

export function CategoryBadge({ category }) {
  const t = useT();
  return (
    <span className={`mw-catbadge is-${category.status}`}>
      <Icon name={category.status === "implemented" ? "check" : "spark"} size={12} />
      {t(`ncat.status.${category.status}`)}
    </span>
  );
}

export function DeliveryTimeline({ notification }) {
  const t = useT();
  return (
    <ol className="mw-deliv" aria-label={t("deliv.title")}>
      {deliverySteps(notification).map(s => (
        <li key={s.key} className={`is-${s.state}`}>
          <Icon name={stepIcon[s.state]} size={16} />
          <div>
            <strong>{t(`deliv.step.${s.key}`)}</strong>
            <span className="mw-sec">{t(`deliv.${s.key}.${s.state}`, { count: s.count, time: s.at ? t.stamp(s.at) : "" })}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function whenLabel(t, data, n) {
  return `${n.at.date === data.clock.date ? t("inbox.today") : dayWord(t, data, n.at.date)} · ${t.stamp(n.at)}`;
}

export function NotificationRow({ notification: n, selected, onSelect }) {
  const t = useT();
  const { data } = useStore();
  const cat = categoryOf(n);
  return (
    <li>
      <button type="button" data-nid={n.id} className={`mw-notif${n.read ? "" : " is-unread"}${selected ? " is-selected" : ""}`} aria-current={selected ? "true" : undefined} onClick={() => onSelect(n)}>
        <span className={`mw-notif-icon tone-${cat.tone}`}><Icon name={cat.icon} size={17} /></span>
        <span className="mw-grow">
          <span className="mw-notif-title">{!n.read && <span className="mw-unread-dot" aria-hidden="true" />}{!n.read && <span className="mw-visually-hidden">{t("inbox.new")}: </span>}{t(n.titleKey, n.params)}</span>
          <span className="mw-notif-meta">{whenLabel(t, data, n)} · {t(`ncat.${cat.id}`)}</span>
          {n.tappedBeforeRead && !n.read && <span className="mw-flag tone-info"><Icon name="history" size={14} />{t("inbox.tapped", { time: t.stamp(n.delivery.openedAt) })}</span>}
          {n.delivery.displayed === "generic" && <span className="mw-flag tone-attention"><Icon name="alert" size={14} />{t("deliv.generic")}</span>}
        </span>
        <Icon name="arrowR" size={16} />
      </button>
    </li>
  );
}

export function NotificationDetail({ notification: n, onBack, onOpenJob }) {
  const t = useT();
  const { data, act } = useStore();
  const cat = categoryOf(n);
  return (
    <article className="mw-ndetail" aria-labelledby={`nd-${n.id}`}>
      {onBack && <button type="button" className="mw-linkbtn mw-ndetail-back" onClick={onBack} data-autofocus><Icon name="arrowL" size={16} />{t("inbox.back")}</button>}
      <div className="mw-ndetail-head">
        <span className={`mw-notif-icon tone-${cat.tone}`}><Icon name={cat.icon} size={20} /></span>
        <div className="mw-grow">
          <span className="mw-micro mw-ndetail-cat">{t(`ncat.${cat.id}`)} <CategoryBadge category={cat} /></span>
          <h3 id={`nd-${n.id}`}>{t(n.titleKey, n.params)}</h3>
          <p className="mw-sec">{whenLabel(t, data, n)} · {t(`nsrc.${n.source || "system"}`)}</p>
        </div>
      </div>
      {n.bodyKey && <p className="mw-ndetail-body">{t(n.bodyKey, n.params)}</p>}
      {n.tappedBeforeRead && n.delivery.openedAt && <p className="mw-flag tone-info"><Icon name="history" size={14} />{t("inbox.tappedDetail", { time: t.stamp(n.delivery.openedAt) })}</p>}
      <div className="mw-ndetail-actions">
        {n.jobId && <button type="button" className="cfv2-button cfv2-button-primary mw-btn" onClick={() => onOpenJob(n)}>{t("inbox.open")}<Icon name="arrowR" size={16} /></button>}
        {n.read && <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={() => act("NOTIF_UNREAD", { id: n.id })}>{t("inbox.markUnread")}</button>}
      </div>
      <section className="mw-ndetail-section">
        <h4 className="mw-micro">{t("deliv.title")} <SimTag kind="proposal" /></h4>
        <DeliveryTimeline notification={n} />
        <p className="mw-hint">{t("deliv.honesty")}</p>
      </section>
      {n.simulated && <p className="mw-hint">{t("inbox.simulatedNote")}</p>}
    </article>
  );
}

function CategoryLegend() {
  const t = useT();
  return (
    <details className="mw-legend">
      <summary>{t("ncat.legend")}</summary>
      <p className="mw-hint">{t("ncat.legendNote")}</p>
      <ul>
        {CATEGORIES.map(c => (
          <li key={c.id}><Icon name={c.icon} size={15} /><span className="mw-grow">{t(`ncat.${c.id}`)}</span><CategoryBadge category={c} /></li>
        ))}
      </ul>
    </details>
  );
}

export function DeviceStatusCard({ onSettings }) {
  const t = useT();
  const { data } = useStore();
  const me = data.devices.find(d => d.current);
  const silent = data.devices.filter(d => d.status !== "ok");
  const perm = data.notificationSettings.permission;
  return (
    <section className={`mw-devcard${perm !== "granted" || silent.length ? " is-warn" : ""}`} aria-label={t("dev.title")}>
      <Icon name={perm === "granted" ? "phone" : "alertCircle"} size={18} />
      <div className="mw-grow">
        <strong>{perm === "granted" ? t("dev.thisOn") : t(`perm.${perm}.short`)}</strong>
        <span className="mw-sec">{me ? t("dev.ok", { time: `${dayWord(t, data, me.lastTest.date)} ${t.stamp(me.lastTest)}` }) : ""}{silent.length ? ` · ${t("dev.silentCount", { count: silent.length })}` : ""}</span>
      </div>
      {onSettings && <button type="button" className="mw-linkbtn" onClick={onSettings}>{t("dev.settings")}<Icon name="arrowR" size={14} /></button>}
    </section>
  );
}

/** The Notification Center. `split` shows list and detail side by side. */
export function NotificationCenter({ initialId = null, split = false }) {
  const t = useT();
  const { data, ui, setUi, act } = useStore();
  const [selectedId, setSelectedId] = useState(initialId);
  const filter = ui.notificationFilter;
  const query = ui.notificationQuery || "";
  const state = ui.inboxDemoState;
  const unread = unreadCount(data);
  const text = n => `${t(n.titleKey, n.params)} ${n.bodyKey ? t(n.bodyKey, n.params) : ""} ${t(`ncat.${categoryOf(n).id}`)}`;
  const list = filterNotifications(data.notifications, { filter, query, text });
  const selected = data.notifications.find(n => n.id === selectedId) || (split ? list[0] : null);
  // Reading the detail marks it read (only when the person chose it).
  useEffect(() => { if (selectedId && selected && !selected.read) act("NOTIF_READ", { id: selected.id }); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const root = useRef(null);
  const lastId = useRef(selectedId);
  // List and detail replace each other when not split: keep keyboard focus inside.
  useEffect(() => {
    if (split || lastId.current === selectedId) return;
    const target = selectedId ? root.current?.querySelector(".mw-ndetail-back") : root.current?.querySelector(`[data-nid="${lastId.current}"]`);
    target?.focus();
    lastId.current = selectedId;
  }, [selectedId, split]);
  const groups = [
    { key: "today", items: list.filter(n => n.at.date === data.clock.date) },
    { key: "earlier", items: list.filter(n => n.at.date !== data.clock.date) },
  ].filter(g => g.items.length);
  const openJob = n => {
    act("NOTIF_READ", { id: n.id });
    setUi({ selectedJobId: n.jobId, overlay: null, hybridScreen: "work", mobileTab: "services", filter: "all" });
  };
  const simulatePush = () => {
    const count = data.notifications.filter(n => n.simulated).length;
    const sample = PUSH_SAMPLES[count % PUSH_SAMPLES.length];
    const id = `push${Date.now()}`;
    act("NOTIF_PUSH_SIM", { sample, id });
    setUi({ overlay: null, pushBanner: { id }, mobileTab: ui.mobileTab === "inbox" ? "home" : ui.mobileTab });
  };
  const ready = state === "ready" || state === "offline";
  const listView = (
    <div className="mw-ncenter-list">
      <div className="mw-inbox-tools">
        <label className="mw-search mw-nsearch"><Icon name="search" size={16} /><span className="mw-visually-hidden">{t("inbox.search")}</span>
          <input type="search" value={query} placeholder={t("inbox.search")} onChange={e => setUi({ notificationQuery: e.target.value })} />
        </label>
        <div className="mw-chiprow mw-scrollrow" role="group" aria-label={t("f.label")}>
          {FILTERS.map(f => <button key={f} type="button" className="mw-chip" aria-pressed={filter === f} onClick={() => setUi({ notificationFilter: f })}>{t(`inbox.f.${f}`)}{f === "unread" && unread ? ` · ${unread}` : ""}</button>)}
        </div>
        <div className="mw-inbox-row">
          {unread > 0 ? <button type="button" className="mw-linkbtn" onClick={() => act("NOTIF_READ_ALL", {})}>{t("inbox.markAll")}</button> : <span />}
          <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={simulatePush}><Icon name="bell" size={15} />{t("push.simulate")}</button>
        </div>
      </div>
      {state === "offline" && <p className="mw-flag tone-attention mw-offline"><Icon name="alertCircle" size={15} />{t("inbox.offline")}</p>}
      {state === "loading" && <Skeleton label={t("inbox.loading")} rows={4} />}
      {state === "error" && <ErrorState title={t("inbox.error")} retryLabel={t("inbox.retry")} onRetry={() => setUi({ inboxDemoState: "ready" })} />}
      {state === "empty" && <EmptyState icon="info" title={t("inbox.empty")}>{t("inbox.emptyBody")}</EmptyState>}
      {ready && !groups.length && <EmptyState icon="search" title={t("inbox.emptyFilter")} />}
      {ready && groups.map(group => (
        <section key={group.key} className="mw-inbox-group" aria-label={t(`inbox.${group.key}`)}>
          <h3 className="mw-micro">{t(`inbox.${group.key}`)}</h3>
          <ul>{group.items.map(n => <NotificationRow key={n.id} notification={n} selected={split && selected?.id === n.id} onSelect={x => setSelectedId(x.id)} />)}</ul>
        </section>
      ))}
      <CategoryLegend />
      <DeviceStatusCard onSettings={() => setUi({ overlay: { type: "account", section: "notifications" } })} />
      <details className="mw-demo-states">
        <summary>{t("inbox.demoStates")}</summary>
        <div className="mw-chiprow">{["ready", "loading", "error", "empty", "offline"].map(s => <button key={s} type="button" className="mw-chip" aria-pressed={state === s} onClick={() => setUi({ inboxDemoState: s })}>{t(`inbox.state.${s}`)}</button>)}</div>
      </details>
    </div>
  );
  if (split) {
    return (
      <div className="mw-ncenter is-split">
        {listView}
        <div className="mw-ncenter-detail">{selected && ready ? <NotificationDetail notification={selected} onOpenJob={openJob} /> : <EmptyState icon="info" title={t("inbox.pick")} />}</div>
      </div>
    );
  }
  return <div ref={root} className="mw-ncenter">{selectedId && selected ? <NotificationDetail notification={selected} onBack={() => setSelectedId(null)} onOpenJob={openJob} /> : listView}</div>;
}

/** Name kept for the mobile tab. */
export function InboxContent() { return <NotificationCenter />; }

export function InboxSheet({ onClose, notificationId }) {
  const t = useT();
  const { data } = useStore();
  const vp = useViewport();
  const unread = unreadCount(data);
  return (
    <Overlay title={`${t("inbox.title")}${unread ? ` · ${t("inbox.unread", { count: unread })}` : ""}`} onClose={onClose} wide={vp.wide}>
      <p className="mw-sec mw-ncenter-sub">{t("inbox.subtitle")} <SimTag kind="proposal" /></p>
      <NotificationCenter initialId={notificationId} split={vp.wide} />
    </Overlay>
  );
}

/** System-like push banner shown when "Simulate push" is used. */
export function PushBanner() {
  const t = useT();
  const { data, ui, setUi, act } = useStore();
  const n = ui.pushBanner && data.notifications.find(x => x.id === ui.pushBanner.id);
  useEffect(() => {
    if (!n) return undefined;
    const timer = setTimeout(() => setUi({ pushBanner: null }), 12000);
    return () => clearTimeout(timer);
  }, [n?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!n) return null;
  const tap = () => {
    act("NOTIF_OPENED", { id: n.id });
    setUi({ pushBanner: null, selectedJobId: n.jobId, overlay: null, hybridScreen: "work", mobileTab: "services", filter: "all", toast: { id: Date.now(), text: t("push.openedToast"), icon: "bell" } });
  };
  return (
    <div className="mw-push" role="status" aria-live="polite">
      <button type="button" className="mw-push-card" onClick={tap}>
        <span className="mw-push-app" aria-hidden="true">CF</span>
        <span className="mw-grow">
          <span className="mw-push-top"><strong>CleanFlow</strong><span>{t("push.now")}</span></span>
          <span className="mw-push-title">{t(n.titleKey, n.params)}</span>
          {n.bodyKey && <span className="mw-push-body">{t(n.bodyKey, n.params)}</span>}
        </span>
      </button>
      <button type="button" className="mw-push-close" aria-label={t("push.dismiss")} onClick={() => setUi({ pushBanner: null })}><Icon name="x" size={14} /></button>
      <span className="mw-push-sim"><SimTag /> {t("push.simNote")}</span>
    </div>
  );
}

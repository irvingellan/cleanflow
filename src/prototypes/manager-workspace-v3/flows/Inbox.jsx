import { EmptyState, ErrorState, Skeleton } from "../../../components/v2/primitives.jsx";
import { unreadCount } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { Icon } from "../ui/Icon.jsx";
import { Overlay, SimTag, dayWord, useT } from "../ui/kit.jsx";

const typeIcon = { offer: "userCheck", issue: "alert", checklist: "clipCheck", summary: "list", test: "bell" };
const typeTone = { offer: "attention", issue: "risk", checklist: "attention", summary: "neutral", test: "neutral" };
const FILTERS = ["all", "unread", "offer", "checklist", "issue"];

function deliveryText(t, n) {
  const parts = [t("deliv.accepted")];
  if (n.delivery.displayed === "generic") parts.push(t("deliv.generic"));
  else parts.push(t(n.delivery.displayed === "confirmed" ? "deliv.confirmed" : "deliv.unknown"));
  if (n.delivery.openedAt) parts.push(t("deliv.opened", { time: t.stamp(n.delivery.openedAt) }));
  return parts.join(" · ");
}

export function InboxContent() {
  const t = useT();
  const { data, ui, setUi, act } = useStore();
  const filter = ui.notificationFilter;
  const list = data.notifications
    .filter(n => filter === "all" || (filter === "unread" ? !n.read : n.type === filter))
    .sort((a, b) => (a.at.date === b.at.date ? b.at.min - a.at.min : a.at.date < b.at.date ? 1 : -1));
  const groups = [
    { key: "today", items: list.filter(n => n.at.date === data.clock.date) },
    { key: "earlier", items: list.filter(n => n.at.date !== data.clock.date) },
  ].filter(g => g.items.length);
  const open = n => {
    act("NOTIF_READ", { id: n.id });
    if (n.jobId) setUi({ selectedJobId: n.jobId, overlay: null, hybridScreen: "work", mobileTab: "services", filter: "all" });
  };
  const state = ui.inboxDemoState;
  const unread = unreadCount(data);
  return (
    <div className="mw-inbox">
      <p className="mw-sec">{t("inbox.subtitle")}</p>
      <div className="mw-inbox-tools">
        <div className="mw-chiprow" role="group" aria-label={t("f.label")}>
          {FILTERS.map(f => <button key={f} type="button" className="mw-chip" aria-pressed={filter === f} onClick={() => setUi({ notificationFilter: f })}>{t(`inbox.f.${f}`)}{f === "unread" && unread ? ` · ${unread}` : ""}</button>)}
        </div>
        {unread > 0 && <button type="button" className="mw-linkbtn" onClick={() => act("NOTIF_READ_ALL", {})}>{t("inbox.markAll")}</button>}
      </div>
      {state === "loading" && <Skeleton label={t("inbox.loading")} rows={4} />}
      {state === "error" && <ErrorState title={t("inbox.error")} retryLabel={t("inbox.retry")} onRetry={() => setUi({ inboxDemoState: "ready" })} />}
      {state === "empty" && <EmptyState icon="info" title={t("inbox.empty")} />}
      {state === "ready" && !groups.length && <EmptyState icon="search" title={t("inbox.emptyFilter")} />}
      {state === "ready" && groups.map(group => (
        <section key={group.key} className="mw-inbox-group" aria-label={t(`inbox.${group.key}`)}>
          <h3 className="mw-micro">{t(`inbox.${group.key}`)}</h3>
          <ul>
            {group.items.map(n => (
              <li key={n.id} className={`mw-notif${n.read ? "" : " is-unread"}`}>
                <span className={`mw-notif-icon tone-${typeTone[n.type]}`}><Icon name={typeIcon[n.type]} size={17} /></span>
                <div className="mw-grow">
                  <p className="mw-notif-title">{!n.read && <span className="mw-unread-dot" aria-label={t("inbox.new")} />}{t(n.titleKey, n.params)}</p>
                  <p className="mw-notif-meta">{n.at.date === data.clock.date ? "" : `${dayWord(t, data, n.at.date)} · `}{t.stamp(n.at)} · {deliveryText(t, n)}{n.simulated ? ` · ${t("inbox.simulatedNote")}` : ""}</p>
                  {n.tappedBeforeRead && !n.read && <p className="mw-flag tone-info"><Icon name="info" size={14} />{t("inbox.tapped", { time: t.stamp(n.delivery.openedAt) })}</p>}
                  {n.delivery.displayed === "generic" && <p className="mw-flag tone-attention"><Icon name="alert" size={14} />{t("deliv.generic")}</p>}
                </div>
                {n.jobId ? <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => open(n)}>{t("inbox.open")}<Icon name="arrowR" size={15} /></button>
                  : !n.read && <button type="button" className="mw-iconbtn" aria-label={t("inbox.markAll")} onClick={() => act("NOTIF_READ", { id: n.id })}><Icon name="check" size={16} /></button>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="mw-diag" aria-label={t("inbox.diag")}>
        <h3 className="mw-micro">{t("inbox.diag")} <SimTag kind="proposal" /></h3>
        <p className="mw-hint">{t("inbox.diagNote")}</p>
        <ul>
          {data.devices.map(d => (
            <li key={d.id}>
              <Icon name="phone" size={17} />
              <span className="mw-grow"><strong>{t(d.labelKey)}</strong><span className={`mw-flag tone-${d.status === "ok" ? "success" : "warning"}`}>{d.status === "ok" ? t("dev.ok", { time: `${dayWord(t, data, d.lastTest.date)} ${t.stamp(d.lastTest)}` }) : t("dev.silent", { time: `${dayWord(t, data, d.lastTest.date)} ${t.stamp(d.lastTest)}` })}</span></span>
              <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={() => setUi({ toast: { id: Date.now(), text: t("dev.testSent"), icon: "bell" } })}>{t("dev.sendTest")}</button>
            </li>
          ))}
        </ul>
      </section>
      <details className="mw-demo-states">
        <summary>{t("inbox.demoStates")}</summary>
        <div className="mw-chiprow">{["ready", "loading", "error", "empty"].map(s => <button key={s} type="button" className="mw-chip" aria-pressed={state === s} onClick={() => setUi({ inboxDemoState: s })}>{t(`inbox.state.${s}`)}</button>)}</div>
      </details>
    </div>
  );
}

export function InboxSheet({ onClose }) {
  const t = useT();
  const { data } = useStore();
  return <Overlay title={`${t("inbox.title")}${unreadCount(data) ? ` · ${t("inbox.unread", { count: unreadCount(data) })}` : ""}`} onClose={onClose}><InboxContent /></Overlay>;
}

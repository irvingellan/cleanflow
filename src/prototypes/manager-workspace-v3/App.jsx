import { useEffect } from "react";
import { EnvironmentIndicator } from "../../components/v2/primitives.jsx";
import { CleanerPreview } from "./cleaner/CleanerViews.jsx";
import { InboxContent, InboxSheet, PushBanner } from "./flows/Inbox.jsx";
import { JobDetail, NextStep } from "./flows/JobPanel.jsx";
import { AssignSheet, CompleteSheet, IssueSheet, OfferComposer, ReminderSheet, ReviewSheet } from "./flows/OperationalSheets.jsx";
import { NewServiceSheet, PropertySheet } from "./flows/SetupSheets.jsx";
import { HybridNow, HybridWork, ModeA, ModeB, ModeC } from "./layouts/Modes.jsx";
import { Worklist } from "./layouts/Worklist.jsx";
import { unreadCount } from "./model/selectors.js";
import { StoreProvider, useStore } from "./model/store.js";
import { inRange } from "./model/time.js";
import { Icon } from "./ui/Icon.jsx";
import { DateNav, Overlay, Toast, propertyOf, useT, useViewport } from "./ui/kit.jsx";
import { StudioArea, StudioPanel, StudioProvider, useStudio } from "./studio/Studio.jsx";
import { AccountSheet } from "./flows/AccountSettings.jsx";
import { ReservationChangesSheet } from "./flows/ReservationChanges.jsx";
import "./prototype.css";

const MODES = ["hybrid", "a", "b", "c"];
// A host page may already pin a theme on <html>; honour it as the default.
const HOST_THEME = typeof document !== "undefined" ? document.documentElement.dataset.theme : undefined;

function useSystemTheme() {
  if (HOST_THEME === "light" || HOST_THEME === "dark") return HOST_THEME;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ModeSwitch({ compact }) {
  const t = useT();
  const { ui, setUi } = useStore();
  const label = m => (m === "hybrid" ? `${t("mode.hybrid")} · ${t("mode.recommended")}` : t(`mode.${m}`));
  if (compact) {
    return (
      <label className="mw-modeselect"><span className="mw-visually-hidden">{t("app.layout")}</span>
        <select value={ui.mode} onChange={e => setUi({ mode: e.target.value, overlay: null })}>{MODES.map(m => <option key={m} value={m}>{label(m)}</option>)}</select>
      </label>
    );
  }
  return (
    <div className="mw-modeswitch" role="group" aria-label={t("app.layout")}>
      {MODES.map(m => (
        <button key={m} type="button" aria-pressed={ui.mode === m} onClick={() => setUi({ mode: m, overlay: null })}>
          {m === "hybrid" ? <><Icon name="spark" size={15} />{t("mode.hybrid")}<span className="mw-rec">{t("mode.recommended")}</span></> : t(`mode.${m}`)}
        </button>
      ))}
    </div>
  );
}

function StudioToggle({ compact }) {
  const t = useT();
  const { studio, dispatch } = useStudio();
  return (
    <button type="button" className={`mw-studio-toggle${studio.enabled ? " is-on" : ""}`} aria-pressed={studio.enabled} onClick={() => dispatch({ type: "TOGGLE" })} title={t("ws.toggleHint")}>
      <Icon name="sliders" size={16} />{!compact && t("ws.toggle")}
    </button>
  );
}

function Header() {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const vp = useViewport();
  const unread = unreadCount(data);
  return (
    <header className="mw-header">
      <div className="mw-header-row">
        <div className="mw-brand"><span className="mw-wordmark">CleanFlow</span>{vp.xwide && <span className="mw-sec">{t("app.title")}</span>}</div>
        <ModeSwitch compact={!vp.wide} />
        <div className="mw-header-actions">
          <StudioToggle compact={vp.compact} />
          <StudioArea screen="header" region="bar" className="mw-header-tools" items={{
            newService: vp.compact ? null : <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small" onClick={() => setUi({ overlay: { type: "newService" } })}><Icon name="plus" size={16} />{t("app.newService")}</button>,
            bell: (
              <button type="button" className="mw-iconbtn mw-bell" aria-label={`${t("app.inbox")}${unread ? ` · ${t("inbox.unread", { count: unread })}` : ""}`} onClick={() => setUi({ overlay: { type: "inbox" } })}>
                <Icon name="bell" />{unread > 0 && <span className="mw-badge">{unread > 9 ? "9+" : unread}</span>}
              </button>
            ),
            cleanerView: vp.compact ? null : <button type="button" className="mw-iconbtn" aria-label={t("app.cleanerView")} title={t("app.cleanerView")} onClick={() => setUi({ cleanerView: { kind: "chooser" } })}><Icon name="phone" /></button>,
            account: (
              <button type="button" className="mw-account-btn" aria-label={t("acc.open")} onClick={() => setUi({ overlay: { type: "account" } })}>
                <span className="mw-avatar" aria-hidden="true">{t("acc.initials")}</span>{vp.xwide && <span>{t("acc.short")}</span>}
              </button>
            ),
          }} />
        </div>
      </div>
      <div className="mw-header-row mw-header-sub">
        <DateNav compact={vp.compact} />
        {ui.mode === "hybrid" && !vp.compact && (
          <div className="mw-screenswitch" role="tablist" aria-label={t("mode.hybrid")}>
            {["now", "work"].map(s => <button key={s} type="button" role="tab" aria-selected={ui.hybridScreen === s} onClick={() => setUi({ hybridScreen: s })}><Icon name={s === "now" ? "spark" : "list"} size={15} />{t(`hy.${s}`)}</button>)}
          </div>
        )}
        <div className="mw-demo"><EnvironmentIndicator>{vp.compact ? t("app.demoShort") : t("app.demo")}</EnvironmentIndicator>{!vp.compact && <span className="mw-sec tnum">{t("app.clock", { time: t.time(`${String(Math.floor(data.clock.minutes / 60)).padStart(2, "0")}:${String(data.clock.minutes % 60).padStart(2, "0")}`) })}</span>}</div>
      </div>
    </header>
  );
}

function MobileDetail({ job }) {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const property = propertyOf(data, job);
  return (
    <div className="mw-mobile-detail" role="dialog" aria-modal="true" aria-label={property.name}>
      <div className="mw-mobile-detail-bar">
        <button type="button" className="mw-linkbtn" onClick={() => setUi({ selectedJobId: null })} data-autofocus><Icon name="arrowL" size={16} />{t("c.back")}</button>
      </div>
      <div className="mw-mobile-detail-body"><JobDetail job={job} withNextStep={false} outOfRange={!inRange(job.date, ui.range)} /></div>
      <NextStep job={job} sticky />
    </div>
  );
}

function OverlaySwitch() {
  const { ui, data, setUi } = useStore();
  const close = () => setUi({ overlay: null });
  const o = ui.overlay;
  if (!o) return null;
  const job = o.jobId && data.jobs.find(j => j.id === o.jobId);
  switch (o.type) {
    case "assign": return <AssignSheet jobId={o.jobId} onClose={close} />;
    case "offer": return <OfferComposer jobId={o.jobId} onClose={close} />;
    case "remind": return <ReminderSheet jobId={o.jobId} fromAssign={o.fromAssign} onClose={close} />;
    case "review": return <ReviewSheet jobId={o.jobId} onClose={close} />;
    case "complete": return <CompleteSheet jobId={o.jobId} onClose={close} />;
    case "issue": return <IssueSheet jobId={o.jobId} onClose={close} />;
    case "property": return <PropertySheet propertyId={o.propertyId} onClose={close} />;
    case "newService": return <NewServiceSheet onClose={close} />;
    case "inbox": return <InboxSheet onClose={close} notificationId={o.notificationId} />;
    case "reservations": return <ReservationChangesSheet onClose={close} />;
    case "account": return <AccountSheet onClose={close} section={o.section} />;
    case "detail": return job ? <Overlay onClose={close} wide><JobDetail job={job} onClose={close} /></Overlay> : null;
    default: return null;
  }
}

function TabBar() {
  const t = useT();
  const { data, ui, setUi } = useStore();
  const unread = unreadCount(data);
  const tabs = [["home", ui.mode === "hybrid" ? "spark" : "home", ui.mode === "hybrid" ? "hy.now" : "tab.home"], ["services", "list", "tab.services"], ["inbox", "bell", "tab.inbox"], ["cleaner", "phone", "tab.cleaner"]];
  return (
    <nav className="mw-tabbar" aria-label={t("app.layout")}>
      {tabs.map(([id, icon, label]) => (
        <button key={id} type="button" className="mw-tab" aria-current={ui.mobileTab === id ? "page" : undefined}
          onClick={() => (id === "cleaner" ? setUi({ cleanerView: { kind: "chooser" } }) : setUi({ mobileTab: id, selectedJobId: null, hybridScreen: id === "services" ? "work" : "now" }))}>
          <Icon name={icon} size={22} />{t(label)}{id === "inbox" && unread > 0 && <span className="mw-badge">{unread}</span>}
        </button>
      ))}
    </nav>
  );
}

function Main() {
  const t = useT();
  const { ui } = useStore();
  const vp = useViewport();
  if (vp.compact && ui.mobileTab === "inbox") return <div className="mw-page"><h1 className="mw-pagetitle">{t("inbox.title")}</h1><InboxContent /></div>;
  if (vp.compact && ui.mobileTab === "services") return <Worklist />;
  if (ui.mode === "a") return <ModeA />;
  if (ui.mode === "b") return <ModeB />;
  if (ui.mode === "c") return <ModeC />;
  return ui.hybridScreen === "work" ? <HybridWork /> : <HybridNow />;
}

function Shell() {
  const t = useT();
  const { ui, data, setUi } = useStore();
  const vp = useViewport();
  const system = useSystemTheme();
  useEffect(() => { document.documentElement.dataset.theme = ui.theme || system; }, [ui.theme, system]);
  useEffect(() => { document.documentElement.lang = ui.lang === "pt" ? "pt-BR" : ui.lang; document.title = `CleanFlow · ${t("app.title")}`; }, [ui.lang]);
  useEffect(() => {
    const onKey = e => {
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        const field = document.getElementById("mw-command");
        if (field) { e.preventDefault(); field.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [ui.mode, ui.hybridScreen, ui.mobileTab]);
  const selected = data.jobs.find(j => j.id === ui.selectedJobId);
  const { studio } = useStudio();
  return (
    <div className={`mw-app mode-${ui.mode}${vp.compact ? " is-compact" : ""}${studio.enabled ? " has-studio" : ""}${studio.enabled && studio.view === "original" ? " is-original" : ""}`}>
      <a className="mw-skip" href="#mw-main">{t("app.skip")}</a>
      <Header />
      <main id="mw-main" className="mw-main">
        <Main />
      </main>
      {vp.compact && selected && !ui.overlay && !ui.cleanerView && <MobileDetail job={selected} />}
      <OverlaySwitch />
      {ui.cleanerView && <CleanerPreview view={ui.cleanerView} onClose={() => setUi({ cleanerView: null })} />}
      {vp.compact && <TabBar />}
      <PushBanner />
      {studio.enabled && <StudioPanel />}
      <Toast />
    </div>
  );
}

export function App({ initial, studioInitial }) {
  return <StoreProvider initial={initial}><StudioProvider initial={studioInitial}><Shell /></StudioProvider></StoreProvider>;
}

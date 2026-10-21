import { useEffect } from "react";
import { EnvironmentIndicator } from "../../components/v2/primitives.jsx";
import { CleanerPreview } from "./cleaner/CleanerViews.jsx";
import { InboxContent, InboxSheet } from "./flows/Inbox.jsx";
import { JobDetail, NextStep } from "./flows/JobPanel.jsx";
import { AssignSheet, CompleteSheet, IssueSheet, OfferComposer, ReminderSheet, ReviewSheet } from "./flows/OperationalSheets.jsx";
import { NewServiceSheet, PropertySheet } from "./flows/SetupSheets.jsx";
import { HybridNow, HybridWork, ModeA, ModeB, ModeC } from "./layouts/Modes.jsx";
import { Worklist } from "./layouts/Worklist.jsx";
import { LANGS } from "./model/messages.js";
import { unreadCount } from "./model/selectors.js";
import { StoreProvider, useStore } from "./model/store.js";
import { inRange } from "./model/time.js";
import { Icon } from "./ui/Icon.jsx";
import { DateNav, Overlay, Toast, propertyOf, useT, useViewport } from "./ui/kit.jsx";
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

function Settings({ compact }) {
  const t = useT();
  const { ui, setUi, reset } = useStore();
  const system = useSystemTheme();
  const theme = ui.theme || system;
  const controls = (
    <>
      <label className="mw-langselect"><Icon name="globe" size={16} /><span className="mw-visually-hidden">{t("app.language")}</span>
        <select value={ui.lang} onChange={e => setUi({ lang: e.target.value })}>{LANGS.map(l => <option key={l} value={l}>{l === "pt" ? "Português" : l === "en" ? "English" : "Español"}</option>)}</select>
      </label>
      <button type="button" className="mw-iconbtn" aria-label={t("app.theme")} onClick={() => setUi({ theme: theme === "dark" ? "light" : "dark" })}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
      <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={reset}><Icon name="refresh" size={15} />{t("app.reset")}</button>
    </>
  );
  return <details className="mw-menu"><summary className="mw-iconbtn" aria-label={t("c.more")}><Icon name="more" /></summary><div className="mw-menu-pop">{controls}</div></details>;
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
          {!vp.compact && <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small" onClick={() => setUi({ overlay: { type: "newService" } })}><Icon name="plus" size={16} />{t("app.newService")}</button>}
          <button type="button" className="mw-iconbtn mw-bell" aria-label={`${t("app.inbox")}${unread ? ` · ${t("inbox.unread", { count: unread })}` : ""}`} onClick={() => setUi({ overlay: { type: "inbox" } })}>
            <Icon name="bell" />{unread > 0 && <span className="mw-badge">{unread}</span>}
          </button>
          {!vp.compact && <button type="button" className="mw-iconbtn" aria-label={t("app.cleanerView")} title={t("app.cleanerView")} onClick={() => setUi({ cleanerView: { kind: "chooser" } })}><Icon name="phone" /></button>}
          <Settings compact={vp.compact} />
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
    case "inbox": return <InboxSheet onClose={close} />;
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
  return (
    <div className={`mw-app mode-${ui.mode}${vp.compact ? " is-compact" : ""}`}>
      <a className="mw-skip" href="#mw-main">{t("app.skip")}</a>
      <Header />
      <main id="mw-main" className="mw-main">
        <Main />
      </main>
      {vp.compact && selected && !ui.overlay && !ui.cleanerView && <MobileDetail job={selected} />}
      <OverlaySwitch />
      {ui.cleanerView && <CleanerPreview view={ui.cleanerView} onClose={() => setUi({ cleanerView: null })} />}
      {vp.compact && <TabBar />}
      <Toast />
    </div>
  );
}

export function App({ initial }) {
  return <StoreProvider initial={initial}><Shell /></StoreProvider>;
}

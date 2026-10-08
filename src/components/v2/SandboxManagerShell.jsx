import { useEffect, useRef, useState } from "react";
import { Button, EnvironmentIndicator, Icon, IconButton } from "./primitives.jsx";
import { shellText } from "./shellMessages.js";
import { rememberShellPilot, shellComparisonHref, shellPilotEnabled } from "./shellPilot.js";
import "./shell.css";

const topViews = new Set(["dashboard", "job-list", "property-list", "cleaner-list", "client-list", "payout-list", "dev-center", "load-time-diagnostics", "sandbox-lifecycle-preview"]);

// Only imported by the dedicated Sandbox build. Existing content and utilities
// are passed unchanged; no provider, authorization, routing or mutation logic.
export function SandboxManagerShell(props) {
  const { authorized, language, legacyHeader, foundationClass, children } = props;
  let storage;
  try { storage = window.sessionStorage; } catch { /* explicit query still works */ }
  const enabled = shellPilotEnabled({ mode: import.meta.env.MODE, authorized, search: location.search, storage });
  useEffect(() => {
    const choice = new URLSearchParams(location.search).get("shell");
    if (authorized && ["v2", "current"].includes(choice)) rememberShellPilot(choice, storage);
  }, [authorized]);
  if (!enabled) return <main className="app-shell"><section className={foundationClass} aria-labelledby="page-title">
    {legacyHeader}
    {authorized && <a className="button button--small" href={shellComparisonHref(location.search, "v2")}>
      {shellText(language, "pilot")}
    </a>}
    {children}
  </section></main>;
  return <V2ManagerShell {...props} />;
}

export function V2ManagerShell({ language, translate, destinations, activeSection, view, utilities, foundationClass, children, integratedComparison = false }) {
  const t = key => shellText(language, key);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("cleanflow-v2-sidebar-collapsed") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("cleanflow-v2-sidebar-collapsed", String(collapsed)); } catch { /* presentation works without storage */ }
  }, [collapsed]);
  const [surface, setSurface] = useState(null);
  const overlay = useRef(null), opener = useRef(null), close = useRef(null);
  const detail = !topViews.has(view);
  const groups = ["daily", "directory", "money", "internal"];
  useEffect(() => { setSurface(null); }, [view]);
  useEffect(() => {
    if (!surface) return;
    const previous = opener.current;
    close.current?.focus();
    function keydown(event) {
      // Existing Feedback/What's New dialogs retain their own Escape/focus.
      if ([...document.querySelectorAll('[role="dialog"]')].some(node => node !== overlay.current && node.getClientRects().length)) return;
      if (event.key === "Escape") { event.preventDefault(); setSurface(null); }
      if (event.key !== "Tab") return;
      const targets = [...overlay.current.querySelectorAll("a[href],button,input,select,textarea,[tabindex]")]
        .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
      if (!targets.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === targets[0]) { event.preventDefault(); targets.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === targets.at(-1)) { event.preventDefault(); targets[0].focus(); }
    }
    document.addEventListener("keydown", keydown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus(); };
  }, [surface]);
  function open(event, next) { opener.current = event.currentTarget; setSurface(next); }
  function navigationItem(item, rail = false) {
    const label = item.key === "jobs" ? t("services") : translate(item.labelKey);
    const current = item.key === "diagnostics" ? view === "load-time-diagnostics"
      : item.key === "dev-center" ? activeSection === "dev-center" && view !== "load-time-diagnostics" : item.key === activeSection;
    const shared = { className: "cfv2-shell-destination", "aria-current": current ? "page" : undefined, title: label, "aria-label": label };
    const contents = <><Icon name={item.icon} /><span className={rail ? "cfv2-shell-nav-text" : undefined}>{label}</span></>;
    return item.href ? <a key={item.key} {...shared} href={item.href}>{contents}</a>
      : <Button key={item.key} {...shared} variant="tertiary" onClick={() => { setSurface(null); item.onClick(); }}>{contents}</Button>;
  }
  const mobileItems = destinations.filter(item => ["dashboard", "jobs", "properties"].includes(item.key))
    .sort((a, b) => ["dashboard", "jobs", "properties"].indexOf(a.key) - ["dashboard", "jobs", "properties"].indexOf(b.key));
  return <div className={`cfv2-shell${collapsed ? " cfv2-shell-collapsed" : ""}${detail ? " cfv2-shell-detail" : ""}`}>
    <a className="cfv2-shell-skip" href="#cfv2-main">{t("skip")}</a>
    <aside className="cfv2-shell-sidebar" aria-label={translate("common.mainNavigation")} inert={surface ? true : undefined}>
      <div className="cfv2-shell-brand"><strong>CleanFlow</strong><IconButton icon="chevron" label={t(collapsed ? "expand" : "collapse")} onClick={() => setCollapsed(value => !value)} /></div>
      <EnvironmentIndicator>{t("sandbox")}</EnvironmentIndicator>
      <nav aria-label={translate("common.mainNavigation")}>
        {groups.map(group => {
          const items = destinations.filter(item => item.group === group);
          return items.length ? <section className={`cfv2-shell-group cfv2-shell-group-${group}`} key={group} aria-label={t(group)}>
            <h2>{t(group)}</h2>{items.map(item => navigationItem(item, true))}
          </section> : null;
        })}
      </nav>
      <Button variant="tertiary" icon="user" className="cfv2-shell-account-trigger" aria-label={t("account")} title={t("account")} aria-expanded={surface === "account"} aria-controls="cfv2-shell-utilities" onClick={event => open(event, "account")}><span>{t("account")}</span></Button>
    </aside>
    <main id="cfv2-main" tabIndex={-1} className="cfv2-shell-main" inert={surface ? true : undefined}>
      <header className="cfv2-shell-mobile-header"><strong>CleanFlow</strong>{detail && <IconButton icon="menu" label={t("more")} onClick={event => open(event, "more")} aria-expanded={surface === "more"} />}</header>
      <div className={`cfv2-shell-content ${foundationClass}`}>{children}</div>
    </main>
    {!detail && <nav className="cfv2-shell-tabs" aria-label={translate("common.mainNavigation")} inert={surface ? true : undefined}>
      {mobileItems.map(item => navigationItem(item))}
      <Button variant="tertiary" icon="menu" aria-current={!["dashboard", "jobs", "properties"].includes(activeSection) ? "page" : undefined} aria-expanded={surface === "more"} aria-controls="cfv2-shell-utilities" onClick={event => open(event, "more")}>{t("more")}</Button>
    </nav>}
    <div className="cfv2-shell-scrim" hidden={!surface} onMouseDown={event => { if (event.target === event.currentTarget) setSurface(null); }}>
      <section ref={overlay} id="cfv2-shell-utilities" className="cfv2-shell-overlay" role={surface ? "dialog" : undefined} aria-modal={surface ? "true" : undefined} aria-labelledby="cfv2-shell-overlay-title">
        <header><h2 id="cfv2-shell-overlay-title">{t(surface === "more" ? "more" : "account")}</h2><button ref={close} className="cfv2-button cfv2-button-icon" type="button" aria-label={t("close")} onClick={() => setSurface(null)}><Icon name="close" /></button></header>
        {surface === "more" && <nav aria-label={translate("common.mainNavigation")}>{groups.map(group => {
          const items = destinations.filter(item => item.group === group && !["dashboard", "jobs", "properties"].includes(item.key));
          return items.length ? <section key={group} className={`cfv2-shell-group cfv2-shell-group-${group}`}><h2>{t(group)}</h2>{items.map(item => navigationItem(item))}</section> : null;
        })}</nav>}
        <div className="cfv2-shell-utilities">{utilities}</div>
        {!integratedComparison && <section className="cfv2-shell-group cfv2-shell-group-internal"><h2>{t("compare")}</h2><a className="cfv2-shell-destination" href={shellComparisonHref(location.search, "current")}><Icon name="flask" />{t("current")}</a></section>}
      </section>
    </div>
  </div>;
}

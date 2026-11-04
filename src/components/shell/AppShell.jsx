import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../Icon.jsx";
import { useMediaQuery } from "./useMediaQuery.js";

export const compactShellQuery = "(max-width: 719px)";

/**
 * Manager application shell. Presentation only: every destination and control
 * arrives as props with the existing handlers; the shell owns no business state.
 *
 * - ≥1100 px: forest sidebar with labels.
 * - 720–1099 px: the same sidebar as an icon rail with short labels.
 * - <720 px: top bar + bottom tabs (first destinations) + "More" sheet.
 * Only one navigation landmark is rendered at a time.
 */
export function AppShell({
  brandName,
  navigationLabel,
  items,
  primaryAction,
  inbox,
  account,
  accountPanel,
  moreLabel,
  closeLabel,
  mobileTabKeys = [],
  width = "standard",
  children,
}) {
  const isCompact = useMediaQuery(compactShellQuery);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const accountRef = useRef(null);
  const accountButtonRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!isAccountOpen) return undefined;
    function onKey(event) {
      if (event.key === "Escape" && !document.querySelector('[aria-modal="true"]:not(.cf-sheet)')) {
        setIsAccountOpen(false);
        accountButtonRef.current?.focus();
      }
    }
    function onPointer(event) {
      if (accountRef.current?.contains(event.target) || accountButtonRef.current?.contains(event.target)) return;
      // Dialogs opened from the panel (feedback, what's new) render inside it.
      setIsAccountOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [isAccountOpen]);

  useEffect(() => {
    if (!isMoreOpen) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setIsMoreOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMoreOpen]);

  const tabItems = items.filter((item) => mobileTabKeys.includes(item.key));
  const moreItems = items.filter((item) => !mobileTabKeys.includes(item.key));
  const isMoreActive = moreItems.some((item) => item.active);

  function choose(item) {
    setIsMoreOpen(false);
    setIsAccountOpen(false);
    item.onSelect();
  }

  const accountButton = (
    <button
      ref={accountButtonRef}
      className="cf-account-button"
      type="button"
      aria-expanded={isAccountOpen}
      aria-controls={panelId}
      aria-label={account.label}
      onClick={() => setIsAccountOpen((open) => !open)}
    >
      <span className="cf-avatar" aria-hidden="true">{account.initials}</span>
      <span className="cf-account-button__text">
        <strong>{account.name}</strong>
        {account.detail && <span>{account.detail}</span>}
      </span>
      <Icon name="more" className="cf-account-button__more" />
    </button>
  );

  const inboxButton = inbox && (
    <button
      className={`cf-nav-item cf-nav-item--inbox${inbox.active ? " is-active" : ""}`}
      type="button"
      aria-current={inbox.active ? "page" : undefined}
      onClick={() => { setIsMoreOpen(false); inbox.onSelect(); }}
    >
      <span className="cf-nav-item__icon"><Icon name="inbox" size={20} />{inbox.badge}</span>
      <span className="cf-nav-item__label">
        <span className="cf-label-full">{inbox.label}</span>
        {inbox.shortLabel && <span className="cf-label-short">{inbox.shortLabel}</span>}
      </span>
    </button>
  );

  return (
    <div className={`cf-app cf-app--${isCompact ? "compact" : "wide"}`}>
      {!isCompact && (
        <aside className="cf-sidebar">
          <div className="cf-brand">
            <span className="cf-brand__mark" aria-hidden="true"><Icon name="broom" size={18} /></span>
            <h1 id="page-title" className="cf-brand__name">{brandName}</h1>
          </div>
          {primaryAction && (
            <button className="cf-sidebar__primary" type="button" onClick={primaryAction.onSelect}>
              <Icon name="plus" size={18} />
              <span>{primaryAction.label}</span>
            </button>
          )}
          <nav className="cf-nav" aria-label={navigationLabel}>
            {items.map((item) => (
              <button
                key={item.key}
                className={`cf-nav-item${item.active ? " is-active" : ""}${item.subtle ? " cf-nav-item--subtle" : ""}`}
                type="button"
                aria-current={item.active ? "page" : undefined}
                title={item.label}
                onClick={() => choose(item)}
              >
                <span className="cf-nav-item__icon"><Icon name={item.icon} size={20} /></span>
                <span className="cf-nav-item__label">{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="cf-sidebar__footer">
            {inboxButton}
            {accountButton}
          </div>
        </aside>
      )}

      {isCompact && (
        <header className="cf-topbar">
          <div className="cf-brand">
            <span className="cf-brand__mark" aria-hidden="true"><Icon name="broom" size={16} /></span>
            <h1 id="page-title" className="cf-brand__name">{brandName}</h1>
          </div>
          <div className="cf-topbar__actions">
            {primaryAction && (
              <button className="cf-topbar__icon" type="button" aria-label={primaryAction.label} onClick={primaryAction.onSelect}>
                <Icon name="plus" size={20} />
              </button>
            )}
            {accountButton}
          </div>
        </header>
      )}

      <div
        ref={accountRef}
        id={panelId}
        className={`cf-account-panel${isCompact ? " cf-account-panel--sheet" : ""}`}
        hidden={!isAccountOpen}
      >
        <div className="cf-account-panel__identity">
          <span className="cf-avatar cf-avatar--large" aria-hidden="true">{account.initials}</span>
          <span><strong>{account.name}</strong>{account.detail && <span>{account.detail}</span>}</span>
          <button className="cf-icon-button" type="button" aria-label={closeLabel} onClick={() => setIsAccountOpen(false)}>
            <Icon name="x" />
          </button>
        </div>
        {accountPanel}
      </div>
      {isCompact && isAccountOpen && <div className="cf-scrim" aria-hidden="true" onClick={() => setIsAccountOpen(false)} />}

      <main className={`cf-main cf-main--${width}`}>
        <div className="cf-main__inner">{children}</div>
      </main>

      {isCompact && (
        <nav className="cf-tabbar" aria-label={navigationLabel}>
          {tabItems.map((item) => (
            <button
              key={item.key}
              className={`cf-tab${item.active ? " is-active" : ""}`}
              type="button"
              aria-current={item.active ? "page" : undefined}
              onClick={() => choose(item)}
            >
              <Icon name={item.icon} size={22} />
              <span>{item.shortLabel || item.label}</span>
            </button>
          ))}
          {inbox && (
            <button
              className={`cf-tab${inbox.active ? " is-active" : ""}`}
              type="button"
              aria-current={inbox.active ? "page" : undefined}
              onClick={() => { setIsMoreOpen(false); inbox.onSelect(); }}
            >
              <span className="cf-tab__icon"><Icon name="inbox" size={22} />{inbox.badge}</span>
              <span>{inbox.shortLabel || inbox.label}</span>
            </button>
          )}
          <button
            className={`cf-tab${isMoreActive || isMoreOpen ? " is-active" : ""}`}
            type="button"
            aria-expanded={isMoreOpen}
            onClick={() => setIsMoreOpen((open) => !open)}
          >
            <Icon name="menu" size={22} />
            <span>{moreLabel}</span>
          </button>
        </nav>
      )}

      {isCompact && isMoreOpen && (
        <>
          <div className="cf-scrim" aria-hidden="true" onClick={() => setIsMoreOpen(false)} />
          <div className="cf-sheet" role="dialog" aria-modal="true" aria-label={moreLabel}>
            <div className="cf-sheet__handle" aria-hidden="true" />
            <div className="cf-sheet__list">
              {moreItems.map((item) => (
                <button
                  key={item.key}
                  className={`cf-sheet__item${item.active ? " is-active" : ""}`}
                  type="button"
                  aria-current={item.active ? "page" : undefined}
                  onClick={() => choose(item)}
                >
                  <Icon name={item.icon} size={20} />
                  <span>{item.label}</span>
                  <Icon name="chevronR" size={16} className="cf-sheet__chevron" />
                </button>
              ))}
            </div>
            <button className="button cf-sheet__close" type="button" onClick={() => setIsMoreOpen(false)}>{closeLabel}</button>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useId, useRef } from "react";
import "./primitives.css";

const classes = (...values) => values.filter(Boolean).join(" ");
const iconPaths = {
  check: "m5 12 4 4 10-10", close: "m6 6 12 12M18 6 6 18",
  info: "M12 11v6M12 7h.01", warning: "m12 3 10 18H2L12 3Zm0 5v5m0 3h.01",
  clock: "M12 7v5l3 2", search: "m16 16 5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  lock: "M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4", chevron: "m9 5 7 7-7 7",
  arrow: "M4 12h16m-6-6 6 6-6 6", refresh: "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-3l1 3M4 16l1 3a8 8 0 0 0 14-3",
  flask: "M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10", user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3",
  minus: "M7 12h10", send: "m3 3 18 8-9 3-3 7-6-18Zm0 0 9 11",
};
export function Icon({ name = "info", className }) {
  return <svg className={classes("cfv2-icon", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {["info", "clock", "minus"].includes(name) && <circle cx="12" cy="12" r="9" />}
    <path d={iconPaths[name] || iconPaths.info} />
  </svg>;
}
const toneIcons = { neutral: "minus", brand: "check", info: "send", attention: "info", warning: "warning", risk: "warning", success: "check", sandbox: "flask" };
function State({ form, tone = "neutral", icon, children }) {
  return <span className={`cfv2-state cfv2-${form} cfv2-tone-${tone}`}><Icon name={icon || toneIcons[tone] || "info"} />{children}</span>;
}
export const StateLabel = props => <State form="state-label" {...props} />;
export const StatusPill = props => <State form="status-pill" {...props} />;
export const InlineFlag = props => <State form="inline-flag" {...props} />;
export function Tag({ children }) { return <span className="cfv2-tag">{children}</span>; }
export function Count({ children }) { return <span className="cfv2-count">{children}</span>; }
export function Avatar({ initials, label }) { return <span className="cfv2-avatar" role="img" aria-label={label}>{initials}</span>; }
export function EnvironmentIndicator({ children, environment = "sandbox" }) {
  return <span className={classes("cfv2-environment", environment === "sandbox" && "cfv2-tone-sandbox")}>
    {environment === "sandbox" && <Icon name="flask" />}{children}</span>;
}

export function Button({ children, variant = "primary", size = "normal", icon, busy = false, blockedReason, disabled, onClick, className, ...rest }) {
  return <button {...rest} type={rest.type || "button"} className={classes("cfv2-button", `cfv2-button-${variant}`, `cfv2-button-${size}`, blockedReason && "cfv2-button-blocked", className)} disabled={disabled || busy} aria-busy={busy || undefined} aria-disabled={blockedReason ? true : undefined} onClick={event => { if (!blockedReason && !busy && !disabled) onClick?.(event); }}>
    {(icon || busy || blockedReason) && <Icon name={blockedReason ? "lock" : busy ? "refresh" : icon} />}{blockedReason || children}
  </button>;
}
export function IconButton({ label, icon, ...rest }) { return <Button {...rest} variant="icon" icon={icon} aria-label={label} />; }

export function Panel({ title, actions, children, className }) { return <section className={classes("cfv2-panel", className)}>{(title || actions) && <header className="cfv2-panel-header">{title && <h2>{title}</h2>}{actions}</header>}<div className="cfv2-panel-body">{children}</div></section>; }
export function Card({ children, selected = false, subtle = false }) { return <div className={classes("cfv2-card", selected && "cfv2-selected", subtle && "cfv2-subtle")}>{children}</div>; }
export function Row({ children, onClick, selected = false, dense = false, action, elementRef, ...attributes }) {
  const rowClass = classes("cfv2-row", selected && "cfv2-selected", dense && "cfv2-row-dense");
  return <div className="cfv2-row-shell">{onClick ? <button {...attributes} ref={elementRef} type="button" className={rowClass} onClick={onClick} aria-pressed={selected}>{children}</button> : <div {...attributes} ref={elementRef} className={rowClass}>{children}</div>}{action}</div>;
}
export function Banner({ tone = "info", title, children, action, role }) { return <div className={`cfv2-banner cfv2-tone-${tone}`} role={role}><Icon name={toneIcons[tone]} /><div><strong>{title}</strong>{children && <div className="cfv2-secondary">{children}</div>}</div>{action}</div>; }

function Field({ label, helper, error, id, children }) {
  return <div className="cfv2-field"><label htmlFor={id}>{label}</label>{children}{(error || helper) && <span id={`${id}-hint`} className={classes("cfv2-field-hint", error && "cfv2-field-error")} role={error ? "alert" : undefined}>{error || helper}</span>}</div>;
}
export function TextField({ label, helper, error, id: suppliedId, ...rest }) {
  const generated = useId(); const id = suppliedId || generated;
  return <Field {...{ label, helper, error, id }}><input {...rest} id={id} className="cfv2-input" aria-invalid={Boolean(error)} aria-describedby={error || helper ? `${id}-hint` : undefined} /></Field>;
}
export function SearchField({ label, value, onChange, clearLabel }) {
  const id = useId();
  return <Field label={label} id={id}><div className="cfv2-search"><Icon name="search" /><input id={id} type="search" value={value} onChange={onChange} className="cfv2-input" />{value && <IconButton icon="close" label={clearLabel} onClick={() => onChange({ target: { value: "" } })} />}</div></Field>;
}
export function Select({ label, options, helper, error, id: suppliedId, ...rest }) {
  const generated = useId(); const id = suppliedId || generated;
  return <Field {...{ label, helper, error, id }}><select {...rest} className="cfv2-input" id={id} aria-invalid={Boolean(error)} aria-describedby={error || helper ? `${id}-hint` : undefined}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>;
}
export function SegmentedControl({ label, options, value, onChange }) {
  return <div className="cfv2-segmented" role="group" aria-label={label}>{options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
export function FilterChip({ children, selected, onClick, icon }) { return <Button variant="secondary" size="small" icon={icon} className={selected ? "cfv2-selected" : undefined} aria-pressed={selected} onClick={onClick}>{children}</Button>; }
export function FilterToken({ children, removeLabel, onRemove }) { return <span className="cfv2-filter-token">{children}<IconButton icon="close" label={removeLabel} onClick={onRemove} /></span>; }
export function Checkbox({ label, ...rest }) { return <label className="cfv2-choice"><input {...rest} type="checkbox" />{label}</label>; }
export function Radio({ label, ...rest }) { return <label className="cfv2-choice"><input {...rest} type="radio" />{label}</label>; }

export function Disclosure({ title, children, defaultOpen = false }) { return <details className="cfv2-disclosure" open={defaultOpen || undefined}><summary><Icon name="chevron" />{title}</summary><div className="cfv2-disclosure-body">{children}</div></details>; }
export function TechnicalDetails({ title, children }) { return <Disclosure title={title}><div className="cfv2-technical">{children}</div></Disclosure>; }
export function ConsequenceDisclosure({ title, will, willNot }) { return <div className="cfv2-consequences"><strong>{title}</strong><ul>{will.map(line => <li key={line}><Icon name="check" />{line}</li>)}{willNot.map(line => <li key={line}><Icon name="minus" />{line}</li>)}</ul></div>; }
export function BeforeAfterDiff({ label, beforeLabel, afterLabel, before, after }) { return <div className="cfv2-diff"><strong>{label}</strong><div className="cfv2-diff-grid"><Card subtle><StateLabel>{beforeLabel}</StateLabel><p>{before}</p></Card><Card selected><StateLabel tone="attention">{afterLabel}</StateLabel><p>{after}</p></Card></div></div>; }
export function ConfirmationSheet({ open, title, children, confirmLabel, cancelLabel, onConfirm, onCancel, danger = false, busy = false }) {
  const ref = useRef(null); const safe = useRef(null); const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open) return;
    const previous = document.activeElement;
    dialog.showModal(); safe.current?.focus();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  function containFocus(event) {
    if (event.key !== "Tab") return;
    const targets = [...ref.current.querySelectorAll("button, input, select, textarea, a[href], [tabindex]")].filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
    const first = targets[0]; const last = targets.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <dialog ref={ref} className="cfv2-confirmation" aria-labelledby={titleId} onKeyDown={containFocus} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={titleId}>{title}</h2>{children}<div className="cfv2-confirmation-actions"><Button variant={danger ? "danger-solid" : "primary"} busy={busy} onClick={onConfirm}>{confirmLabel}</Button><button ref={safe} className="cfv2-button cfv2-button-secondary" type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button></div>
  </dialog>;
}

export function Skeleton({ label, rows = 3 }) { return <div className="cfv2-skeleton" role="status" aria-label={label} aria-busy="true">{Array.from({ length: rows }, (_, i) => <div className="cfv2-skeleton-row" key={i}><span /><span /><span /></div>)}</div>; }
export function SyncLine({ status = "updated", children }) { return <span role="status" aria-live="polite" className={classes("cfv2-sync", status === "stale" && "cfv2-tone-attention")}><Icon name={status === "updating" ? "refresh" : status === "stale" ? "info" : "check"} />{children}</span>; }
export const StaleIndicator = props => <SyncLine status="stale" {...props} />;
export function EmptyState({ title, children, action, icon = "search" }) { return <div className="cfv2-empty"><Icon name={icon} /><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>; }
export function ErrorState({ title, children, retryLabel, onRetry, busy = false }) { return <Banner tone="risk" title={title} role="alert" action={<Button variant="secondary" icon="refresh" busy={busy} onClick={onRetry}>{retryLabel}</Button>}>{children}</Banner>; }
export function StickyMobileAction({ children, label, keyboardOpen = false }) { return <div className="cfv2-sticky-space"><div className="cfv2-sticky" hidden={keyboardOpen}>{label && <span className="cfv2-sticky-label">{label}</span>}{children}</div></div>; }

// Consumes already-computed serviceLifecyclePresentation output, never derives history.
export function LifecycleRail({ presentation, translate, stateLabels, compact = false, markers = false }) {
  const symbols = { completed: "✓", current: "●", future: "·", skipped: "–", "unknown-past": "?" };
  return <div className={classes("cfv2-lifecycle", compact && "cfv2-lifecycle-compact", markers && "cfv2-lifecycle-markers")}><div className="cfv2-lifecycle-stages" role="list">{presentation.lifecycle.stages.map(stage => <div key={stage.status} role="listitem" aria-current={stage.state === "current" ? "step" : undefined} className={`cfv2-lifecycle-stage cfv2-lifecycle-${stage.state}`}><span aria-hidden="true">{markers ? symbols[stage.state] : null}</span><span className={compact ? "cfv2-sr-only" : undefined}>{translate(stage.labelKey)} · {stateLabels[stage.state]}</span></div>)}</div>{compact && <strong>{translate(presentation.lifecycle.statusKey)}</strong>}</div>;
}

import { useEffect, useId, useRef, useState } from "react";
import { StateLabel, StatusPill } from "../../../components/v2/primitives.jsx";
import { cleaners } from "../model/demoData.js";
import { money, translate } from "../model/messages.js";
import { STAGES, attentionFor, offerSummary, stageIndex, statusOf } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { dayDiff, formatDay, formatTime, hhmm, rangeFor, shiftRange } from "../model/time.js";
import { Icon } from "./Icon.jsx";

export const cleanerById = Object.fromEntries(cleaners.map(c => [c.id, c]));
export const cleanerName = id => cleanerById[id]?.name || id;

export function useT() {
  const { ui } = useStore();
  const t = (key, params) => translate(ui.lang, key, params);
  t.lang = ui.lang;
  t.day = (key, style) => formatDay(key, ui.lang, style);
  t.time = value => formatTime(value, ui.lang);
  t.stamp = stamp => (stamp ? formatTime(hhmm(stamp.min), ui.lang) : "");
  t.money = amount => money(amount, ui.lang);
  return t;
}

export function useViewport() {
  const read = () => (typeof window === "undefined" ? 1440 : window.innerWidth);
  const [width, setWidth] = useState(read);
  useEffect(() => {
    const onResize = () => setWidth(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return { width, compact: width < 720, medium: width >= 720 && width < 1100, wide: width >= 1100, xwide: width >= 1320 };
}

export function propertyOf(data, job) { return data.properties.find(p => p.id === job.propertyId); }
export function clientOf(data, property) { return { c1: "Coastal Key Management", c2: "Sunset Hosting", c3: "Harbor Stay Co.", c4: "Bluewater Rentals" }[property.clientId]; }

/** Relative day word (Hoje / Amanhã / Ontem) or a short date. */
export function dayWord(t, data, key) {
  const diff = dayDiff(data.clock.date, key);
  if (diff === 0) return t("date.today");
  if (diff === 1) return t("date.tomorrow");
  if (diff === -1) return t("date.yesterday");
  return t.day(key);
}

export function whenText(t, data, job) {
  return `${dayWord(t, data, job.date)} · ${job.start ? t.time(job.start) : t("c.timeNotSet")}`;
}

export function compText(t, comp) {
  if (!comp) return t("comp.unknown");
  if (comp.mode === "hourly") return t("comp.hourly", { rate: t.money(comp.rate), hours: comp.estHours, total: t.money(comp.rate * comp.estHours) });
  return t("comp.fixed", { amount: t.money(comp.amount) });
}

export function whyText(t, data, item, job) {
  const offers = offerSummary(job);
  const names = job.cleanerIds.map(cleanerName).join(" + ");
  switch (item.kind) {
    case "overdue": return t("att.overdue.why");
    case "issue": return t("att.issue.why", { name: cleanerName(item.params.issue.by), issue: item.params.issue.title[t.lang] || item.params.issue.title.en });
    case "reviewProblem": return t("att.reviewProblem.why");
    case "review": return t("att.review.why", { time: t.stamp(job.checklist.submittedAt) });
    case "interest": return t("att.interest.why", { names: offers.interested.map(o => cleanerName(o.cleanerId)).join(", ") });
    case "noCleanerToday": case "noCleanerTomorrow": case "noCleanerLater": case "offersWaiting":
      return offers.sent ? t("att.noCleaner.whyOffers", { count: offers.sent }) : t("att.noCleaner.whyNone");
    case "notNotified": return t("att.notNotified.why", { name: names });
    case "notConfirmed": return t("att.notConfirmed.why", { name: names });
    case "staleLink": return t("att.staleLink.why");
    default: return "";
  }
}

const toneIcon = { success: "check", attention: "info", warning: "warning", info: "send", brand: "check", risk: "warning", neutral: "minus" };

export function JobStatus({ job, small }) {
  const t = useT();
  const s = statusOf(job);
  return <span className={small ? "mw-status-small" : undefined}><StatusPill tone={s.tone} icon={toneIcon[s.tone]}>{t(s.key, s.params)}</StatusPill></span>;
}

export function AttentionTag({ item }) {
  const t = useT();
  return <StateLabel tone={item.tone === "neutral" ? "neutral" : item.tone} icon={toneIcon[item.tone]}>{t(`att.${item.kind}`)}</StateLabel>;
}

export function MiniRail({ job }) {
  const t = useT();
  const current = stageIndex(job);
  const skipped = job.status !== "UNASSIGNED" && job.status !== "OFFERED" && job.offers.length === 0;
  return (
    <span className="mw-minirail" role="img" aria-label={`${t("j.progress")}: ${t(`stage.${job.status}`)}`}>
      {STAGES.map((stage, i) => (
        <span key={stage} className={`mw-seg ${i < current ? (i === 1 && skipped ? "skip" : "done") : i === current ? "now" : ""}`} />
      ))}
    </span>
  );
}

export function Rail({ job }) {
  const t = useT();
  const current = stageIndex(job);
  const skipped = job.status !== "UNASSIGNED" && job.status !== "OFFERED" && job.offers.length === 0;
  return (
    <ol className="mw-rail" aria-label={t("j.progress")}>
      {STAGES.map((stage, i) => {
        const state = i < current ? (i === 1 && skipped ? "skip" : "done") : i === current ? "now" : "next";
        return (
          <li key={stage} className={`mw-rail-step ${state}`} aria-current={state === "now" ? "step" : undefined}>
            <span className="mw-rail-bar" />
            <span className="mw-rail-name">{state === "done" && <Icon name="check" size={13} />}{t(`stage.${stage}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function CleanerCell({ job }) {
  const t = useT();
  if (!job.cleanerIds.length) {
    const offers = offerSummary(job);
    if (offers.interested.length) return <span className="mw-flag tone-attention"><Icon name="userCheck" size={15} />{offers.interested.map(o => cleanerName(o.cleanerId)).join(", ")}?</span>;
    return <span className="mw-flag tone-warning"><Icon name="userX" size={15} />{t("c.noCleaner")}</span>;
  }
  return (
    <span className="mw-cleaner">
      {job.cleanerIds.map(id => <span key={id} className="mw-avatar" aria-hidden="true">{cleanerName(id).slice(0, 2).toUpperCase()}</span>)}
      <span className="mw-trunc">{job.cleanerIds.map(cleanerName).join(" + ")}</span>
    </span>
  );
}

/** Dense service row, shared by every layout. */
export function JobRow({ job, selected, onSelect, showDay = false }) {
  const t = useT();
  const { data } = useStore();
  const property = propertyOf(data, job);
  const top = attentionFor(data, job)[0];
  return (
    <button type="button" className={`mw-jobrow${selected ? " is-selected" : ""}${top && top.tone !== "neutral" ? ` has-${top.tone}` : ""}`}
      aria-pressed={selected} onClick={() => onSelect(job)} data-job-id={job.id}>
      <span className="mw-jobrow-time">
        {showDay && <span className="mw-jobrow-day">{dayWord(t, data, job.date)}</span>}
        <span className={job.start ? "tnum" : "mw-muted"}>{job.start ? t.time(job.start) : t("c.timeNotSet")}</span>
      </span>
      <span className="mw-jobrow-main">
        <span className="mw-jobrow-title">{property.name}</span>
        <span className="mw-jobrow-sub">{property.area} · {t(`type.${job.type}`)}</span>
      </span>
      <span className="mw-jobrow-cleaner"><CleanerCell job={job} /></span>
      <span className="mw-jobrow-status"><JobStatus job={job} small /></span>
      <span className="mw-jobrow-att">{top && top.tone !== "neutral" ? <AttentionTag item={top} /> : <MiniRail job={job} />}</span>
    </button>
  );
}

export function DateNav({ compact }) {
  const t = useT();
  const { ui, data, setUi } = useStore();
  const today = data.clock.date;
  const range = ui.range;
  const set = r => setUi({ range: r });
  const pickId = useId();
  return (
    <div className="mw-datenav" role="group" aria-label={t("date.range")}>
      <button type="button" className="mw-iconbtn" aria-label={t("date.prev")} onClick={() => set(shiftRange(range, -1, today))}><Icon name="chevronL" /></button>
      <div className="cfv2-segmented mw-seg-control">
        {["today", "tomorrow", "week"].map(kind => (
          <button key={kind} type="button" aria-pressed={range.kind === kind} onClick={() => set(rangeFor(kind, kind === "week" ? (range.kind === "week" ? range.anchor : today) : today, today))}>
            {t(`date.${kind}`)}
          </button>
        ))}
      </div>
      <button type="button" className="mw-iconbtn" aria-label={t("date.next")} onClick={() => set(shiftRange(range, 1, today))}><Icon name="chevronR" /></button>
      <label className="mw-datepick" htmlFor={pickId}>
        <Icon name="calendar" size={16} />
        <span className="mw-datepick-label">{range.kind === "week" ? t("date.weekOf", { start: t.day(range.start, "short"), end: t.day(range.end, "short") }) : (compact ? t.day(range.start, "short") : t.day(range.start, "long"))}</span>
        <input id={pickId} type="date" aria-label={t("date.pick")} value={range.start} onChange={e => { if (e.target.value) set(e.target.value === today ? rangeFor("today", today, today) : rangeFor("day", e.target.value, today)); }} />
      </label>
    </div>
  );
}

/** Accessible overlay: drawer (right), sheet (bottom on phones, centered on desktop) or full. */
export function Overlay({ open = true, onClose, title, kind = "drawer", children, footer, labelledBy, wide }) {
  const t = useT();
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const node = ref.current;
    const first = node?.querySelector("[data-autofocus]") || node?.querySelector("h2");
    first?.focus();
    const onKey = event => {
      if (event.key === "Escape") { event.stopPropagation(); onClose?.(); }
      if (event.key === "Tab" && node) {
        const targets = [...node.querySelectorAll("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])")].filter(el => !el.disabled && el.getClientRects().length);
        if (!targets.length) return;
        const firstEl = targets[0]; const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === firstEl) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); firstEl.focus(); }
      }
    };
    node?.addEventListener("keydown", onKey);
    return () => { node?.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={`mw-overlay mw-overlay-${kind}`}>
      <div className="mw-scrim" onClick={onClose} aria-hidden="true" />
      <section ref={ref} className={`mw-panel-${kind}${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy || titleId}>
        {title !== undefined && (
          <header className="mw-overlay-head">
            <h2 id={titleId} tabIndex={-1}>{title}</h2>
            <button type="button" className="mw-iconbtn" onClick={onClose} aria-label={t("c.close")}><Icon name="x" /></button>
          </header>
        )}
        <div className="mw-overlay-body">{children}</div>
        {footer && <footer className="mw-overlay-foot">{footer}</footer>}
      </section>
    </div>
  );
}

export function SimTag({ kind = "simulated" }) {
  const t = useT();
  const label = kind === "proposal" ? t("c.proposal") : kind === "future" ? t("c.future") : t("c.simulated");
  return <span className={`mw-simtag mw-simtag-${kind}`}><Icon name={kind === "proposal" ? "spark" : "flask"} size={12} />{label}</span>;
}

const roomHue = { entry: 150, kitchen: 32, bath: 200, bedrooms: 265, exit: 95, quick: 180 };
export function PhotoTile({ photo, label, onRetry, retryLabel, statusLabel }) {
  const hue = roomHue[photo.sectionId] ?? 160;
  return (
    <figure className={`mw-photo is-${photo.status}`} style={{ "--hue": hue }}>
      <svg viewBox="0 0 80 60" aria-hidden="true">
        <rect width="80" height="60" fill={`hsl(${hue} 22% 78%)`} />
        <path d="M0 44 22 26l14 12 12-9 32 22v9H0z" fill={`hsl(${hue} 20% 62%)`} />
        <circle cx="60" cy="16" r="6" fill={`hsl(${hue} 30% 88%)`} />
      </svg>
      <figcaption>{label}</figcaption>
      {photo.status === "uploading" && <span className="mw-photo-progress" style={{ width: `${photo.progress || 10}%` }} />}
      {photo.status !== "saved" && <span className="mw-photo-state">{statusLabel}</span>}
      {photo.status === "failed" && onRetry && <button type="button" className="mw-photo-retry" onClick={onRetry}>{retryLabel}</button>}
    </figure>
  );
}

export function Toast() {
  const { ui, setUi } = useStore();
  useEffect(() => {
    if (!ui.toast) return undefined;
    const id = setTimeout(() => setUi({ toast: null }), 4200);
    return () => clearTimeout(id);
  }, [ui.toast?.id]);
  return <div className="mw-toast-region" role="status" aria-live="polite">{ui.toast && <div className="mw-toast"><Icon name={ui.toast.icon || "checkCircle"} size={18} /><span>{ui.toast.text}</span></div>}</div>;
}

import { useEffect, useRef, useState } from "react";
import { reviewCandidate } from "./reservationReviewService.js";
import { reviewMessages } from "./reservationReviewMessages.js";
import { acceptanceMessages } from "./reservationAcceptanceMessages.js";
import { designMessages } from "./reservationDesignMessages.js";
import { reservationIntakeMessages } from "./reservationIntakeMessages.js";
import { IntakeIcon } from "./IntakeIcon.jsx";
import { intakeDate, intakeShortDate, intakeDayChange, intakeSource } from "./reservationReviewPresentation.js";

export function ReservationReviewPanel({ row, properties = [], language, review = reviewCandidate, onDecision, onBack, onConfirmation }) {
  const t = reviewMessages[language] || reviewMessages.en, a = acceptanceMessages[language] || acceptanceMessages.en;
  const d = designMessages[language] || designMessages.en, labels = reservationIntakeMessages[language] || reservationIntakeMessages.en;
  const [decision, setDecision] = useState(null), [propertyId, setPropertyId] = useState("");
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [ignoring, setIgnoring] = useState(false), [search, setSearch] = useState("");
  const [editingProperty, setEditingProperty] = useState(false);
  const generation = useRef(0), pending = useRef(null), confirmation = useRef(null), approve = useRef(null);
  useEffect(() => {
    generation.current++; pending.current = null; setDecision(null); setPropertyId(""); setConfirming(false);
    setError(false); setBusy(false); setIgnoring(false); setSearch(""); setEditingProperty(false);
    return () => { generation.current++; };
  }, [row]);
  useEffect(() => {
    onConfirmation?.(confirming);
    if (!confirming) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmation.current?.querySelector("button")?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = previous; onConfirmation?.(false); };
  }, [confirming, onConfirmation]);
  async function act(operation) {
    if (pending.current !== null) return;
    const current = ++generation.current; setBusy(true); setError(false); pending.current = current; setIgnoring(false);
    try {
      const result = await review(row, operation, { expectedRevision: decision?.revision || 0,
        ...(operation === "RESOLVE" ? { propertyId } : {}), ...(operation === "PROMOTE" ? { confirmed: true } : {}) });
      if (current === generation.current) { setDecision(result); setPropertyId(result.propertyId || ""); setConfirming(false); setEditingProperty(false); onDecision?.(row.id, result); }
    } catch { if (current === generation.current) { setError(true); setConfirming(false); } }
    finally { if (current === generation.current) { setBusy(false); pending.current = null; } }
  }
  const terminal = ["PROMOTED", "IGNORED"].includes(decision?.state);
  const activeProperties = properties.filter(p => p.active === true && !p.archivedAt);
  const selectedProperty = activeProperties.find(p => p.id === propertyId);
  const resolved = Boolean(selectedProperty && decision?.propertyId === propertyId);
  const allowed = resolved && !editingProperty && !terminal && !["CONFLICT", "POSSIBLE_CANCELLED", "SOURCE_DISAPPEARED"].includes(row.changeType)
    && !["CANCELLED", "CANCELED"].includes(row.sourceReservationStatus?.toUpperCase());
  const date = value => intakeShortDate(value, language), range = `${date(row.checkIn)} → ${date(row.checkOut)}`;
  const source = intakeSource(row, d.generic);
  const diff = row.changeSet?.checkOut, days = intakeDayChange(diff);
  const badge = terminal ? t[decision.state] : row.propertyMappingState !== "MATCHED" && !resolved ? d.required : row.changeType === "NEW" && row.sourceEvidenceType === "CALENDAR_EVENT" ? labels.newCalendarEvent : labels[row.changeType] || a.needsReview;
  const visualState = terminal ? decision.state : row.propertyMappingState !== "MATCHED" && !resolved ? "PROPERTY_REQUIRED" : row.changeType;
  function closeConfirmation() { if (!busy) { setConfirming(false); approve.current?.focus(); } }
  function dialogKeys(event) {
    if (event.key === "Escape") { event.preventDefault(); closeConfirmation(); }
    if (event.key === "Tab") {
      const buttons = [...confirmation.current.querySelectorAll("button:not(:disabled)")];
      if (!buttons.length) { event.preventDefault(); return; }
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  const consequences = final => <>
    <div className="intake-consequence"><span aria-hidden="true" className="intake-check">✓</span><div>{final && <small>{d.creates}</small>}<strong>{final ? d.one : d.create}</strong><p>{selectedProperty?.name || d.required} · {range}</p></div></div>
    <div className="intake-consequence"><span aria-hidden="true" className="intake-minus">−</span><div>{final && <small>{d.doesNot}</small>}<strong>{final ? d.job : d.noJob}</strong></div></div>
    <p className="intake-future">{d.future}</p>
  </>;
  return <section className={`intake-review ${confirming ? "intake-review--confirming" : ""}`} aria-label={t.title}>
    <div className="intake-review__main" inert={confirming ? true : undefined}>
      {onBack && <button type="button" className="intake-mobile-back" onClick={onBack}>← {d.entry}</button>}
      <strong className={`intake-state intake-state--${visualState}`}><IntakeIcon state={visualState} />{badge}</strong>
      <h2 tabIndex={-1} className="intake-candidate-heading">{row.sourcePropertyName || "—"}</h2>
      {!resolved && row.propertyMappingState !== "MATCHED" && <p>{d.sourceName}</p>}
      <p className="intake-source">{source} · {range}</p>
      {decision?.discrepancy?.reviewRequired && <div role="status" className="intake-change"><strong>{t.discrepancy}</strong>
        {Object.entries(decision.discrepancy.changes || {}).map(([key, values]) => <p key={key}>{a[key] || a.source}: {["checkIn", "checkOut"].includes(key) ? intakeDate(values.before, language) : values.before || "—"} → {["checkIn", "checkOut"].includes(key) ? intakeDate(values.after, language) : values.after || "—"}</p>)}
        {decision.discrepancy.signal && <p>{a.needsReview}</p>}</div>}
      {diff && <section className="intake-observations"><h3 className="intake-overline">{d.changed}</h3>
        <p className="intake-delta">{d.end} <strong>{date(diff.before)} → {date(diff.after)}</strong>{days !== null && <span>{days > 0 ? "+" : ""}{days} {Math.abs(days) === 1 ? d.day : d.days}</span>}</p>
        <div className="intake-compare"><div><h4>{d.previous}</h4><dl><dt>{d.start}</dt><dd>{date(row.previousObservation?.checkIn)}</dd><dt>{d.end}</dt><dd>{date(diff.before)}</dd></dl></div>
          <span className="intake-arrow" aria-hidden="true">→</span><div className="intake-incoming"><h4>{d.incoming}</h4><dl><dt>{d.start}</dt><dd>{date(row.checkIn)}</dd><dt>{d.end}</dt><dd>{date(row.checkOut)}</dd></dl></div></div>
        <p>{d.changeNote}</p></section>}
      {["POSSIBLE_CANCELLED", "SOURCE_DISAPPEARED", "CONFLICT"].includes(row.changeType) && <p role="status" className="intake-risk">{row.changeType === "CONFLICT" ? labels.CONFLICT : d.cancelNote}</p>}
      {Object.entries(row.changeSet || {}).filter(([key]) => key !== "checkOut").map(([key, change]) => <p key={key}>{labels[key === "sourceReservationStatus" ? "status" : key === "propertyMappingState" ? "mapping" : key] || d.changed}: {key === "checkIn" ? date(change.before) : change.before || "—"} → {key === "checkIn" ? date(change.after) : change.after || "—"}</p>)}
      {decision && !terminal && (!resolved || editingProperty) && <section className="intake-property-picker">
        <h3 className="intake-overline">{d.select}</h3><p>{d.propertyHelp}</p>
        <label className="intake-search"><span className="sr-only">{d.search}</span><input placeholder={d.search} value={search} disabled={busy} onChange={e => setSearch(e.target.value)} /></label>
        <fieldset><legend className="sr-only">{t.property}</legend>{activeProperties.filter(p => p.name.toLocaleLowerCase(language).includes(search.toLocaleLowerCase(language))).map(p => <label key={p.id} className="intake-property-option"><input type="radio" name="intake-property" checked={propertyId === p.id} disabled={busy} onChange={() => { setPropertyId(p.id); setConfirming(false); }} /><span>{p.name}</span></label>)}</fieldset>
        {!activeProperties.some(p => p.name.toLocaleLowerCase(language).includes(search.toLocaleLowerCase(language))) && <p>{d.noProperties}</p>}
        <button type="button" className="button" disabled={busy || !selectedProperty} onClick={() => act("RESOLVE")}>{t.resolve}</button>
      </section>}
      <div className="intake-facts"><section><h3 className="intake-overline">{d.property}</h3><strong>{resolved || terminal ? properties.find(p => p.id === decision?.propertyId)?.name || d.required : d.required}</strong><p>{resolved || terminal && decision.propertyId ? `✓ ${d.confirmed}` : d.unconfirmed}</p>{resolved && !terminal && <button type="button" className="intake-read" disabled={busy} onClick={() => setEditingProperty(true)}>{d.select}</button>}</section>
        <section><h3 className="intake-overline">{d.guest}</h3><strong>{row.guestName || d.absent}</strong>{row.sourceReservationStatus && <p>{row.sourceReservationStatus}</p>}</section></div>
      {!diff && <p>{d.start}: {date(row.checkIn)} · {d.end}: {date(row.checkOut)}</p>}
      <details className="intake-diagnostics"><summary>{d.diagnostics}</summary><dl>
        <dt>{labels.identity}</dt><dd>{row.identityStrategy || "—"}</dd><dt>{labels.provider}</dt><dd>{row.sourceProvider} · {row.sourceType} · {row.parserVersion}</dd>
        <dt>{d.start}</dt><dd>{row.checkIn || "—"}</dd><dt>{d.end}</dt><dd>{row.checkOut || "—"}</dd><dt>{labels.observed}</dt><dd>{row.observedAt || "—"}</dd>
        <dt>{t.first}</dt><dd>{row.firstObservedAt || row.observedAt || "—"}</dd>
        <dt>{labels.confidence}</dt><dd>{row.confidence || "—"}</dd><dt>{labels.mapping}</dt><dd>{row.propertyMappingState || "—"}</dd>
      </dl>{row.previousObservation && <pre>{JSON.stringify(row.previousObservation, null, 2)}</pre>}{row.conflict && <pre>{JSON.stringify(row.conflict, null, 2)}</pre>}</details>
    </div>
    <aside className="intake-decision" inert={confirming ? true : undefined}>
      <h3 className="intake-overline">{terminal ? d.saved : d.approving}</h3>{terminal ? <><strong>{t[decision.state]}</strong><p>{d.queueNote}</p><p className="intake-future">{d.future}</p></> : consequences(false)}
      <div className="intake-decision__actions">
        {!decision && <p>{a.unread}</p>}<button type="button" className="intake-read" disabled={busy} onClick={() => act("READ")}>{d.refresh}</button>
        {busy && <p role="status">{t.loading}</p>}{error && <p role="alert">{t.error}</p>}
        {decision && <p role="status" className="reservation-state">{t[decision.state]}</p>}
        {decision && !terminal && <><button ref={approve} type="button" className="button button--primary" disabled={busy || !allowed} onClick={() => setConfirming(true)}>{allowed ? d.approve : resolved && !editingProperty ? a.needsReview : d.locked}</button>
          <button type="button" className="button" disabled={busy} onClick={() => setIgnoring(true)}>{d.ignore}</button></>}
        {ignoring && <div role="alertdialog" aria-label={d.ignore} onKeyDown={e => { if (e.key === "Escape") setIgnoring(false); }}><p>{a.ignoreWarning}</p><button type="button" className="button" autoFocus disabled={busy} onClick={() => setIgnoring(false)}>{a.cancel}</button><button type="button" className="button" disabled={busy} onClick={() => act("IGNORE")}>{a.ignoreConfirm}</button></div>}
      </div>
    </aside>
    {confirming && <div ref={confirmation} role="dialog" aria-modal="true" aria-labelledby="intake-confirm-title" className="intake-confirmation" onKeyDown={dialogKeys}>
      <h3 className="intake-overline">{d.confirmation}</h3><h2 id="intake-confirm-title">{d.question}</h2><p className="intake-confirmation__identity"><strong>{selectedProperty?.name}</strong><br />{range}</p>
      <div className="intake-confirmation__context">{row.guestName && <p>{d.guest}: {row.guestName}</p>}<p>{source}</p></div><hr />{consequences(true)}
      <div className="intake-confirmation__actions"><button type="button" className="button button--primary" disabled={busy || !allowed} onClick={() => act("PROMOTE")}>{d.final}</button><button type="button" className="button" disabled={busy} onClick={closeConfirmation}>{d.back}</button><p>{d.nothing}</p>{busy && <p role="status">{t.loading}</p>}</div>
    </div>}
  </section>;
}

import { useEffect, useRef, useState } from "react";
import { reviewCandidate } from "./reservationReviewService.js";
import { reviewMessages } from "./reservationReviewMessages.js";
import { acceptanceMessages } from "./reservationAcceptanceMessages.js";
import { intakeDate } from "./reservationReviewPresentation.js";

export function ReservationReviewPanel({ row, properties = [], language, review = reviewCandidate, onDecision }) {
  const t = reviewMessages[language] || reviewMessages.en;
  const a = acceptanceMessages[language] || acceptanceMessages.en;
  const [decision, setDecision] = useState(null), [propertyId, setPropertyId] = useState("");
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const generation = useRef(0);
  const pending = useRef(null);
  const [ignoring, setIgnoring] = useState(false);
  useEffect(() => { generation.current++; pending.current = null; setDecision(null); setPropertyId(""); setConfirmed(false); setError(false); setBusy(false); setIgnoring(false);
    return () => { generation.current++; }; }, [row]);
  async function act(operation) {
    if (pending.current !== null) return;
    const current = ++generation.current; setBusy(true); setError(false);
    pending.current = current; setIgnoring(false);
    try {
      const result = await review(row, operation, { expectedRevision: decision?.revision || 0,
        ...(operation === "RESOLVE" ? { propertyId } : {}), ...(operation === "PROMOTE" ? { confirmed } : {}) });
      if (current === generation.current) { setDecision(result); setPropertyId(result.propertyId || ""); setConfirmed(false); onDecision?.(row.id, result); }
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) { setBusy(false); pending.current = null; } }
  }
  const terminal = ["PROMOTED", "IGNORED"].includes(decision?.state);
  return <section className="reservation-inbox__review-panel" aria-label={t.title}>
    <h3>{t.title}</h3><p>{t.boundary}</p><p>{t.first}: {intakeDate(row.firstObservedAt || row.observedAt, language)}</p>
    <button type="button" className="button" disabled={busy} onClick={() => act("READ")}>{t.refresh}</button>
    {busy && <p role="status">{t.loading}</p>}
    {error && <p role="alert">{t.error}</p>}
    {decision && <><p role="status" className={`reservation-state reservation-state--${decision.state}`}><strong>{t[decision.state]}</strong></p>
      {decision.discrepancy?.reviewRequired && <div role="status"><strong>{t.discrepancy}</strong>
        {Object.entries(decision.discrepancy.changes).map(([key, values]) => <p key={key}>{a[key] || a.source}: {["checkIn", "checkOut"].includes(key) ? intakeDate(values.before, language) : values.before || "—"} → {["checkIn", "checkOut"].includes(key) ? intakeDate(values.after, language) : values.after || "—"}</p>)}
        {decision.discrepancy.signal && <p>{a.needsReview}</p>}</div>}
      {!terminal && <>
        <label>{t.property}<select value={propertyId} disabled={busy} onChange={event => { setPropertyId(event.target.value); setConfirmed(false); }}>
          <option value="">{t.select}</option>{properties.filter(p => p.active === true && !p.archivedAt).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <button type="button" className="button" disabled={busy || !propertyId} onClick={() => act("RESOLVE")}>{t.resolve}</button>
        {decision.propertyId && decision.propertyId === propertyId && <>
          <div className="reservation-confirmation"><h4>{a.summary}</h4><dl>
            <dt>{a.property}</dt><dd>{properties.find(property => property.id === propertyId)?.name || t.select}</dd>
            <dt>{a.checkIn}</dt><dd>{intakeDate(row.checkIn, language)}</dd><dt>{a.checkOut}</dt><dd>{intakeDate(row.checkOut, language)}</dd>
            <dt>{a.guest}</dt><dd>{row.guestName || "—"}</dd><dt>{a.source}</dt><dd>{row.sourceProvider}</dd>
          </dl><p>{a.consequence}</p></div>
          <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{t.confirm}</label>
          <button type="button" className="button" disabled={busy || !confirmed || !properties.some(p => p.id === propertyId && p.active === true && !p.archivedAt)} onClick={() => act("PROMOTE")}>{t.promote}</button>
        </>}
        <button type="button" className="button" disabled={busy} onClick={() => setIgnoring(true)}>{t.ignore}</button>
        {ignoring && <div role="alertdialog" aria-label={t.ignore} onKeyDown={event => { if (event.key === "Escape") setIgnoring(false); }}><p>{a.ignoreWarning}</p>
          <button type="button" className="button" autoFocus disabled={busy} onClick={() => setIgnoring(false)}>{a.cancel}</button>
          <button type="button" className="button" disabled={busy} onClick={() => act("IGNORE")}>{a.ignoreConfirm}</button></div>}
      </>}
    </>}
  </section>;
}

import { useEffect, useRef, useState } from "react";
import { reviewCandidate } from "./reservationReviewService.js";
import { reviewMessages } from "./reservationReviewMessages.js";

export function ReservationReviewPanel({ row, properties = [], language, review = reviewCandidate }) {
  const t = reviewMessages[language] || reviewMessages.en;
  const [decision, setDecision] = useState(null), [propertyId, setPropertyId] = useState("");
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setDecision(null); setPropertyId(""); setConfirmed(false); setError(false); setBusy(false);
    return () => { generation.current++; }; }, [row]);
  async function act(operation) {
    const current = ++generation.current; setBusy(true); setError(false);
    try {
      const result = await review(row, operation, { expectedRevision: decision?.revision || 0,
        ...(operation === "RESOLVE" ? { propertyId } : {}), ...(operation === "PROMOTE" ? { confirmed } : {}) });
      if (current === generation.current) { setDecision(result); setPropertyId(result.propertyId || ""); setConfirmed(false); }
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) setBusy(false); }
  }
  const terminal = ["PROMOTED", "IGNORED"].includes(decision?.state);
  return <section className="reservation-inbox__review-panel" aria-label={t.title}>
    <h3>{t.title}</h3><p>{t.boundary}</p><p>{t.first}: {row.firstObservedAt || row.observedAt}</p>
    <button type="button" className="button" disabled={busy} onClick={() => act("READ")}>{t.refresh}</button>
    {busy && <p role="status">{t.loading}</p>}
    {error && <p role="alert">{t.error}</p>}
    {decision && <><p role="status"><strong>{t[decision.state]}</strong></p>
      {decision.discrepancy?.reviewRequired && <div role="status"><strong>{t.discrepancy}</strong>
        {Object.entries(decision.discrepancy.changes).map(([key, values]) => <p key={key}>{key}: {values.before || "—"} → {values.after || "—"}</p>)}
        {decision.discrepancy.signal && <p>{decision.discrepancy.signal}</p>}</div>}
      {!terminal && <>
        <label>{t.property}<select value={propertyId} disabled={busy} onChange={event => { setPropertyId(event.target.value); setConfirmed(false); }}>
          <option value="">{t.select}</option>{properties.filter(p => p.active === true && !p.archivedAt).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <button type="button" className="button" disabled={busy || !propertyId} onClick={() => act("RESOLVE")}>{t.resolve}</button>
        {decision.propertyId && decision.propertyId === propertyId && <>
          <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{t.confirm}</label>
          <button type="button" className="button" disabled={busy || !confirmed} onClick={() => act("PROMOTE")}>{t.promote}</button>
        </>}
        <button type="button" className="button" disabled={busy} onClick={() => act("IGNORE")}>{t.ignore}</button>
      </>}
    </>}
  </section>;
}

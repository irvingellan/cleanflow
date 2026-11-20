import { useState } from "react";
import { workedTimeMessages } from "./workedTimeMessages.js";

export function WorkedTimeForm({ language, work, onSave, allowSave = true, manager = false, touchUp = false, paid = false }) {
  const [minutes, setMinutes] = useState(null);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const t = workedTimeMessages(language);
  const approvedMinutes = work?.approvedMinutes ?? (manager ? result?.minutes : null);
  const reportedMinutes = manager ? work?.reportedMinutes : result?.minutes ?? work?.reportedMinutes;
  if (approvedMinutes != null) {
    const payoutCents = work?.payoutCents ?? result?.payoutCents;
    const money = payoutCents == null ? "" : new Intl.NumberFormat(language, {
      style: "currency", currency: "USD",
    }).format(payoutCents / 100);
    return <p role="status">{t.approved} · {approvedMinutes} min{money && ` · ${money}`}</p>;
  }

  const value = minutes ?? reportedMinutes ?? (touchUp ? 120 : "");
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(false);
    try {
      setResult(await onSave(Number(value)));
      setMinutes(null);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <p role="status">{reportedMinutes == null ? t.unreported : `${t.waiting} · ${reportedMinutes} min`}</p>
    {allowSave && !paid && <form onSubmit={submit} className="worked-time-form">
      <label>{t.minutes}<input type="number" min={manager ? 0 : 1} max="1440" step="1"
        value={value} onChange={event => setMinutes(event.target.value)} required disabled={saving} /></label>
      <p>{touchUp && manager ? t.touchUp : t.rounding}</p>
      <button type="submit" className="button" disabled={saving}>{saving ? t.saving : manager ? t.approve : t.save}</button>
      {error && <p role="alert">{t.failed}</p>}
    </form>}
  </>;
}

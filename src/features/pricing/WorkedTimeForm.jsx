import { useState } from "react";
import { workedTimeMessages } from "./workedTimeMessages.js";

/** 125 → "2 h 05 min", 45 → "45 min", 120 → "2 h". */
export function formatWorkedMinutes(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${String(minutes).padStart(2, "0")} min` : `${hours} h`;
}

function split(total) {
  return Number.isInteger(total) && total >= 0
    ? { hours: String(Math.floor(total / 60)), minutes: String(total % 60) }
    : { hours: "", minutes: "" };
}

export function WorkedTimeForm({ language, work, onSave, allowSave = true, manager = false, touchUp = false, paid = false }) {
  const [draft, setDraft] = useState(null);
  const [result, setResult] = useState(null);
  const [correcting, setCorrecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const t = workedTimeMessages(language);
  const approvedMinutes = manager ? result?.minutes ?? work?.approvedMinutes : work?.approvedMinutes;
  const reportedMinutes = manager ? work?.reportedMinutes : result?.minutes ?? work?.reportedMinutes;
  const canEdit = allowSave && !paid;

  if (approvedMinutes != null && !correcting) {
    const payoutCents = (manager ? result?.payoutCents : undefined) ?? work?.payoutCents;
    const money = payoutCents == null ? "" : new Intl.NumberFormat(language, {
      style: "currency", currency: "USD",
    }).format(payoutCents / 100);
    return <>
      <p role="status">{t.approved} · {formatWorkedMinutes(approvedMinutes)}{money && ` · ${money}`}</p>
      {manager && canEdit && <button type="button" className="button button--secondary"
        onClick={() => { setDraft(split(approvedMinutes)); setCorrecting(true); }}>{t.correct}</button>}
    </>;
  }

  const value = draft ?? split(reportedMinutes ?? (touchUp ? 120 : null));
  const total = (Number(value.hours) || 0) * 60 + (Number(value.minutes) || 0);
  const empty = value.hours === "" && value.minutes === "";
  const invalid = empty || total > 1440 || (!manager && total < 1);
  const change = field => event => setDraft({ ...value, [field]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    if (invalid) return;
    setSaving(true);
    setError(false);
    try {
      setResult(await onSave(total));
      setDraft(null);
      setCorrecting(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <p role="status">{reportedMinutes == null ? t.unreported : `${t.waiting} · ${formatWorkedMinutes(reportedMinutes)}`}</p>
    {canEdit && <form onSubmit={submit} className="worked-time-form">
      <div className="worked-time-form__fields">
        <label>{t.hours}<input type="number" inputMode="numeric" min="0" max="24" step="1"
          value={value.hours} onChange={change("hours")} disabled={saving} /></label>
        <label>{t.minutes}<input type="number" inputMode="numeric" min="0" max="59" step="1"
          value={value.minutes} onChange={change("minutes")} disabled={saving} /></label>
      </div>
      {!empty && <p>{t.total}: {formatWorkedMinutes(total)}</p>}
      <p>{touchUp && manager ? t.touchUp : t.rounding}</p>
      <button type="submit" className="button" disabled={saving || invalid}>
        {saving ? t.saving : manager ? t.approve : t.save}
      </button>
      {correcting && <button type="button" className="button button--secondary" disabled={saving}
        onClick={() => { setDraft(null); setCorrecting(false); }}>{t.cancel}</button>}
      {error && <p role="alert">{t.failed}</p>}
    </form>}
  </>;
}

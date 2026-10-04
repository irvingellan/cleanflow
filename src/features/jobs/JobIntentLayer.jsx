import { useTranslation } from "../../i18n/translations.js";

// Navigation and disclosure only. Availability/handlers come from Job Detail;
// this component cannot authorize or execute a domain mutation.
export function JobIntentLayer({ primary, onIntent, notice, onSafePath, safeLabel, showOperationalIntents = true }) {
  const { translate } = useTranslation();
  return <section className="job-intents" aria-label={translate("jobs.intentTitle")}>
    <div className="job-intents__next">
      <div><p className="eyebrow">{translate("jobs.intentNext")}</p><strong>{translate(primary.label)}</strong></div>
      <button className="button button--primary" type="button" aria-label={translate("jobs.intentNextAction", { action: translate(primary.label) })} onClick={() => onIntent(primary.intent)}>{translate(primary.label)} →</button>
    </div>
    {showOperationalIntents && <>
      <h3>{translate("jobs.intentTitle")}</h3>
      <div className="job-intents__actions">{["schedule", "assignment", "reminder", "checklist", "completion"].map((intent) => <button key={intent} className="button" type="button" aria-label={translate("jobs.intentChoose", { action: translate(`jobs.intent.${intent}`) })} onClick={() => onIntent(intent)}>{translate(`jobs.intent.${intent}`)}</button>)}</div>
    </>}
    {notice && <div className="job-intents__notice" role="status"><p>{notice}</p>{onSafePath && <button className="button" type="button" onClick={onSafePath}>{safeLabel} →</button>}</div>}
  </section>;
}

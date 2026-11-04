import { Icon } from "../../components/Icon.jsx";
import { useTranslation } from "../../i18n/translations.js";

const intentIcons = { schedule: "calendar", assignment: "userCheck", reminder: "message", checklist: "clipCheck", completion: "checkCircle" };

// Navigation and disclosure only. Availability/handlers come from Job Detail;
// this component cannot authorize or execute a domain mutation.
export function JobIntentLayer({ primary, onIntent, notice, onSafePath, safeLabel, showOperationalIntents = true }) {
  const { translate } = useTranslation();
  return <section className="job-intents" aria-label={translate("jobs.intentTitle")}>
    <div className="job-intents__next">
      <p className="job-intents__label">{translate("jobs.intentNext")}</p>
      <button className="button button--primary job-intents__primary" type="button" aria-label={translate("jobs.intentNextAction", { action: translate(primary.label) })} onClick={() => onIntent(primary.intent)}>
        <span>{translate(primary.label)}</span>
        <Icon name="arrowR" size={18} />
      </button>
    </div>
    {showOperationalIntents && <details className="job-intents__secondary">
      <summary><span>{translate("jobs.moreActions")}</span><Icon name="chevronD" size={16} className="job-intents__chevron" /></summary>
      <h3 className="visually-hidden">{translate("jobs.intentTitle")}</h3>
      <div className="job-intents__actions">{["schedule", "assignment", "reminder", "checklist", "completion"].map((intent) => <button key={intent} className="button job-intents__action" type="button" aria-label={translate("jobs.intentChoose", { action: translate(`jobs.intent.${intent}`) })} onClick={() => onIntent(intent)}><Icon name={intentIcons[intent]} size={18} /><span>{translate(`jobs.intent.${intent}`)}</span></button>)}</div>
    </details>}
    {notice && <div className="job-intents__notice" role="status"><Icon name="info" size={18} /><div><p>{notice}</p>{onSafePath && <button className="button button--small" type="button" onClick={onSafePath}>{safeLabel} <Icon name="arrowR" size={14} /></button>}</div></div>}
  </section>;
}

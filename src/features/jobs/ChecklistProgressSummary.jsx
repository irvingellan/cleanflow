import { useTranslation } from "../../i18n/translations.js";
import "./serviceLifecycle.css";

export function ChecklistProgressSummary({ checklist }) {
  const { translate, language } = useTranslation();
  const { progress, lastSavedAt } = checklist;
  const progressLabel = progress ? translate("lifecycle.savedItems", progress) : null;
  const savedTime = lastSavedAt ? new Intl.DateTimeFormat(language, {
    hour: "numeric", minute: "2-digit",
  }).format(new Date(lastSavedAt)) : null;
  return <section className="service-checklist-summary" aria-label={translate("lifecycle.checklistTitle")}>
    <div className="service-checklist-summary__heading">
      <h3>{translate("lifecycle.checklistTitle")}</h3>
      <strong>{translate(checklist.stateKey)}</strong>
    </div>
    {progress ? <>
      <p className="service-checklist-summary__saved">{progressLabel}</p>
      <div className="service-checklist-summary__track" role="progressbar"
        aria-label={translate("lifecycle.savedProgress")}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
        aria-valuetext={progressLabel}>
        <span className="service-checklist-summary__fill" style={{ width: `${progress.percent}%` }} />
      </div>
    </> : checklist.state !== "NONE" && checklist.state !== "LOADING" &&
      <p className="service-checklist-summary__secondary">{translate("lifecycle.progressUnknown")}</p>}
    {lastSavedAt ? <p className="service-checklist-summary__secondary">
      {translate("lifecycle.lastSaved")} <time dateTime={lastSavedAt}>{savedTime}</time>
    </p> : progress && <p className="service-checklist-summary__secondary">{translate("lifecycle.noSavedTime")}</p>}
    <p className="service-checklist-summary__link">
      <span>{translate("lifecycle.cleanerLink")}</span>
      <strong className={checklist.capabilityState === "STALE" ? "service-checklist-summary__warning" : undefined}>
        {translate(checklist.capabilityKey)}
      </strong>
    </p>
  </section>;
}

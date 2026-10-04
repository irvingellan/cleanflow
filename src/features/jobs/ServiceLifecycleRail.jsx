import { useTranslation } from "../../i18n/translations.js";
import "./serviceLifecycle.css";

export function ServiceLifecycleRail({ lifecycle }) {
  const { translate } = useTranslation();
  return <section className="service-lifecycle" aria-label={translate("lifecycle.execution")}>
    <div className="service-lifecycle__heading">
      <h3>{translate("lifecycle.execution")}</h3>
      {!lifecycle.stages.some((stage) => stage.state === "current") && <strong>{translate(lifecycle.statusKey)}</strong>}
      {lifecycle.archived && <span className="service-lifecycle__archived">{translate("lifecycle.archived")}</span>}
    </div>
    <ol className="service-lifecycle__rail">
      {lifecycle.stages.map((stage) => <li key={stage.status}
        className={`service-lifecycle__stage service-lifecycle__stage--${stage.state}`}
        aria-label={translate("lifecycle.accessibleStage", { stage: translate(stage.labelKey), position: translate(`lifecycle.position.${stage.state}`) })}
        aria-current={stage.state === "current" ? "step" : undefined}>
        <span className="service-lifecycle__segment" aria-hidden="true">{stage.state === "completed" ? "✓"
          : stage.state === "skipped" ? "–" : stage.state === "unknown-past" ? "?" : null}</span>
        <span className="service-lifecycle__label">{translate(stage.labelKey)}</span>
      </li>)}
    </ol>
  </section>;
}

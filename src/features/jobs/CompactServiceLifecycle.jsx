import { useTranslation } from "../../i18n/translations.js";
import { serviceLifecyclePresentation } from "./serviceLifecyclePresentation.js";
import "./compactServiceLifecycle.css";

// No providers/effects: omitted history is unknown, not a loaded empty list.
export function CompactServiceLifecycle({ job, offers, descriptionId }) {
  const { translate } = useTranslation();
  const { lifecycle } = serviceLifecyclePresentation({ job, offers });
  const symbols = { completed: "✓", current: "●", future: "·", skipped: "–", "unknown-past": "?" };
  const stageLabel = stage => translate("lifecycle.accessibleStage", {
    stage: translate(stage.labelKey), position: translate(`lifecycle.position.${stage.state}`),
  });
  return <span className="compact-lifecycle" role="group" aria-label={translate("lifecycle.execution")}>
    {descriptionId && <span id={descriptionId} hidden>{lifecycle.stages.map(stageLabel).join("; ")}</span>}
    <span className="compact-lifecycle__rail" role="list">
      {lifecycle.stages.map(stage => {
        const label = stageLabel(stage);
        return <span key={stage.status} role="listitem" title={label} aria-label={label}
          aria-current={stage.state === "current" ? "step" : undefined}
          className={`compact-lifecycle__stage compact-lifecycle__stage--${stage.state}`}>
          <span aria-hidden="true">{symbols[stage.state]}</span>
        </span>;
      })}
    </span>
    <span className="compact-lifecycle__status">{translate(lifecycle.statusKey)}</span>
  </span>;
}

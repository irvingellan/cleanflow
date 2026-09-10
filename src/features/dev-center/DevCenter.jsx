import { useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";

const scenarios = [
  { id: "quick", label: "devCenter.quick", description: "devCenter.quickDescription" },
  { id: "busyWeek", label: "devCenter.busyWeek", description: "devCenter.busyWeekDescription" },
  { id: "payoutTest", label: "devCenter.payoutTest", description: "devCenter.payoutTestDescription" },
  { id: "managerTraining", label: "devCenter.managerTraining", description: "devCenter.managerTrainingDescription" },
];

export function DevCenter({ access, isWorking, pendingPreviewType, hasError, lastResult, onGenerate, onClear, onPreviewReminder }) {
  const { translate } = useTranslation();
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const canMutate = access.environment === "emulator";
  const canPreview = access.authorized;
  const isPreviewPending = (type) => pendingPreviewType === type;

  async function generate(scenario) {
    await onGenerate(scenario);
  }

  async function clear() {
    await onClear();
    setIsConfirmingClear(false);
  }

  return (
    <section className="dev-center" aria-labelledby="dev-center-title">
      <div className="dev-center__intro">
        <div>
          <p className="eyebrow">{translate("devCenter.developmentOnly")}</p>
          <h2 id="dev-center-title">{translate("devCenter.title")}</h2>
          <p>{translate("devCenter.intro")}</p>
        </div>
        <span className={`dev-center__environment dev-center__environment--${access.environment || "unknown"}`}>
          {access.environment === "production"
            ? translate("devCenter.environmentProduction")
            : translate("devCenter.environmentEmulator")}
        </span>
      </div>

      {!canMutate && <StateCard message={translate("devCenter.mutationsEmulatorOnly")} status="status" />}

      <section className="dev-center__count" aria-label={translate("devCenter.demoJobCount")}>
        <span>{translate("devCenter.demoJobCount")}</span>
        <strong>{access.demoJobCount || 0}</strong>
      </section>

      <div className="dev-center__scenarios">
        {scenarios.map((scenario) => (
          <article key={scenario.id} className="dev-center__scenario">
            <h3>{translate(scenario.label)}</h3>
            <p>{translate(scenario.description)}</p>
            <button
              className="button button--primary"
              type="button"
              disabled={isWorking || !canMutate}
              onClick={() => generate(scenario.id)}
            >
              {isWorking ? translate("devCenter.working") : translate("devCenter.generate")}
            </button>
          </article>
        ))}
      </div>

      <section className="dev-center__cleanup">
        <div>
          <h3>{translate("devCenter.reminderPreviewTitle")}</h3>
          <p>{translate("devCenter.reminderPreviewDescription")}</p>
          {!canMutate && <p><strong>{translate("devCenter.readOnlyProductionData")}</strong> {translate("devCenter.readOnlyPreviewSafety")}</p>}
        </div>
        <div className="button-row">
          <button className="button" type="button" disabled={isPreviewPending("TODAY_07") || !canPreview} onClick={() => onPreviewReminder("TODAY_07")}>
            {isPreviewPending("TODAY_07") ? translate("devCenter.working") : translate("devCenter.previewTodayReminder")}
          </button>
          <button className="button" type="button" disabled={isPreviewPending("TOMORROW_19") || !canPreview} onClick={() => onPreviewReminder("TOMORROW_19")}>
            {isPreviewPending("TOMORROW_19") ? translate("devCenter.working") : translate("devCenter.previewTomorrowReminder")}
          </button>
        </div>
      </section>

      <section className="dev-center__cleanup">
        <div>
          <h3>{translate("devCenter.clearTitle")}</h3>
          <p>{translate("devCenter.clearDescription")}</p>
        </div>
        {isConfirmingClear ? (
          <div className="dev-center__confirm" role="alert">
            <p>{translate("devCenter.clearConfirmation")}</p>
            <div className="button-row">
              <button className="button" type="button" disabled={isWorking} onClick={() => setIsConfirmingClear(false)}>
                {translate("common.cancel")}
              </button>
              <button className="button button--danger" type="button" disabled={isWorking || !canMutate} onClick={clear}>
                {isWorking ? translate("devCenter.working") : translate("devCenter.clearAction")}
              </button>
            </div>
          </div>
        ) : (
          <button className="button button--danger" type="button" disabled={isWorking || !canMutate} onClick={() => setIsConfirmingClear(true)}>
            {translate("devCenter.clearAction")}
          </button>
        )}
      </section>

      {lastResult?.type === "generated" && (
        <StateCard
          message={translate("devCenter.generated", { count: lastResult.generatedJobCount })}
          status="status"
        />
      )}
      {lastResult?.type === "cleared" && (
        <StateCard
          message={translate("devCenter.cleared", { count: lastResult.deleted })}
          status="status"
        />
      )}
      {lastResult?.type === "reminder-preview" && (
        <StateCard
          message={translate("devCenter.reminderPreviewResult", {
            count: lastResult.reminder.jobCount,
            attention: lastResult.reminder.attentionCount,
          })}
          status="status"
        />
      )}
      {hasError && <StateCard message={translate("devCenter.error")} status="alert" isError />}
    </section>
  );
}

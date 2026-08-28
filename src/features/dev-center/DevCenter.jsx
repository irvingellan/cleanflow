import { useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";

const scenarios = [
  { id: "quick", label: "devCenter.quick", description: "devCenter.quickDescription" },
  { id: "busyWeek", label: "devCenter.busyWeek", description: "devCenter.busyWeekDescription" },
  { id: "payoutTest", label: "devCenter.payoutTest", description: "devCenter.payoutTestDescription" },
  { id: "managerTraining", label: "devCenter.managerTraining", description: "devCenter.managerTrainingDescription" },
];

export function DevCenter({ access, isWorking, hasError, lastResult, onGenerate, onClear }) {
  const { translate } = useTranslation();
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

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
              disabled={isWorking}
              onClick={() => generate(scenario.id)}
            >
              {isWorking ? translate("devCenter.working") : translate("devCenter.generate")}
            </button>
          </article>
        ))}
      </div>

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
              <button className="button button--danger" type="button" disabled={isWorking} onClick={clear}>
                {isWorking ? translate("devCenter.working") : translate("devCenter.clearAction")}
              </button>
            </div>
          </div>
        ) : (
          <button className="button button--danger" type="button" disabled={isWorking} onClick={() => setIsConfirmingClear(true)}>
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
      {hasError && <StateCard message={translate("devCenter.error")} status="alert" isError />}
    </section>
  );
}

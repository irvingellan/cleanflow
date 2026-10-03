import { useState } from "react";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { NotificationDiagnostics } from "./NotificationDiagnostics.jsx";
import { NotificationChannelDiagnostics } from "../notifications/NotificationChannelDiagnostics.jsx";

const scenarios = [
  { id: "quick", label: "devCenter.quick", description: "devCenter.quickDescription" },
  { id: "busyWeek", label: "devCenter.busyWeek", description: "devCenter.busyWeekDescription" },
  { id: "payoutTest", label: "devCenter.payoutTest", description: "devCenter.payoutTestDescription" },
  { id: "managerTraining", label: "devCenter.managerTraining", description: "devCenter.managerTrainingDescription" },
  { id: "weeklyClose", label: "devCenter.weeklyClose", description: "devCenter.weeklyCloseDescription" },
];

export function DevCenter({
  access,
  isWorking,
  pendingPreviewType,
  hasError,
  lastResult,
  diagnostics,
  isLoadingDiagnostics,
  hasDiagnosticsError,
  onGenerate,
  onClear,
  onPreviewReminder,
  onRefreshDiagnostics,
  notificationUserId,
}) {
  const { translate } = useTranslation();
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isResettingBaseline, setIsResettingBaseline] = useState(false);
  const [advancedNotificationCheck, setAdvancedNotificationCheck] = useState(0);
  const canMutate = access.authorized && ["emulator", "sandbox"].includes(access.environment);
  const canPreview = access.authorized;
  const isPreviewPending = (type) => pendingPreviewType === type;

  async function generate(scenario) {
    await onGenerate(scenario);
  }

  async function clear() {
    if (isResettingBaseline) await onGenerate("quick", { resetBaseline: true });
    else await onClear();
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
          {translate(`devCenter.environment.${access.environment || "unknown"}`)}
        </span>
      </div>

      {!canMutate && <StateCard message={translate("devCenter.mutationsSafeOnly")} status="status" />}

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
            <p>{translate(isResettingBaseline ? "devCenter.resetConfirmation" : "devCenter.clearConfirmation")}</p>
            <div className="button-row">
              <button className="button" type="button" disabled={isWorking} onClick={() => setIsConfirmingClear(false)}>
                {translate("common.cancel")}
              </button>
              <button className="button button--danger" type="button" disabled={isWorking || !canMutate} onClick={clear}>
                {isWorking ? translate("devCenter.working") : translate(isResettingBaseline ? "devCenter.resetAction" : "devCenter.clearAction")}
              </button>
            </div>
          </div>
        ) : (
          <div className="button-row">
          <button className="button button--danger" type="button" disabled={isWorking || !canMutate} onClick={() => { setIsResettingBaseline(false); setIsConfirmingClear(true); }}>
            {translate("devCenter.clearAction")}
          </button>
          <button className="button button--secondary" type="button" disabled={isWorking || !canMutate} onClick={() => { setIsResettingBaseline(true); setIsConfirmingClear(true); }}>
            {translate("devCenter.resetAction")}
          </button>
          </div>
        )}
      </section>

      <NotificationDiagnostics
        diagnostics={diagnostics}
        isLoading={isLoadingDiagnostics}
        hasError={hasDiagnosticsError}
        onRefresh={onRefreshDiagnostics}
      />
      <section className="dev-center__diagnostics dev-center__advanced-notifications">
        <button className="button button--small" type="button" onClick={() => setAdvancedNotificationCheck((count) => count + 1)}>
          {translate("devCenter.runAdvancedProviderChecks")}
        </button>
        <p>{translate("devCenter.advancedProviderChecksNote")}</p>
        {advancedNotificationCheck > 0 && (
          <NotificationChannelDiagnostics key={advancedNotificationCheck} userId={notificationUserId} />
        )}
      </section>
      <p className="dev-center__internal-link">
        <a className="button button--small" href="/diagnostics/load-times">
          {translate("loadDiagnostics.open")}
        </a>
      </p>

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
      <ScrollToTopButton threshold={600} />
    </section>
  );
}

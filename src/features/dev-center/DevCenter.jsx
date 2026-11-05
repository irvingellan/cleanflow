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

  const results = (
    <>
      {lastResult?.type === "generated" && (
        <StateCard message={translate("devCenter.generated", { count: lastResult.generatedJobCount })} status="status" />
      )}
      {lastResult?.type === "cleared" && (
        <StateCard message={translate("devCenter.cleared", { count: lastResult.deleted })} status="status" />
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
    </>
  );

  return (
    <section className="dev-center" aria-labelledby="dev-center-title">
      <header className="cf-page-header">
        <div className="cf-page-header__text">
          <h2 id="dev-center-title" className="list-title">{translate("devCenter.title")}</h2>
          <p className="cf-page-context">{translate("devCenter.intro")}</p>
        </div>
        <div className="cf-page-header__actions">
          <span className={`dev-center__environment dev-center__environment--${access.environment || "unknown"}`}>
            {translate(`devCenter.environment.${access.environment || "unknown"}`)}
          </span>
        </div>
      </header>

      <div className="dev-center__results">{results}</div>

      <section className="cf-block dev-center__block" aria-labelledby="dev-center-demo-title">
        <div className="cf-block__header">
          <div>
            <h3 id="dev-center-demo-title">{translate("devCenter.demoSection")}</h3>
            <p className="cf-block__subtitle">
              {canMutate
                ? `${translate("devCenter.demoJobCount")}: ${access.demoJobCount || 0}`
                : translate("devCenter.mutationsSafeOnly")}
            </p>
          </div>
        </div>
        {canMutate && (
          <>
            <div className="dev-center__rows">
              {scenarios.map((scenario) => (
                <article key={scenario.id} className="dev-center__row">
                  <div>
                    <h4>{translate(scenario.label)}</h4>
                    <p>{translate(scenario.description)}</p>
                  </div>
                  <button className="button button--small" type="button" disabled={isWorking} onClick={() => generate(scenario.id)}>
                    {isWorking ? translate("devCenter.working") : translate("devCenter.generate")}
                  </button>
                </article>
              ))}
              <article className="dev-center__row">
                <div>
                  <h4>{translate("devCenter.clearTitle")}</h4>
                  <p role={isConfirmingClear ? "alert" : undefined}>{isConfirmingClear
                    ? translate(isResettingBaseline ? "devCenter.resetConfirmation" : "devCenter.clearConfirmation")
                    : translate("devCenter.clearDescription")}</p>
                </div>
                {isConfirmingClear ? (
                  <div className="button-row" role="group">
                    <button className="button button--small" type="button" disabled={isWorking} onClick={() => setIsConfirmingClear(false)}>
                      {translate("common.cancel")}
                    </button>
                    <button className="button button--small button--danger" type="button" disabled={isWorking} onClick={clear}>
                      {isWorking ? translate("devCenter.working") : translate(isResettingBaseline ? "devCenter.resetAction" : "devCenter.clearAction")}
                    </button>
                  </div>
                ) : (
                  <div className="button-row">
                    <button className="button button--small" type="button" disabled={isWorking} onClick={() => { setIsResettingBaseline(true); setIsConfirmingClear(true); }}>
                      {translate("devCenter.resetAction")}
                    </button>
                    <button className="button button--small button--danger" type="button" disabled={isWorking} onClick={() => { setIsResettingBaseline(false); setIsConfirmingClear(true); }}>
                      {translate("devCenter.clearAction")}
                    </button>
                  </div>
                )}
              </article>
            </div>
          </>
        )}
      </section>

      <section className="cf-block dev-center__block" aria-labelledby="dev-center-reminder-title">
        <div className="cf-block__header">
          <div>
            <h3 id="dev-center-reminder-title">{translate("devCenter.reminderPreviewTitle")}</h3>
            <p className="cf-block__subtitle">
              {translate("devCenter.reminderPreviewDescription")}
              {!canMutate && <> <strong>{translate("devCenter.readOnlyProductionData")}</strong> {translate("devCenter.readOnlyPreviewSafety")}</>}
            </p>
          </div>
          <div className="button-row">
            <button className="button button--small" type="button" disabled={isPreviewPending("TODAY_07") || !canPreview} onClick={() => onPreviewReminder("TODAY_07")}>
              {isPreviewPending("TODAY_07") ? translate("devCenter.working") : translate("devCenter.previewTodayReminder")}
            </button>
            <button className="button button--small" type="button" disabled={isPreviewPending("TOMORROW_19") || !canPreview} onClick={() => onPreviewReminder("TOMORROW_19")}>
              {isPreviewPending("TOMORROW_19") ? translate("devCenter.working") : translate("devCenter.previewTomorrowReminder")}
            </button>
          </div>
        </div>
      </section>

      <NotificationDiagnostics
        userId={notificationUserId}
        diagnostics={diagnostics}
        isLoading={isLoadingDiagnostics}
        hasError={hasDiagnosticsError}
        onRefresh={onRefreshDiagnostics}
      />
      <section className="cf-block dev-center__block" aria-labelledby="dev-center-tools-title">
        <div className="cf-block__header">
          <div>
            <h3 id="dev-center-tools-title">{translate("devCenter.toolsTitle")}</h3>
            <p className="cf-block__subtitle">{translate("devCenter.advancedProviderChecksNote")}</p>
          </div>
          <div className="button-row">
            <button className="button button--small" type="button" onClick={() => setAdvancedNotificationCheck((count) => count + 1)}>
              {translate("devCenter.runAdvancedProviderChecks")}
            </button>
            <a className="button button--small" href="/diagnostics/load-times">{translate("loadDiagnostics.open")}</a>
          </div>
        </div>
        {advancedNotificationCheck > 0 && (
          <NotificationChannelDiagnostics key={advancedNotificationCheck} userId={notificationUserId} />
        )}
      </section>
      <ScrollToTopButton threshold={600} />
    </section>
  );
}

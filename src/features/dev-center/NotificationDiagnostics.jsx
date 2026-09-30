import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { readLocalNotificationHealth } from "../notifications/notificationHealthService.js";
import { sendDeveloperTestNotification } from "./devCenterService.js";

const localeByLanguage = { en: "en-US", pt: "pt-BR", es: "es-ES" };

function formatTimestamp(value, language, translate) {
  if (!value) return translate("common.notProvided");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate("common.notProvided");
  return new Intl.DateTimeFormat(localeByLanguage[language] || "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function deliveryStatusLabel(status, translate) {
  return translate(`devCenter.deliveryStatus${status}`);
}

function countOrUnknown(value, translate) {
  return Number.isFinite(value) ? value : translate("common.notProvided");
}

export function NotificationDiagnostics({ diagnostics, isLoading, hasError, onRefresh }) {
  const { language, translate } = useTranslation();
  const [localHealth, setLocalHealth] = useState(null);
  const [targetRegistrationId, setTargetRegistrationId] = useState("");
  const [isConfirmingTest, setIsConfirmingTest] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);
  const activeDevices = (diagnostics?.devices || []).filter((device) => device.active && device.registrationId);
  const selectedDevice = activeDevices.find((device) => device.registrationId === targetRegistrationId);
  const healthOnlyReports = (diagnostics?.healthReports || []).filter((report) =>
    !(diagnostics?.devices || []).some((device) => device.registrationId === report.registrationId));

  async function refreshLocalHealth() {
    try {
      setLocalHealth(await readLocalNotificationHealth());
    } catch {
      setLocalHealth({ error: true });
    }
  }

  useEffect(() => {
    let current = true;
    readLocalNotificationHealth()
      .then((health) => current && setLocalHealth(health))
      .catch(() => current && setLocalHealth({ error: true }));
    return () => { current = false; };
  }, []);

  async function sendTest() {
    if (!isConfirmingTest || !selectedDevice || isSendingTest) return;
    setIsSendingTest(true);
    setTestError(null);
    setTestResult(null);
    try {
      setTestResult(await sendDeveloperTestNotification(selectedDevice.registrationId));
      onRefresh?.();
    } catch (error) {
      setTestError(error?.code === "functions/resource-exhausted" ? "cooldown" : "failed");
    } finally {
      setIsSendingTest(false);
      setIsConfirmingTest(false);
    }
  }

  return (
    <section className="dev-center__diagnostics" aria-labelledby="notification-diagnostics-title">
      <div className="dev-center__diagnostics-header">
        <div>
          <h3 id="notification-diagnostics-title">{translate("devCenter.notificationLabTitle")}</h3>
          <p>{translate("devCenter.notificationLabDescription")}</p>
          <p className="dev-center__diagnostics-note">{translate("devCenter.notificationDiagnosticsSemantics")}</p>
        </div>
        <button className="button button--small" type="button" disabled={isLoading} onClick={onRefresh}>
          {isLoading ? translate("devCenter.working") : translate("devCenter.refreshDiagnostics")}
        </button>
      </div>

      {hasError && <p className="dev-center__diagnostics-error" role="alert">{translate("devCenter.notificationDiagnosticsError")}</p>}
      {isLoading && <p>{translate("devCenter.notificationDiagnosticsLoading")}</p>}

      <section className="dev-center__lab-block" aria-labelledby="notification-lab-browser-title">
        <div className="dev-center__diagnostics-header">
          <div>
            <h4 id="notification-lab-browser-title">{translate("devCenter.thisBrowserNotifications")}</h4>
            <p>{translate("devCenter.localHealthReadOnly")}</p>
          </div>
          <button className="button button--small" type="button" onClick={refreshLocalHealth}>
            {translate("devCenter.refreshLocalHealth")}
          </button>
        </div>
        {!localHealth && <p>{translate("devCenter.notificationDiagnosticsLoading")}</p>}
        {localHealth?.error && <p role="alert">{translate("devCenter.localHealthUnavailable")}</p>}
        {localHealth && !localHealth.error && (
          <ul className="dev-center__diagnostics-list">
            <li>
              <span>{translate("devCenter.browserPermission")}: {translate(`devCenter.healthPermission${localHealth.notificationPermission}`)}</span>
              <span>{translate("devCenter.healthServiceWorker")}: {translate(`devCenter.healthWorker${localHealth.serviceWorker}`)}</span>
              <span>{translate("devCenter.fcmRegistration")}: {translate(`devCenter.healthFcm${localHealth.fcmRegistration}`)}</span>
              <span>{translate("devCenter.deviceId")}: {localHealth.deviceId?.slice(-8) || translate("devCenter.localDeviceNotCreated")}</span>
              <span>{translate("devCenter.healthLastChecked")}: {formatTimestamp(localHealth.checkedAt, language, translate)}</span>
            </li>
          </ul>
        )}
      </section>

      {!isLoading && diagnostics && (
        <div className="dev-center__diagnostics-grid">
          <section>
            <h4>{translate("devCenter.registeredDevices")}</h4>
            {diagnostics.devices.length === 0 ? (
              <p>{translate("devCenter.noRegisteredDevices")}</p>
            ) : (
              <ul className="dev-center__diagnostics-list">
                {diagnostics.devices.map((device) => {
                  const health = (diagnostics.healthReports || []).find((report) => report.registrationId === device.registrationId);
                  return <li key={device.registrationId || device.deviceId}>
                    <strong>{device.userEmail || translate("devCenter.unknownAccount")}</strong>
                    <span>{translate("devCenter.deviceId")}: {device.deviceId}</span>
                    <span>{translate("devCenter.platform")}: {device.platform}</span>
                    <span>{translate("devCenter.language")}: {device.language || translate("common.notProvided")}</span>
                    <span>{device.active ? translate("devCenter.deviceActive") : translate("devCenter.deviceInactive")}</span>
                    <span>{translate("devCenter.created")}: {formatTimestamp(device.createdAt, language, translate)}</span>
                    <span>{translate("devCenter.lastSeen")}: {formatTimestamp(device.lastSeenAt, language, translate)}</span>
                    <span>{translate("devCenter.updated")}: {formatTimestamp(device.updatedAt, language, translate)}</span>
                    {health ? (
                      <>
                        <span>{translate("devCenter.browserPermission")}: {translate(`devCenter.healthPermission${health.notificationPermission}`)}</span>
                        <span>{translate("devCenter.healthServiceWorker")}: {translate(`devCenter.healthWorker${health.serviceWorker}`)}</span>
                        <span>{translate("devCenter.fcmRegistration")}: {translate(`devCenter.healthFcm${health.fcmRegistration}`)}</span>
                        <span>{translate("devCenter.healthLastReported")}: {formatTimestamp(health.checkedAt, language, translate)}</span>
                      </>
                    ) : <span>{translate("devCenter.noDeviceHealth")}</span>}
                  </li>;
                })}
              </ul>
            )}
            {healthOnlyReports.length > 0 && (
              <>
                <h5>{translate("devCenter.healthWithoutRegistration")}</h5>
                <ul className="dev-center__diagnostics-list">
                  {healthOnlyReports.map((health) => (
                    <li key={health.registrationId}>
                      <strong>{health.userEmail || translate("devCenter.unknownAccount")}</strong>
                      <span>{translate("devCenter.deviceId")}: {health.deviceId}</span>
                      <span>{translate("devCenter.browserPermission")}: {translate(`devCenter.healthPermission${health.notificationPermission}`)}</span>
                      <span>{translate("devCenter.healthServiceWorker")}: {translate(`devCenter.healthWorker${health.serviceWorker}`)}</span>
                      <span>{translate("devCenter.fcmRegistration")}: {translate(`devCenter.healthFcm${health.fcmRegistration}`)}</span>
                      <span>{translate("devCenter.healthLastReported")}: {formatTimestamp(health.checkedAt, language, translate)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section>
            <h4>{translate("devCenter.recentReminderDeliveries")}</h4>
            {diagnostics.deliveries.length === 0 ? (
              <p>{translate("devCenter.noReminderDeliveries")}</p>
            ) : (
              <ul className="dev-center__diagnostics-list">
                {diagnostics.deliveries.map((delivery, index) => (
                  <li key={`${delivery.reminderType}-${delivery.targetDate}-${index}`}>
                    <strong>{deliveryStatusLabel(delivery.deliveryStatus, translate)}</strong>
                    <span>{delivery.reminderType} · {delivery.targetDate || translate("common.notProvided")}</span>
                    <span>{translate("devCenter.deliveryProvider")}: {delivery.deliveryProvider === "onesignal" ? translate("devCenter.oneSignal") : translate("devCenter.fcm")}</span>
                    <span>{translate("devCenter.timezone")}: {delivery.timezone || translate("common.notProvided")}</span>
                    <span>{translate("devCenter.jobs")}: {delivery.jobCount} · {translate("devCenter.attention")}: {delivery.attentionCount}</span>
                    {delivery.deliveryProvider === "onesignal" ? (
                      <>
                        <span>{translate("devCenter.attemptedRecipients")}: {delivery.attemptedRecipients} · {translate("devCenter.oneSignalAccepted")}: {delivery.acceptedRecipients}</span>
                        <span>{translate("devCenter.providerFailed")}: {delivery.failedRecipients} · {translate("devCenter.noActiveRecipients")}: {delivery.noActiveRecipients}</span>
                      </>
                    ) : (
                      <>
                        <span>{translate("devCenter.attempted")}: {delivery.attemptedDevices} · {translate("devCenter.fcmAccepted")}: {delivery.deliveredDevices}</span>
                        <span>{translate("devCenter.providerFailed")}: {delivery.failedDevices} · {translate("devCenter.invalidated")}: {delivery.invalidatedDevices}</span>
                      </>
                    )}
                    <span>{translate("devCenter.attemptedAt")}: {formatTimestamp(delivery.attemptedAt, language, translate)}</span>
                    {delivery.sentAt && <span>{translate("devCenter.sentAt")}: {formatTimestamp(delivery.sentAt, language, translate)}</span>}
                    {delivery.failedAt && <span>{translate("devCenter.failedAt")}: {formatTimestamp(delivery.failedAt, language, translate)}</span>}
                    {delivery.failureCode && <span>{translate("devCenter.failure")}: {delivery.failureCode}</span>}
                    {delivery.failureSummary && <span>{delivery.failureSummary}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4>{translate("devCenter.recentChecklistReviewNotifications")}</h4>
            {(diagnostics.reviewDeliveries || []).length === 0 ? <p>{translate("devCenter.noChecklistReviewNotifications")}</p> : (
              <ul className="dev-center__diagnostics-list">
                {diagnostics.reviewDeliveries.map((delivery, index) => (
                  <li key={`${delivery.createdAt || "review"}-${index}`}>
                    <strong>{translate(`devCenter.reviewStatus${delivery.deliveryStatus}`)}</strong>
                    <span>{translate("devCenter.created")}: {formatTimestamp(delivery.createdAt, language, translate)}</span>
                    <span>{translate("devCenter.attempted")}: {countOrUnknown(delivery.targetDeviceCount, translate)} · {translate("devCenter.fcmAccepted")}: {countOrUnknown(delivery.acceptedByFcmDevices, translate)} · {translate("devCenter.providerFailed")}: {countOrUnknown(delivery.failedDevices, translate)}</span>
                    {delivery.failureCode && <span>{translate("devCenter.failure")}: {delivery.failureCode}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4>{translate("devCenter.developerTestHistory")}</h4>
            {(diagnostics.developerTests || []).length === 0 ? <p>{translate("devCenter.noDeveloperTests")}</p> : (
              <ul className="dev-center__diagnostics-list">
                {diagnostics.developerTests.map((attempt, index) => (
                  <li key={`${attempt.attemptedAt || "test"}-${index}`}>
                    <strong>{translate(`devCenter.testStatus${attempt.status}`)}</strong>
                    <span>{translate("devCenter.deviceId")}: {attempt.targetDeviceId || translate("common.notProvided")}</span>
                    <span>{translate("devCenter.attemptedAt")}: {formatTimestamp(attempt.attemptedAt, language, translate)}</span>
                    {attempt.failureCode && <span>{translate("devCenter.failure")}: {attempt.failureCode}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {!isLoading && diagnostics && (
        <section className="dev-center__lab-block" aria-labelledby="notification-lab-test-title">
          <h4 id="notification-lab-test-title">{translate("devCenter.sendTestNotification")}</h4>
          <p>{translate("devCenter.testNotificationExplanation")}</p>
          <label className="dev-center__lab-target">
            <span>{translate("devCenter.testTargetDevice")}</span>
            <select
              value={targetRegistrationId}
              disabled={isSendingTest || activeDevices.length === 0}
              onChange={(event) => {
                setTargetRegistrationId(event.target.value);
                setIsConfirmingTest(false);
                setTestResult(null);
                setTestError(null);
              }}
            >
              <option value="">{translate("devCenter.selectTestDevice")}</option>
              {activeDevices.map((device) => (
                <option value={device.registrationId} key={device.registrationId}>
                  {device.userEmail || translate("devCenter.unknownAccount")} · {device.deviceId}
                </option>
              ))}
            </select>
          </label>
          {activeDevices.length === 0 && <p>{translate("devCenter.noActiveTestDevices")}</p>}
          {!isConfirmingTest ? (
            <button className="button" type="button" disabled={!selectedDevice || isSendingTest} onClick={() => setIsConfirmingTest(true)}>
              {translate("devCenter.prepareTestNotification")}
            </button>
          ) : (
            <div className="dev-center__confirm" role="group" aria-label={translate("devCenter.testConfirmationTitle")}>
              <p>{translate("devCenter.testConfirmationDescription", { device: selectedDevice?.deviceId || "" })}</p>
              <div className="button-row">
                <button className="button" type="button" disabled={isSendingTest} onClick={() => setIsConfirmingTest(false)}>{translate("common.cancel")}</button>
                <button className="button button--primary" type="button" disabled={!selectedDevice || isSendingTest} onClick={sendTest}>
                  {isSendingTest ? translate("devCenter.working") : translate("devCenter.confirmSendTest")}
                </button>
              </div>
            </div>
          )}
          {testResult && <p role="status">{translate(
            testResult.providerAccepted === true ? "devCenter.testProviderAccepted"
              : testResult.providerAccepted === false ? "devCenter.testProviderNotAccepted"
                : "devCenter.testProviderUnknown",
          )}</p>}
          {testError && <p role="alert">{translate(testError === "cooldown" ? "devCenter.testCooldown" : "devCenter.testFailed")}</p>}
        </section>
      )}
    </section>
  );
}

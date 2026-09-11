import { useTranslation } from "../../i18n/translations.js";

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

export function NotificationDiagnostics({ diagnostics, isLoading, hasError, onRefresh }) {
  const { language, translate } = useTranslation();

  return (
    <section className="dev-center__diagnostics" aria-labelledby="notification-diagnostics-title">
      <div className="dev-center__diagnostics-header">
        <div>
          <h3 id="notification-diagnostics-title">{translate("devCenter.notificationDiagnosticsTitle")}</h3>
          <p>{translate("devCenter.notificationDiagnosticsDescription")}</p>
          <p className="dev-center__diagnostics-note">{translate("devCenter.notificationDiagnosticsSemantics")}</p>
        </div>
        <button className="button button--small" type="button" disabled={isLoading} onClick={onRefresh}>
          {isLoading ? translate("devCenter.working") : translate("devCenter.refreshDiagnostics")}
        </button>
      </div>

      {hasError && <p className="dev-center__diagnostics-error" role="alert">{translate("devCenter.notificationDiagnosticsError")}</p>}
      {isLoading && <p>{translate("devCenter.notificationDiagnosticsLoading")}</p>}

      {!isLoading && diagnostics && (
        <div className="dev-center__diagnostics-grid">
          <section>
            <h4>{translate("devCenter.registeredDevices")}</h4>
            {diagnostics.devices.length === 0 ? (
              <p>{translate("devCenter.noRegisteredDevices")}</p>
            ) : (
              <ul className="dev-center__diagnostics-list">
                {diagnostics.devices.map((device) => (
                  <li key={device.deviceId}>
                    <strong>{device.userEmail || translate("devCenter.unknownAccount")}</strong>
                    <span>{translate("devCenter.deviceId")}: {device.deviceId}</span>
                    <span>{translate("devCenter.platform")}: {device.platform}</span>
                    <span>{translate("devCenter.language")}: {device.language || translate("common.notProvided")}</span>
                    <span>{device.active ? translate("devCenter.deviceActive") : translate("devCenter.deviceInactive")}</span>
                    <span>{translate("devCenter.created")}: {formatTimestamp(device.createdAt, language, translate)}</span>
                    <span>{translate("devCenter.lastSeen")}: {formatTimestamp(device.lastSeenAt, language, translate)}</span>
                    <span>{translate("devCenter.updated")}: {formatTimestamp(device.updatedAt, language, translate)}</span>
                  </li>
                ))}
              </ul>
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
        </div>
      )}
    </section>
  );
}

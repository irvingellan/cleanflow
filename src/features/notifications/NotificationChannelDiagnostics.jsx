import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { getPushChannelDiagnostics } from "./notificationService.js";

function oneSignalFailureKey({ errorStage, errorCode }) {
  const suffixByCode = {
    timeout: "Timeout",
    originConfig: "OriginConfig",
    workerRegistration: "WorkerRegistration",
    unsupported: "Unsupported",
    failed: "Failed",
  };
  const detailedStage = errorStage === "initialization" || errorStage === "sdkLoad";
  const suffix = detailedStage
    ? suffixByCode[errorCode] || "Failed"
    : errorCode === "timeout" ? "Timeout" : "Failed";
  return `devCenter.oneSignalFailure${errorStage}${suffix}`;
}

export function NotificationChannelDiagnostics({ userId }) {
  const { translate } = useTranslation();
  const [diagnostics, setDiagnostics] = useState(null);

  useEffect(() => {
    let current = true;

    getPushChannelDiagnostics(userId)
      .then((result) => current && setDiagnostics(result))
      .catch(() => current && setDiagnostics({ error: true }));

    return () => {
      current = false;
    };
  }, [userId]);

  return (
    <section className="dev-center__browser-notification-diagnostics" aria-labelledby="browser-notification-diagnostics-title">
      <h4 id="browser-notification-diagnostics-title">{translate("devCenter.thisBrowserNotifications")}</h4>
      {!diagnostics && <p>{translate("devCenter.notificationDiagnosticsLoading")}</p>}
      {diagnostics?.error && <p role="alert">{translate("devCenter.notificationDiagnosticsError")}</p>}
      {diagnostics && !diagnostics.error && (
        <ul className="dev-center__diagnostics-list">
          <li>
            <span>{translate("devCenter.browserPermission")}: {diagnostics.browserPermission}</span>
            <span>{translate("devCenter.fcmRegistration")}: {translate(`devCenter.fcm${diagnostics.fcm.state}`)}</span>
            <span>{translate("devCenter.oneSignalInitialized")}: {diagnostics.oneSignal.initialized ? translate("common.yes") : translate("common.no")}</span>
            <span>{translate("devCenter.oneSignalSubscription")}: {translate(`devCenter.oneSignal${diagnostics.oneSignal.state}`)}</span>
            {diagnostics.oneSignal.originState && <span>{translate("devCenter.oneSignalOrigin")}: {translate(`devCenter.oneSignalOrigin${diagnostics.oneSignal.originState}`)}</span>}
            {diagnostics.oneSignal.sdkState && <span>{translate("devCenter.oneSignalSdk")}: {translate(`devCenter.oneSignalSdk${diagnostics.oneSignal.sdkState}`)}</span>}
            {diagnostics.oneSignalWorker && <span>{translate("devCenter.oneSignalWorker")}: {translate(`devCenter.oneSignalWorker${diagnostics.oneSignalWorker.state}`)}</span>}
            {diagnostics.oneSignal.errorStage && (
              <span>{translate("devCenter.oneSignalFailure")}: {translate(oneSignalFailureKey(diagnostics.oneSignal))}</span>
            )}
            {diagnostics.oneSignal.subscriptionId && <span>{translate("devCenter.oneSignalSubscriptionId")}: {diagnostics.oneSignal.subscriptionId}</span>}
          </li>
        </ul>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import {
  enablePushNotifications,
  getPushChannelDiagnostics,
} from "./notificationService.js";
import { reportCurrentManagerNotificationHealth } from "./notificationHealthReporter.js";

export function NotificationControl({ userId }) {
  const { language, translate } = useTranslation();
  const [state, setState] = useState("checking");

  useEffect(() => {
    let isCurrent = true;

    async function checkPushNotifications() {
      try {
        const result = await getPushChannelDiagnostics(userId);
        if (isCurrent) {
          setState(result.state);
          void reportCurrentManagerNotificationHealth();
        }
      } catch {
        if (isCurrent) {
          setState("error");
          void reportCurrentManagerNotificationHealth();
        }
      }
    }

    checkPushNotifications();
    return () => {
      isCurrent = false;
    };
  }, [language, userId]);

  async function enableNotifications() {
    setState("enabling");

    try {
      const result = await enablePushNotifications({ userId });
      setState(result.state);
    } catch {
      setState("error");
    } finally {
      void reportCurrentManagerNotificationHealth();
    }
  }

  async function recheckNotifications() {
    setState("checking");

    try {
      const result = await getPushChannelDiagnostics(userId);
      setState(result.state);
    } catch {
      // A provider failure after the user changes browser settings is not
      // evidence that permission is still denied.
      setState(globalThis.Notification?.permission === "denied" ? "denied" : "error");
    } finally {
      void reportCurrentManagerNotificationHealth();
    }
  }

  const status = {
    checking: { label: "notifications.checking", disabled: true },
    unavailable: { label: "notifications.unavailable", disabled: true },
    denied: { label: "notifications.denied", disabled: true },
    ready: { label: "notifications.enable", disabled: false },
    enabling: { label: "notifications.enabling", disabled: true },
    enabled: { label: "notifications.enabled", disabled: true },
    incomplete: { label: "notifications.incomplete", disabled: false },
    error: { label: "notifications.error", disabled: false },
  }[state];

  return (
    <>
      <button
        className={`notification-control notification-control--${state}`}
        type="button"
        disabled={status.disabled}
        aria-label={translate(status.label)}
        title={translate(status.label)}
        onClick={enableNotifications}
      >
        <span aria-hidden="true">🔔</span>
        <span className="notification-control__label">{translate(status.label)}</span>
      </button>
      {state === "denied" && (
        <div className="notification-control__recovery" role="status">
          <span>{translate("notifications.deniedGuidance")}</span>
          <button type="button" onClick={recheckNotifications}>
            {translate("notifications.checkAgain")}
          </button>
        </div>
      )}
    </>
  );
}

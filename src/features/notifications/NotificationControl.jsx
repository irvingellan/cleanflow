import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import {
  enablePushNotifications,
  pushNotificationsAvailable,
  refreshPushNotifications,
} from "./notificationService.js";

export function NotificationControl() {
  const { translate } = useTranslation();
  const [state, setState] = useState("checking");

  useEffect(() => {
    let isCurrent = true;

    async function checkPushNotifications() {
      if (!(await pushNotificationsAvailable())) {
        if (isCurrent) setState("unavailable");
        return;
      }

      if (Notification.permission === "denied") {
        if (isCurrent) setState("denied");
        return;
      }

      if (Notification.permission !== "granted") {
        if (isCurrent) setState("ready");
        return;
      }

      try {
        await refreshPushNotifications();
        if (isCurrent) setState("enabled");
      } catch {
        if (isCurrent) setState("error");
      }
    }

    checkPushNotifications();
    return () => {
      isCurrent = false;
    };
  }, []);

  async function enableNotifications() {
    setState("enabling");

    try {
      const result = await enablePushNotifications();
      setState(result.state === "enabled" ? "enabled" : result.state === "denied" ? "denied" : "ready");
    } catch {
      setState("error");
    }
  }

  const status = {
    checking: { label: "notifications.checking", disabled: true },
    unavailable: { label: "notifications.unavailable", disabled: true },
    denied: { label: "notifications.denied", disabled: true },
    ready: { label: "notifications.enable", disabled: false },
    enabling: { label: "notifications.enabling", disabled: true },
    enabled: { label: "notifications.enabled", disabled: true },
    error: { label: "notifications.error", disabled: false },
  }[state];

  return (
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
  );
}

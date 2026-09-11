import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import {
  enablePushNotifications,
  getPushChannelDiagnostics,
} from "./notificationService.js";

export function NotificationControl({ userId }) {
  const { language, translate } = useTranslation();
  const [state, setState] = useState("checking");

  useEffect(() => {
    let isCurrent = true;

    async function checkPushNotifications() {
      try {
        const result = await getPushChannelDiagnostics(userId);
        if (isCurrent) setState(result.state);
      } catch {
        if (isCurrent) setState("error");
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

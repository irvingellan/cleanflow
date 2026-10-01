import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import {
  enablePushNotifications,
  getPushChannelDiagnostics,
  testCurrentDeviceNotifications,
} from "./notificationService.js";
import { reportCurrentManagerNotificationHealth } from "./notificationHealthReporter.js";

export function NotificationControl({ userId }) {
  const { language, translate } = useTranslation();
  const [state, setState] = useState("checking");
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const currentUserRef = useRef(userId);
  const previousUserRef = useRef(userId);
  const operationRef = useRef(0);
  const busyRef = useRef(false);
  currentUserRef.current = userId;

  useEffect(() => () => { operationRef.current += 1; }, []);

  useEffect(() => {
    let isCurrent = true;
    if (previousUserRef.current !== userId) {
      previousUserRef.current = userId;
      operationRef.current += 1;
      busyRef.current = false;
      setState("checking");
      setTestResult(null);
      setIsTesting(false);
      setIsActionPending(false);
    }
    const operation = operationRef.current;

    async function checkPushNotifications() {
      try {
        const result = await getPushChannelDiagnostics(userId);
        if (isCurrent && operation === operationRef.current && !busyRef.current) {
          setState(result.state);
          void reportCurrentManagerNotificationHealth();
        }
      } catch {
        if (isCurrent && operation === operationRef.current && !busyRef.current) {
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

  function beginAction() {
    if (busyRef.current) return null;
    busyRef.current = true;
    setIsActionPending(true);
    return ++operationRef.current;
  }

  function isCurrentAction(operation) {
    return operation === operationRef.current && currentUserRef.current === userId;
  }

  function finishAction(operation) {
    if (!isCurrentAction(operation)) return;
    busyRef.current = false;
    setIsActionPending(false);
    setIsTesting(false);
    void reportCurrentManagerNotificationHealth();
  }

  async function enableNotifications() {
    const operation = beginAction();
    if (operation === null) return;
    setTestResult(null);
    setState("enabling");

    try {
      const result = await enablePushNotifications({ userId });
      if (isCurrentAction(operation)) setState(result.state);
    } catch {
      if (isCurrentAction(operation)) setState("error");
    } finally {
      finishAction(operation);
    }
  }

  async function recheckNotifications() {
    const operation = beginAction();
    if (operation === null) return;
    setTestResult(null);
    setState("checking");

    try {
      const result = await getPushChannelDiagnostics(userId);
      if (isCurrentAction(operation)) setState(result.state);
    } catch {
      // A provider failure after the user changes browser settings is not
      // evidence that permission is still denied.
      if (isCurrentAction(operation)) {
        setState(globalThis.Notification?.permission === "denied" ? "denied" : "error");
      }
    } finally {
      finishAction(operation);
    }
  }

  async function testNotifications() {
    const operation = beginAction();
    if (operation === null) return;
    setTestResult(null);
    setIsTesting(true);

    try {
      // Invoke directly from the click: the service must retain the permission user gesture.
      const result = await testCurrentDeviceNotifications();
      if (!isCurrentAction(operation)) return;
      setTestResult(result.state);
      if (result.state === "fcm-accepted") setState("enabled");
      if (result.state === "permission-blocked") setState("denied");
      if (result.state === "permission-default") setState("ready");
      if (result.state === "unsupported") setState("unavailable");
      if (result.state === "registration-failed" || result.state === "fcm-rejected") setState("error");
      if (result.state === "unauthorized" || (state === "checking" && ["unknown", "cooldown"].includes(result.state))) {
        setState("error");
      }
    } catch {
      if (isCurrentAction(operation)) {
        setTestResult("unknown");
        if (state === "checking") setState("error");
      }
    } finally {
      finishAction(operation);
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
  const resultLabel = {
    "permission-blocked": "notifications.currentDevicePermissionBlocked",
    "permission-default": "notifications.currentDevicePermissionDefault",
    unsupported: "notifications.currentDeviceUnsupported",
    "registration-failed": "notifications.currentDeviceRegistrationFailed",
    "fcm-rejected": "notifications.currentDeviceRejected",
    "fcm-accepted": "notifications.currentDeviceAccepted",
    unknown: "notifications.currentDeviceUnknown",
    cooldown: "notifications.currentDeviceCooldown",
    unauthorized: "notifications.currentDeviceUnauthorized",
  }[testResult];

  return (
    <div className="notification-control__group">
      <button
        className={`notification-control notification-control--${state}`}
        type="button"
        disabled={status.disabled || isActionPending}
        aria-label={translate(status.label)}
        title={translate(status.label)}
        onClick={enableNotifications}
      >
        <span aria-hidden="true">🔔</span>
        <span className="notification-control__label">{translate(status.label)}</span>
      </button>
      <button
        className="notification-control notification-control__test"
        type="button"
        disabled={isActionPending}
        aria-busy={isTesting}
        onClick={testNotifications}
      >
        <span aria-hidden="true">🔔</span>
        <span>{translate(isTesting ? "notifications.currentDeviceTesting" : "notifications.currentDeviceTest")}</span>
      </button>
      {resultLabel && (
        <p className="notification-control__result" role="status">
          {translate(resultLabel)}
        </p>
      )}
      {state === "denied" && (
        <div className="notification-control__recovery" role="status">
          <span>{translate("notifications.deniedGuidance")}</span>
          <button type="button" disabled={isActionPending} onClick={recheckNotifications}>
            {translate("notifications.checkAgain")}
          </button>
        </div>
      )}
    </div>
  );
}

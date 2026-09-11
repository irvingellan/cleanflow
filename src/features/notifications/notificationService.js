import { httpsCallable } from "firebase/functions";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { firebaseApp, functions } from "../../services/firebase/client.js";
import {
  associateOneSignalUser,
  oneSignalDiagnosticFailure,
  oneSignalSubscriptionState,
  oneSignalWorkerState,
  requestOneSignalSubscription,
} from "./oneSignalService.js";
import { withProviderTimeout } from "./providerTimeout.js";

const pushDeviceStorageKey = "cleanflow-push-device-id";
const messagingWorkerPath = "/firebase-messaging-sw.js";
const messagingWorkerScope = "/firebase-messaging-push/";
const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const registerPushDeviceCall = httpsCallable(functions, "registerManagerPushDevice");
let fcmRegistrationState = "unknown";

function managerNotificationLanguage() {
  const language = window.localStorage.getItem("cleanflow-language");
  return ["en", "pt", "es"].includes(language) ? language : "pt";
}

function pushDeviceId() {
  const storedId = window.localStorage.getItem(pushDeviceStorageKey);

  if (storedId) {
    return storedId;
  }

  const deviceId = crypto.randomUUID();
  window.localStorage.setItem(pushDeviceStorageKey, deviceId);
  return deviceId;
}

export async function pushNotificationsAvailable() {
  if (
    !vapidKey ||
    !window.isSecureContext ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  ) {
    return false;
  }

  try {
    return await withProviderTimeout(isSupported(), "Firebase Messaging support check");
  } catch {
    return false;
  }
}

function browserPermission() {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

async function registerCurrentPushDevice() {
  const serviceWorkerRegistration = await navigator.serviceWorker.register(
    messagingWorkerPath,
    { scope: messagingWorkerScope },
  );
  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration,
  });

  if (!token) {
    throw new Error("Unable to get a push token.");
  }

  await registerPushDeviceCall({
    deviceId: pushDeviceId(),
    token,
    language: managerNotificationLanguage(),
  });
  fcmRegistrationState = "registered";
}

async function enableFcmPushNotifications() {
  if (!(await pushNotificationsAvailable())) return { state: "unavailable" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { state: permission === "denied" ? "denied" : "default" };

  try {
    await withProviderTimeout(registerCurrentPushDevice(), "Firebase Messaging registration");
    return { state: "registered" };
  } catch {
    fcmRegistrationState = "error";
    return { state: "error" };
  }
}

export async function refreshPushNotifications() {
  if (!(await pushNotificationsAvailable()) || browserPermission() !== "granted") {
    return { state: "unavailable" };
  }

  try {
    await withProviderTimeout(registerCurrentPushDevice(), "Firebase Messaging registration");
    return { state: "registered" };
  } catch {
    fcmRegistrationState = "error";
    return { state: "error" };
  }
}

async function fcmDiagnosticState() {
  if (!(await pushNotificationsAvailable())) return { state: "unavailable" };
  return browserPermission() === "granted" ? refreshPushNotifications() : { state: fcmRegistrationState };
}

function notificationState({ fcm, oneSignal }) {
  if (oneSignal.initialized && !oneSignal.optedIn) return "incomplete";
  if (fcm.state === "registered" || oneSignal.optedIn) return "enabled";
  if (browserPermission() === "denied") return "denied";
  if (oneSignal.state === "error" && fcm.state !== "registered") return "error";
  if (fcm.state === "unavailable" && !oneSignal.configured) return "unavailable";
  if (browserPermission() === "granted") return "incomplete";
  return "ready";
}

export async function getPushChannelDiagnostics(userId) {
  const [fcmResult, oneSignalResult, oneSignalWorkerResult] = await Promise.allSettled([
    fcmDiagnosticState(),
    associateOneSignalUser(userId),
    oneSignalWorkerState(),
  ]);
  const fcm = fcmResult.status === "fulfilled" ? fcmResult.value : { state: "error" };
  // OneSignal is additive in this proof; an SDK failure must not hide a working FCM channel.
  const oneSignal = oneSignalResult.status === "fulfilled"
    ? oneSignalResult.value
    : oneSignalDiagnosticFailure(oneSignalResult.reason);
  const oneSignalWorker = oneSignalWorkerResult.status === "fulfilled"
    ? oneSignalWorkerResult.value
    : { state: "check-error" };
  return {
    browserPermission: browserPermission(),
    fcm,
    oneSignal,
    oneSignalWorker,
    state: notificationState({ fcm, oneSignal }),
  };
}

export async function enablePushNotifications({ userId } = {}) {
  let oneSignal;

  try {
    // Keep the standards-based request first: iOS Safari requires it to originate from the tap.
    oneSignal = await requestOneSignalSubscription(userId);
  } catch (error) {
    oneSignal = await oneSignalSubscriptionState().catch(() => oneSignalDiagnosticFailure(error));
  }

  const fcm = await enableFcmPushNotifications();
  return { state: notificationState({ fcm, oneSignal }), fcm, oneSignal };
}

import { httpsCallable } from "firebase/functions";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { firebaseApp, functions } from "../../services/firebase/client.js";

const pushDeviceStorageKey = "cleanflow-push-device-id";
const messagingWorkerPath = "/firebase-messaging-sw.js";
const messagingWorkerScope = "/firebase-messaging-push/";
const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const registerPushDeviceCall = httpsCallable(functions, "registerManagerPushDevice");

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

  return isSupported();
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
}

export async function enablePushNotifications() {
  if (!(await pushNotificationsAvailable())) {
    return { state: "unavailable" };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return { state: permission === "denied" ? "denied" : "default" };
  }

  await registerCurrentPushDevice();
  return { state: "enabled" };
}

export async function refreshPushNotifications() {
  if (!(await pushNotificationsAvailable()) || Notification.permission !== "granted") {
    return { state: "unavailable" };
  }

  await registerCurrentPushDevice();
  return { state: "enabled" };
}

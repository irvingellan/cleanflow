import { httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
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
const currentDeviceTestCall = httpsCallable(functions, "sendCurrentManagerTestNotification", { timeout: 30_000 });
let fcmRegistrationState = "unknown";
let fcmRegistrationGeneration = 0;
let currentDeviceTestInFlight = false;
const pendingDeviceRegistrationWrites = new Set();
let managerForegroundRegistration;
let managerForegroundUnsubscribe;
const operationalForegroundEvents = new Set([
  "CLEANER_INTERESTED", "CHECKLIST_READY_FOR_REVIEW", "ASSIGNMENT_CONFIRMED", "MANAGER_REMINDER",
]);
export const currentDeviceRegistrationTimeoutMs = 15_000;
export const currentDeviceTestTimeoutMs = 30_000;

// A passive local observation. It must not fetch a token or register a worker.
export function getCachedFcmRegistrationState() {
  return fcmRegistrationState;
}

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

export function getLocalPushDeviceId() {
  return pushDeviceId();
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

async function registerCurrentPushDevice({ deadlineAt, assertCurrentUser = () => {} } = {}) {
  const generation = fcmRegistrationGeneration;
  const userId = getAuth(firebaseApp).currentUser?.uid;
  const assertRegistrationCurrent = () => {
    assertCurrentUser();
    if (!userId || getAuth(firebaseApp).currentUser?.uid !== userId) {
      throw Object.assign(new Error("Manager session changed."), { code: "unauthenticated" });
    }
    if (generation !== fcmRegistrationGeneration) {
      throw Object.assign(new Error("Device registration superseded."), { code: "registration-superseded" });
    }
    if (deadlineAt != null && Date.now() >= deadlineAt) throw new Error("Device registration timed out.");
  };
  const wait = (promise, label) => deadlineAt == null ? promise : withProviderTimeout(
    promise, label, Math.max(0, deadlineAt - Date.now()),
  );
  assertRegistrationCurrent();
  const serviceWorkerRegistration = await wait(navigator.serviceWorker.register(
    messagingWorkerPath,
    { scope: messagingWorkerScope },
  ), "Firebase Messaging worker registration");
  assertRegistrationCurrent();
  const messaging = getMessaging(firebaseApp);
  const token = await wait(getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration,
  }), "Firebase Messaging token registration");

  if (!token) {
    throw new Error("Unable to get a push token.");
  }

  assertRegistrationCurrent();
  const registrationWrite = registerPushDeviceCall({
    deviceId: pushDeviceId(),
    token,
    language: managerNotificationLanguage(),
  });
  pendingDeviceRegistrationWrites.add(registrationWrite);
  void registrationWrite.then(
    () => pendingDeviceRegistrationWrites.delete(registrationWrite),
    () => pendingDeviceRegistrationWrites.delete(registrationWrite),
  );
  await wait(registrationWrite, "Manager device registration");
  assertRegistrationCurrent();
  fcmRegistrationState = "registered";
  receiveManagerNotifications({ messaging, serviceWorkerRegistration });
  return { messaging, serviceWorkerRegistration };
}

function receiveManagerNotifications({ messaging, serviceWorkerRegistration }) {
  const userId = getAuth(firebaseApp).currentUser?.uid;
  managerForegroundRegistration = { worker: serviceWorkerRegistration, userId };
  if (managerForegroundUnsubscribe) return;
  // Foreground FCM does not automatically display. Receipt, never provider
  // acceptance or page entry, authorizes this existing worker display call.
  managerForegroundUnsubscribe = onMessage(messaging, (payload) => {
    const registration = managerForegroundRegistration;
    const data = payload?.data;
    if (!registration?.userId || getAuth(firebaseApp).currentUser?.uid !== registration.userId
      || browserPermission() !== "granted") return;
    const isTest = data?.eventType === "CURRENT_DEVICE_TEST";
    if (!isTest && (!operationalForegroundEvents.has(data?.eventType)
      || typeof data.title !== "string" || !data.title || data.title.length > 160
      || typeof data.body !== "string" || !data.body || data.body.length > 500
      || typeof data.eventId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(data.eventId))) return;
    void Promise.resolve().then(() => {
      if (getAuth(firebaseApp).currentUser?.uid !== registration.userId
        || managerForegroundRegistration !== registration || browserPermission() !== "granted") return;
      return registration.worker.showNotification(isTest ? "CleanFlow Test" : data.title, {
        body: isTest ? "Notifications are working on this device." : data.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: isTest ? "cleanflow-current-device-test" : data.eventId,
        data: { link: "/" },
      });
    }).catch(() => {});
  });
}

function testFailureState(error) {
  if (["functions/resource-exhausted", "resource-exhausted"].includes(error?.code)) return "cooldown";
  if (["functions/unauthenticated", "functions/permission-denied", "unauthenticated", "permission-denied"].includes(error?.code)) return "unauthorized";
  if (["functions/failed-precondition", "failed-precondition"].includes(error?.code)) return "registration-failed";
  return "unknown";
}

/** Only an explicit manager click calls this; no diagnostics or mount sends a test. */
export function testCurrentDeviceNotifications() {
  if (currentDeviceTestInFlight) return Promise.resolve({ state: "cooldown" });
  currentDeviceTestInFlight = true;
  // A passive token read must not overwrite a freshly self-healed registration.
  fcmRegistrationGeneration += 1;
  return runCurrentDeviceNotificationTest().finally(() => { currentDeviceTestInFlight = false; });
}

async function runCurrentDeviceNotificationTest() {
  if (browserPermission() === "denied") return { state: "permission-blocked" };
  if (!vapidKey || !window.isSecureContext || !("Notification" in window)
    || !("serviceWorker" in navigator) || !("PushManager" in window)) return { state: "unsupported" };

  const userId = getAuth(firebaseApp).currentUser?.uid;
  if (!userId) return { state: "unauthorized" };
  const assertCurrentUser = () => {
    if (getAuth(firebaseApp).currentUser?.uid !== userId) {
      throw Object.assign(new Error("Manager session changed."), { code: "unauthenticated" });
    }
  };
  let permission;
  try {
    // Start the native prompt before the first await to retain the iOS tap
    // gesture. Async SDK support still must pass before registration or send.
    const permissionRequest = browserPermission() === "default"
      ? Notification.requestPermission() : Promise.resolve(browserPermission());
    const [supported, requestedPermission] = await Promise.all([
      pushNotificationsAvailable(),
      withProviderTimeout(permissionRequest, "Notification permission", currentDeviceTestTimeoutMs),
    ]);
    if (!supported) return { state: "unsupported" };
    permission = requestedPermission;
  } catch {
    return { state: "registration-failed" };
  }
  if (permission !== "granted") return { state: permission === "denied" ? "permission-blocked" : "permission-default" };

  let registration;
  try {
    const deadlineAt = Date.now() + currentDeviceRegistrationTimeoutMs;
    // Wait for already-dispatched registration writes before replacing the token.
    // On uncertainty, stop; do not race a new registration against the old write.
    await withProviderTimeout(Promise.allSettled([...pendingDeviceRegistrationWrites]),
      "Previous manager device registration", currentDeviceRegistrationTimeoutMs);
    registration = await registerCurrentPushDevice({
      deadlineAt, assertCurrentUser,
    });
  } catch (error) {
    fcmRegistrationState = "error";
    return { state: testFailureState(error) === "unauthorized" ? "unauthorized" : "registration-failed" };
  }

  const sendTest = async () => {
    assertCurrentUser();
    const response = await withProviderTimeout(currentDeviceTestCall({
      deviceId: pushDeviceId(), confirm: true,
    }), "Current-device FCM test", currentDeviceTestTimeoutMs);
    return response?.data;
  };
  let result;
  let recovered = false;
  let refreshingStaleToken = false;
  try {
    result = await sendTest();
    if (result?.status === "FAILED" && result.recoveryAllowed === true && [
      "messaging/registration-token-not-registered", "messaging/invalid-registration-token",
    ].includes(result.failureCode)) {
      // Conclusive rejection only: a timeout/UNKNOWN may already have sent.
      assertCurrentUser();
      refreshingStaleToken = true;
      const removed = await withProviderTimeout(deleteToken(registration.messaging),
        "Stale FCM token removal", currentDeviceRegistrationTimeoutMs);
      if (removed !== true) return { state: "registration-failed" };
      registration = await registerCurrentPushDevice({
        deadlineAt: Date.now() + currentDeviceRegistrationTimeoutMs, assertCurrentUser,
      });
      recovered = true;
      refreshingStaleToken = false;
      result = await sendTest();
    }
  } catch (error) {
    const state = testFailureState(error);
    return { state: refreshingStaleToken && state !== "unauthorized" ? "registration-failed" : state, recovered };
  }
  if (result?.status === "FCM_ACCEPTED" && result.providerAccepted === true) {
    return { state: "fcm-accepted", recovered };
  }
  if (result?.status === "FAILED" && result.providerAccepted === false) {
    return { state: "fcm-rejected", recovered };
  }
  return { state: "unknown", recovered };
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
  const generation = fcmRegistrationGeneration;
  if (currentDeviceTestInFlight) return { state: fcmRegistrationState };
  if (!(await pushNotificationsAvailable()) || browserPermission() !== "granted") {
    return { state: "unavailable" };
  }
  if (currentDeviceTestInFlight || generation !== fcmRegistrationGeneration) return { state: fcmRegistrationState };

  try {
    await withProviderTimeout(registerCurrentPushDevice(), "Firebase Messaging registration");
    return { state: "registered" };
  } catch (error) {
    if (error?.code === "registration-superseded") return { state: fcmRegistrationState };
    fcmRegistrationState = "error";
    return { state: "error" };
  }
}

async function fcmDiagnosticState() {
  const generation = fcmRegistrationGeneration;
  if (!(await pushNotificationsAvailable())) return { state: "unavailable" };
  if (browserPermission() === "denied") return { state: "unavailable" };
  if (currentDeviceTestInFlight || generation !== fcmRegistrationGeneration) return { state: fcmRegistrationState };
  return browserPermission() === "granted" ? refreshPushNotifications() : { state: fcmRegistrationState };
}

function notificationState({ fcm, oneSignal }) {
  // Scheduled manager reminders currently use FCM; OneSignal opt-in alone does
  // not make this browser eligible for that delivery path.
  if (browserPermission() === "denied") return "denied";
  if (fcm.state === "registered") return "enabled";
  if (oneSignal.state === "error") return "error";
  if (fcm.state === "unavailable") return "unavailable";
  if (fcm.state === "error") return "error";
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
  // Browser denial must be changed in settings; another click cannot reprompt it.
  if (browserPermission() === "denied") return { state: "denied" };
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

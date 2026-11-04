import { webPushVapidKey } from "../../environment.js";
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
const vapidKey = webPushVapidKey(import.meta.env.MODE, import.meta.env);
const registerPushDeviceCall = httpsCallable(functions, "registerManagerPushDevice");
const deactivatePushDeviceCall = httpsCallable(functions, "deactivateManagerPushDevice");
const currentDeviceTestCall = httpsCallable(functions, "sendCurrentManagerTestNotification", { timeout: 30_000 });
let fcmRegistrationGeneration = 0;
let currentDeviceTestInFlight = false;
// Keep raw SDK operations/writes pending after the caller's deadline. A new
// attempt must not race late token deletion/acquisition or an uncertain write.
const pendingRegistrationWork = new Set();
let passiveRegistration;
let registrationDiagnostic = { state: "unknown", stage: null, code: null };
let diagnosticUser;
let successfulRegistration;
let signingOutUser;
let signingOutGeneration = 0;
const signOutCleanupTimeoutMs = 5_000;
let managerForegroundRegistration;
let managerForegroundUnsubscribe;
const operationalForegroundEvents = new Set([
  "CLEANER_INTERESTED", "CHECKLIST_READY_FOR_REVIEW", "ASSIGNMENT_CONFIRMED", "MANAGER_REMINDER",
]);
export const currentDeviceRegistrationTimeoutMs = 15_000;
export const currentDeviceTestTimeoutMs = 30_000;

// A passive local observation. It must not fetch a token or register a worker.
export function getCachedFcmRegistrationState() {
  return getCachedFcmRegistrationDiagnostic().state;
}

export function getCachedFcmRegistrationDiagnostic() {
  const user = getAuth(firebaseApp).currentUser;
  const userId = user?.uid;
  if (!userId || user !== diagnosticUser || user === signingOutUser) {
    return { state: "unknown", stage: null, code: null };
  }
  return { ...registrationDiagnostic };
}

function setRegistrationDiagnostic(attempt, state, error) {
  // A stale account/generation must never replace a newer session's observation.
  if (attempt.generation !== fcmRegistrationGeneration || attempt.user !== getAuth(firebaseApp).currentUser
    || attempt.user === signingOutUser) return;
  diagnosticUser = attempt.user;
  registrationDiagnostic = { state, stage: error ? attempt.stage : null, code: error ? safeRegistrationCode(error) : null };
}

function safeRegistrationCode(error) {
  if (error?.name === "ProviderTimeoutError") return "timeout";
  const code = typeof error?.code === "string" ? error.code.replace(/^functions\//, "") : null;
  if (["unauthenticated", "permission-denied"].includes(code)) return code;
  if (code === "registration-superseded") return "superseded";
  if (code === "invalid-token") return "invalid-token";
  return "failed";
}

function newRegistrationAttempt() {
  const user = getAuth(firebaseApp).currentUser;
  const userId = user?.uid;
  if (signingOutUser && user !== signingOutUser) signingOutUser = undefined;
  const attempt = { user, userId, generation: ++fcmRegistrationGeneration, stage: "support", deadlineAt: null, rotationUsed: false };
  attempt.assertCurrent = () => {
    if (!userId || getAuth(firebaseApp).currentUser !== user || signingOutUser === user) {
      throw Object.assign(new Error("Manager session changed."), { code: "unauthenticated" });
    }
    if (attempt.generation !== fcmRegistrationGeneration) {
      throw Object.assign(new Error("Registration superseded."), { code: "registration-superseded" });
    }
    if (attempt.deadlineAt != null && Date.now() >= attempt.deadlineAt) {
      throw Object.assign(new Error("Registration deadline reached."), { name: "ProviderTimeoutError" });
    }
  };
  return attempt;
}

function trackRegistrationWork(operation) {
  const pending = Promise.resolve(operation);
  pendingRegistrationWork.add(pending);
  void pending.then(() => pendingRegistrationWork.delete(pending), () => pendingRegistrationWork.delete(pending));
  return pending;
}

async function registrationStep(attempt, stage, operation, { tracked = true } = {}) {
  attempt.stage = stage;
  attempt.assertCurrent();
  const pending = operation();
  const result = await withProviderTimeout(tracked ? trackRegistrationWork(pending) : pending,
    "Manager push registration", Math.max(0, attempt.deadlineAt - Date.now()));
  attempt.assertCurrent();
  return result;
}

/** Explicit sign-out only. Never delete a shared SDK token during logout. */
export async function prepareManagerPushSignOut() {
  const user = getAuth(firebaseApp).currentUser;
  const userId = user?.uid;
  signingOutUser = user;
  const signOutGeneration = ++signingOutGeneration;
  ++fcmRegistrationGeneration;
  passiveRegistration = undefined;
  managerForegroundRegistration = undefined;
  managerForegroundUnsubscribe?.();
  managerForegroundUnsubscribe = undefined;
  registrationDiagnostic = { state: "unknown", stage: null, code: null };
  const deadlineAt = Date.now() + signOutCleanupTimeoutMs;
  try {
    await withProviderTimeout(Promise.allSettled([...pendingRegistrationWork]), "Pending registration", signOutCleanupTimeoutMs);
    const context = successfulRegistration;
    if (!context || !userId || context.user !== user || getAuth(firebaseApp).currentUser !== user) {
      return { deactivated: false, signOutGeneration };
    }
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) return { deactivated: false, signOutGeneration };
    // The server derives UID/org and compares all three captured fields. A late
    // cleanup cannot deactivate a refreshed revision, even for the same token.
    const result = await withProviderTimeout(deactivatePushDeviceCall({
      deviceId: context.deviceId, token: context.token, registrationRevision: context.registrationRevision,
    }), "Manager push sign-out", remaining);
    return { deactivated: result?.data?.deactivated === true, signOutGeneration };
  } catch {
    return { deactivated: false, signOutGeneration };
  }
}

/** Release only the exact failed sign-out attempt while its Auth session still owns the guard. */
export function abortManagerPushSignOut(preparation) {
  if (!signingOutUser || preparation?.signOutGeneration !== signingOutGeneration
    || getAuth(firebaseApp).currentUser !== signingOutUser) return false;
  signingOutUser = undefined;
  ++fcmRegistrationGeneration;
  successfulRegistration = undefined;
  diagnosticUser = undefined;
  registrationDiagnostic = { state: "unknown", stage: null, code: null };
  return true;
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

async function registerCurrentPushDevice({ attempt = newRegistrationAttempt(), rotateToken = false } = {}) {
  attempt.deadlineAt = Date.now() + currentDeviceRegistrationTimeoutMs;
  await registrationStep(attempt, "serialization", () => Promise.allSettled([...pendingRegistrationWork]), { tracked: false });
  const serviceWorkerRegistration = await registrationStep(attempt, "worker", () => navigator.serviceWorker.register(
    messagingWorkerPath, { scope: messagingWorkerScope },
  ));
  const messaging = getMessaging(firebaseApp);
  async function removeConclusiveStaleToken() {
    if (attempt.rotationUsed) throw Object.assign(new Error("Token rotation already used."), { code: "invalid-token" });
    // Consume before dispatch: even a timed-out/failed deletion cannot be repeated.
    attempt.rotationUsed = true;
    const removed = await registrationStep(attempt, "token", () => deleteToken(messaging));
    if (removed !== true) throw Object.assign(new Error("Unable to rotate token."), { code: "invalid-token" });
  }
  if (rotateToken) await removeConclusiveStaleToken();
  while (true) {
    const token = await registrationStep(attempt, "token", () => getToken(messaging, { vapidKey, serviceWorkerRegistration }));
    if (!token) throw Object.assign(new Error("Unable to get push token."), { code: "invalid-token" });
    const deviceId = pushDeviceId();
    try {
      const response = await registrationStep(attempt, "enrollment", () => Promise.resolve(registerPushDeviceCall({
        deviceId, token, language: managerNotificationLanguage(),
      })).then(response => {
        // Retain the exact server response privately even if sign-out superseded
        // the waiting caller. Cleanup can then compare the dispatched revision.
        if (getAuth(firebaseApp).currentUser === attempt.user) {
          const revision = response?.data?.registrationRevision;
          successfulRegistration = response?.data?.registered === true && Number.isSafeInteger(revision) && revision > 0
            ? { user: attempt.user, userId: attempt.userId, deviceId, token, registrationRevision: revision } : undefined;
        }
        return response;
      }));
      if (response?.data?.registered !== true) throw new Error("Manager registration was not confirmed.");
      break;
    } catch (error) {
      attempt.assertCurrent();
      if (attempt.rotationUsed || !["functions/failed-precondition", "failed-precondition"].includes(error?.code)
        || error?.details?.reason !== "fcm-token-invalidated") throw error;
      // This marker means the server conclusively invalidated this exact cached
      // token. Generic preconditions, timeouts and UNKNOWN never authorize it.
      await removeConclusiveStaleToken();
    }
  }
  attempt.assertCurrent();
  setRegistrationDiagnostic(attempt, "registered");
  // The registration deadline does not shorten the independent test-send bound.
  attempt.deadlineAt = null;
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
  const attempt = newRegistrationAttempt();
  return runCurrentDeviceNotificationTest(attempt).finally(() => { currentDeviceTestInFlight = false; });
}

async function runCurrentDeviceNotificationTest(attempt) {
  if (browserPermission() === "denied") return { state: "permission-blocked" };
  if (!vapidKey || !window.isSecureContext || !("Notification" in window)
    || !("serviceWorker" in navigator) || !("PushManager" in window)) return { state: "unsupported" };

  const userId = attempt.userId;
  if (!userId) return { state: "unauthorized" };
  const assertCurrentUser = () => {
    attempt.assertCurrent();
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
    assertCurrentUser();
    if (!supported) return { state: "unsupported" };
    permission = requestedPermission;
  } catch {
    return { state: "registration-failed" };
  }
  if (permission !== "granted") return { state: permission === "denied" ? "permission-blocked" : "permission-default" };

  try {
    await registerCurrentPushDevice({ attempt });
  } catch (error) {
    setRegistrationDiagnostic(attempt, "error", error);
    return { state: testFailureState(error) === "unauthorized" ? "unauthorized" : "registration-failed" };
  }

  const sendTest = async () => {
    assertCurrentUser();
    const response = await withProviderTimeout(currentDeviceTestCall({
      deviceId: pushDeviceId(), confirm: true,
    }), "Current-device FCM test", currentDeviceTestTimeoutMs);
    assertCurrentUser();
    return response?.data;
  };
  let result;
  let recovered = attempt.rotationUsed;
  let refreshingStaleToken = false;
  try {
    result = await sendTest();
    if (!attempt.rotationUsed && result?.status === "FAILED" && result.recoveryAllowed === true && [
      "messaging/registration-token-not-registered", "messaging/invalid-registration-token",
    ].includes(result.failureCode)) {
      // Conclusive rejection only: a timeout/UNKNOWN may already have sent.
      assertCurrentUser();
      refreshingStaleToken = true;
      await registerCurrentPushDevice({ attempt, rotateToken: true });
      recovered = true;
      refreshingStaleToken = false;
      result = await sendTest();
    }
  } catch (error) {
    if (refreshingStaleToken) setRegistrationDiagnostic(attempt, "error", error);
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

async function enableFcmPushNotifications(attempt) {
  try {
    attempt.assertCurrent();
    const supported = await pushNotificationsAvailable();
    attempt.assertCurrent();
    if (!supported) return { state: "unavailable" };
    attempt.stage = "permission";
    const permission = await withProviderTimeout(Notification.requestPermission(), "Notification permission", currentDeviceRegistrationTimeoutMs);
    attempt.assertCurrent();
    if (permission !== "granted") return { state: permission === "denied" ? "denied" : "default" };
    await registerCurrentPushDevice({ attempt });
    return { state: "registered" };
  } catch (error) {
    setRegistrationDiagnostic(attempt, "error", error);
    return { state: "error" };
  }
}

export function refreshPushNotifications({ userId: expectedUserId } = {}) {
  const user = getAuth(firebaseApp).currentUser;
  const userId = user?.uid;
  if (expectedUserId && expectedUserId !== userId) return Promise.resolve({ state: "error" });
  if (currentDeviceTestInFlight) return Promise.resolve({ state: getCachedFcmRegistrationState() });
  if (passiveRegistration?.user === user) return passiveRegistration.promise;
  const attempt = newRegistrationAttempt();
  const promise = (async () => {
    try {
      attempt.assertCurrent();
      const supported = await pushNotificationsAvailable();
      attempt.assertCurrent();
      if (!supported || browserPermission() !== "granted") return { state: "unavailable" };
      await registerCurrentPushDevice({ attempt });
      return { state: "registered" };
    } catch (error) {
      if (error?.code === "registration-superseded") return { state: getCachedFcmRegistrationState() };
      setRegistrationDiagnostic(attempt, "error", error);
      return { state: "error" };
    }
  })();
  passiveRegistration = { user, promise };
  void promise.finally(() => { if (passiveRegistration?.promise === promise) passiveRegistration = undefined; });
  return promise;
}

async function fcmDiagnosticState() {
  // Start the guarded attempt before support awaits; do not adopt a later Auth
  // account when diagnostics started for the previous manager.
  if (browserPermission() === "denied") return { state: "unavailable" };
  if (currentDeviceTestInFlight) return { state: getCachedFcmRegistrationState() };
  if (browserPermission() === "granted") return refreshPushNotifications();
  if (!(await pushNotificationsAvailable())) return { state: "unavailable" };
  return { state: getCachedFcmRegistrationState() };
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
  const attempt = newRegistrationAttempt();
  let oneSignal;

  try {
    // Keep the standards-based request first: iOS Safari requires it to originate from the tap.
    oneSignal = await requestOneSignalSubscription(userId);
  } catch (error) {
    oneSignal = await oneSignalSubscriptionState().catch(() => oneSignalDiagnosticFailure(error));
  }

  const fcm = await enableFcmPushNotifications(attempt);
  return { state: notificationState({ fcm, oneSignal }), fcm, oneSignal };
}

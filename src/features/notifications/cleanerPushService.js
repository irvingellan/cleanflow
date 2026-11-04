import { webPushVapidKey } from "../../environment.js";
import { getApps, initializeApp } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { firebaseConfig, useFirebaseEmulators } from "../../services/firebase/client.js";
import { cleanerHubFirebase } from "../cleaner-hub/cleanerHubFirebase.js";
import {
  cleanerMessagingConfig, cleanerMessagingWorkerPath, cleanerMessagingWorkerScope, cleanerPushBinding, isCleanerVapidKey,
} from "./cleanerPushBinding.js";
import { messagingWorkerReadiness } from "./notificationReadiness.js";
import { withProviderTimeout } from "./providerTimeout.js";

const cleanerMessagingAppName = "cleanflow-cleaner-messaging";
const storageKey = "cleanflow-cleaner-push-device-id";
const vapidKey = webPushVapidKey(import.meta.env.MODE, import.meta.env);
const messagingConfig = useFirebaseEmulators || ["test", "emulator", "e2e"].includes(import.meta.env.MODE)
  ? null : cleanerMessagingConfig(firebaseConfig, import.meta.env.VITE_FIREBASE_CLEANER_MESSAGING_APP_ID);
const workerIdentity = { scope: cleanerMessagingWorkerScope, script: cleanerMessagingWorkerPath };
let pendingEnrollment;
let registeredContext;
let endingSessionId;

function registrationReason(options) {
  if (options.platform === "ios" && !options.standalone) return "ios-standalone-required";
  if (!messagingConfig || !isCleanerVapidKey(vapidKey)) return "unconfigured";
  if (!window.isSecureContext || !window.Notification || !window.PushManager
    || !navigator.serviceWorker || !window.indexedDB) return "unsupported";
  if (navigator.onLine === false) return "offline";
  return null;
}

function deviceId(create = false) {
  const saved = window.localStorage.getItem(storageKey);
  if (saved || !create) return saved;
  const id = crypto.randomUUID();
  window.localStorage.setItem(storageKey, id);
  return id;
}

function authorizedSession(session) {
  const user = cleanerHubFirebase().auth.currentUser;
  return user?.uid === session.uid && endingSessionId !== session.sessionId ? user : null;
}

async function confirmLocalOwner(session) {
  const user = authorizedSession(session);
  if (!user) return null;
  const hub = (await user.getIdTokenResult()).claims.cleanerHub;
  if (hub?.organizationId !== session.organizationId || hub?.sessionId !== session.sessionId
    || authorizedSession(session) !== user) return null;
  return user;
}

function workerReadiness(registration) {
  return messagingWorkerReadiness(registration, window.location.origin, workerIdentity);
}

function cleanerMessaging() {
  const app = getApps().find(({ name }) => name === cleanerMessagingAppName)
    || initializeApp(messagingConfig, cleanerMessagingAppName);
  return getMessaging(app);
}

async function invoke(name, data) {
  const response = await httpsCallable(cleanerHubFirebase().functions, name, { timeout: 8000 })(data);
  return response.data;
}

async function checkCleanerPush(session, options) {
  const reason = registrationReason(options);
  if (reason && reason !== "offline") return reason;
  if (!authorizedSession(session)) return "superseded";
  if (Notification.permission !== "granted") {
    const current = await cleanerPushBinding("read");
    if (current?.sessionId === session.sessionId && (current.bindingId || current.permissionRevocationPending)) {
      // Clear locally even offline. The browser already knows consent is gone.
      await forgetCleanerPush(session, "PERMISSION_REVOKED", { localOnly: reason === "offline" }).catch(() => {});
    }
    if (Notification.permission === "denied") return "permission-denied";
  }
  if (reason) return reason;
  const user = await confirmLocalOwner(session);
  if (!user) return "superseded";
  const binding = await cleanerPushBinding("claim", session.sessionId);
  if (!binding || authorizedSession(session) !== user) return "superseded";
  if (binding.permissionRevocationPending && Notification.permission === "granted") {
    await forgetCleanerPush(session, "PERMISSION_REVOKED").catch(() => {});
  }
  if (!await withProviderTimeout(isSupported(), "Cleaner notification support")) return "unsupported";
  if (Notification.permission !== "granted") return Notification.permission === "denied" ? "permission-denied" : "permission-default";
  const installation = deviceId();
  if (!installation) return "missing";
  const status = await invoke("getCleanerPushDeviceStatus", { deviceId: installation });
  if (authorizedSession(session) !== user) return "superseded";
  if (status?.state !== "active" || status.registrationRevision !== binding.registrationRevision) {
    if (binding.bindingId && await cleanerPushBinding("invalidate", session.sessionId, null, null, binding.registrationRevision)) {
      await closeLocalCleanerNotifications(binding.bindingId);
    }
    return status?.state === "invalidated" ? "invalidated" : "missing";
  }
  if (!binding.bindingId) return "missing";
  const registration = await navigator.serviceWorker.getRegistration(cleanerMessagingWorkerScope);
  const worker = workerReadiness(registration);
  if (worker !== "ready") return `worker-${worker}`;
  if (!await registration.pushManager.getSubscription()) return "missing";
  return "registered";
}

export function inspectCleanerPush(session, options) {
  return withProviderTimeout(checkCleanerPush(session, options), "Cleaner notification readiness", 10_000)
    .catch(() => navigator.onLine === false ? "offline" : "error");
}

async function waitForActiveWorker(registration) {
  if (workerReadiness(registration) === "ready") return;
  const worker = registration.installing || registration.waiting;
  if (!worker) throw new Error("Cleaner notification worker mismatch.");
  let listener;
  try {
    await withProviderTimeout(new Promise((resolve, reject) => {
      listener = () => {
        if (workerReadiness(registration) === "ready") resolve();
        else if (worker.state === "redundant") reject(new Error("Cleaner notification worker was replaced."));
      };
      worker.addEventListener("statechange", listener);
      listener();
    }), "Cleaner notification worker activation");
  } finally {
    worker.removeEventListener("statechange", listener);
  }
}

async function enrollCleanerPush(session, options, permissionRequest) {
  if (await withProviderTimeout(permissionRequest, "Cleaner notification permission", 20_000) !== "granted") {
    return Notification.permission === "denied" ? "permission-denied" : "permission-default";
  }
  const user = await confirmLocalOwner(session);
  if (!user) return "superseded";
  if (!await withProviderTimeout(isSupported(), "Cleaner notification support")) return "unsupported";

  const before = await cleanerPushBinding("read");
  if (before?.sessionId !== session.sessionId || authorizedSession(session) !== user) return "superseded";
  const registration = await navigator.serviceWorker.register(cleanerMessagingWorkerPath, { scope: cleanerMessagingWorkerScope });
  await waitForActiveWorker(registration);
  const messaging = cleanerMessaging();
  const installation = deviceId(true);
  let registrationResult;
  let token;
  const register = async () => {
    if (Notification.permission !== "granted" || authorizedSession(session) !== user
      || (await cleanerPushBinding("read"))?.sessionId !== session.sessionId) return null;
    // getToken can request permission on its own. Check immediately before calling it.
    if (Notification.permission !== "granted" || authorizedSession(session) !== user) return null;
    token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token || (await cleanerPushBinding("read"))?.sessionId !== session.sessionId
      || authorizedSession(session) !== user || Notification.permission !== "granted") return null;
    return invoke("registerCleanerPushDevice", {
      deviceId: installation, token,
      platform: options.platform === "ios" ? "ios-pwa" : options.platform === "android" ? "android" : "desktop",
      permission: "granted", language: options.language,
    });
  };
  try {
    registrationResult = await register();
  } catch (error) {
    if (error?.details?.reason !== "fcm-token-invalidated"
      || (await cleanerPushBinding("read"))?.sessionId !== session.sessionId
      || authorizedSession(session) !== user) throw error;
    if (!await deleteToken(messaging)) return "invalidated";
    registrationResult = await register();
  }
  if (!registrationResult) return "superseded";
  const { registered, registrationRevision, bindingId } = registrationResult;
  if (registered !== true || !Number.isSafeInteger(registrationRevision) || registrationRevision <= 0
    || typeof bindingId !== "string" || !/^[a-f0-9]{32}$/.test(bindingId)) return "error";
  const context = { sessionId: session.sessionId, deviceId: installation, registrationRevision };
  if (authorizedSession(session) !== user || Notification.permission !== "granted") {
    if (cleanerHubFirebase().auth.currentUser === user) {
      const reason = Notification.permission === "granted" ? "SIGNED_OUT" : "PERMISSION_REVOKED";
      await invoke("deactivateCleanerPushDevice", { deviceId: installation, registrationRevision, reason }).catch(() => {});
    }
    return "superseded";
  }
  registeredContext = context;
  const stored = await cleanerPushBinding("set", session.sessionId, bindingId, options.language, registrationRevision);
  if (!stored || authorizedSession(session) !== user) return "superseded";
  if (before.bindingId && before.bindingId !== bindingId) await closeLocalCleanerNotifications(before.bindingId).catch(() => {});
  return "registered";
}

function beginEnrollment(session, options, permissionRequest) {
  if (pendingEnrollment) return pendingEnrollment.sessionId === session.sessionId ? pendingEnrollment.waiting : Promise.resolve("superseded");
  const operation = enrollCleanerPush(session, options, permissionRequest);
  // Keep the SDK work serialized even if the UI's bounded wait has expired.
  const waiting = withProviderTimeout(operation, "Cleaner notification enrollment", 35_000)
    .catch(() => navigator.onLine === false ? "offline" : "error");
  pendingEnrollment = { sessionId: session.sessionId, waiting };
  void operation.catch(() => {}).finally(() => { if (pendingEnrollment?.waiting === waiting) pendingEnrollment = undefined; });
  return waiting;
}

/** Call synchronously from the user's explicit gesture. Lifecycle checks never prompt. */
export function enableCleanerPush(session, options) {
  const reason = registrationReason(options);
  if (reason) return Promise.resolve(reason);
  if (pendingEnrollment) return pendingEnrollment.sessionId === session.sessionId ? pendingEnrollment.waiting : Promise.resolve("superseded");
  if (!authorizedSession(session)) return Promise.resolve("superseded");
  try {
    const permissionRequest = Notification.permission === "default"
      ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    return beginEnrollment(session, options, permissionRequest);
  } catch {
    return Promise.resolve("error");
  }
}

export async function refreshCleanerPush(session, options) {
  const state = await inspectCleanerPush(session, options);
  if (state !== "registered" || Notification.permission !== "granted") return state;
  // Only refresh a previously consented, currently active installation. A
  // conclusive invalidation uses one recovery on the explicit enable path.
  return beginEnrollment(session, options, Promise.resolve("granted"));
}

async function closeLocalCleanerNotifications(bindingId) {
  const worker = await navigator.serviceWorker?.getRegistration(cleanerMessagingWorkerScope);
  if (workerReadiness(worker) !== "ready") return;
  const notifications = await worker.getNotifications();
  for (const notification of notifications) {
    if (notification.data?.cleanerBindingId === bindingId) notification.close();
  }
}

async function forgetCleanerPush(session, reason, { localOnly = false } = {}) {
  const cleared = await cleanerPushBinding(reason === "SIGNED_OUT" ? "clear" : "revokePermission", session.sessionId);
  if (cleared?.bindingId) await closeLocalCleanerNotifications(cleared.bindingId).catch(() => {});
  if (localOnly) return;
  const context = registeredContext?.sessionId === session.sessionId ? registeredContext : null;
  if (context) registeredContext = undefined;
  const installation = context?.deviceId || (cleared?.registrationRevision ? deviceId() : null);
  if (!installation) return;
  const { auth } = cleanerHubFirebase();
  const user = auth.currentUser;
  if (!user) return;
  const hub = (await user.getIdTokenResult()).claims.cleanerHub;
  if (hub?.sessionId !== session.sessionId || auth.currentUser !== user) return;
  const registrationRevision = Math.max(context?.registrationRevision || 0, cleared?.registrationRevision || 0);
  if (registrationRevision && auth.currentUser === user) {
    await invoke("deactivateCleanerPushDevice", { deviceId: installation, registrationRevision, reason });
    if (reason === "PERMISSION_REVOKED") {
      await cleanerPushBinding("finishRevocation", session.sessionId, null, null, registrationRevision);
    }
  }
}

/** Clear the worker's gate before Auth exits. Do not delete the Firebase token on sign-out. */
export async function prepareCleanerPushSignOut(session) {
  if (!session?.sessionId || !window.indexedDB) return;
  endingSessionId = session.sessionId;
  await withProviderTimeout(forgetCleanerPush(session, "SIGNED_OUT"), "Cleaner push sign-out")
    .catch(() => undefined);
}

/** Account replacement also clears a stale binding from an earlier browser session. */
export async function prepareCleanerPushAccountSwitch() {
  if (!window.indexedDB) return;
  await withProviderTimeout((async () => {
    const previous = await cleanerPushBinding("read");
    if (!previous?.sessionId) return;
    await prepareCleanerPushSignOut(previous);
  })(), "Cleaner push account switch").catch(() => {});
}

import { appVersion } from "../../appVersion.js";
import { getCachedFcmRegistrationState } from "./notificationService.js";

const pushDeviceStorageKey = "cleanflow-push-device-id";
const messagingWorkerScope = "/firebase-messaging-push/";
const serviceWorkerCheckMs = 2_000;

function coarsePlatform(userAgent = "", platform = "") {
  const source = `${userAgent} ${platform}`;
  if (/iphone|ipad|ipod/i.test(source)) return "ios";
  if (/android/i.test(source)) return "android";
  if (/mac/i.test(source)) return "macos";
  if (/win/i.test(source)) return "windows";
  if (/linux/i.test(source)) return "linux";
  return "other";
}

function coarseBrowser(userAgent = "") {
  if (/edg\//i.test(userAgent)) return "edge";
  if (/firefox\//i.test(userAgent)) return "firefox";
  if (/chrome|chromium|crios/i.test(userAgent)) return "chrome";
  if (/safari/i.test(userAgent)) return "safari";
  return "other";
}

function permissionState(environment) {
  const permission = environment.Notification?.permission;
  return ["granted", "denied", "default"].includes(permission) ? permission : "unsupported";
}

async function serviceWorkerState(environment) {
  const serviceWorker = environment.navigator?.serviceWorker;
  if (typeof serviceWorker?.getRegistration !== "function") return "unavailable";

  let timeoutId;
  try {
    const registration = await Promise.race([
      serviceWorker.getRegistration(messagingWorkerScope),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Service worker check timed out")), serviceWorkerCheckMs);
      }),
    ]);
    return registration?.active ? "ready" : "unavailable";
  } catch {
    return "error";
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Read-only, coarse snapshot. Never registers a worker or asks for permission. */
export async function readLocalNotificationHealth(environment = globalThis) {
  const userAgent = environment.navigator?.userAgent || "";
  let displayModeStandalone = false;
  try {
    displayModeStandalone = environment.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    // Some restricted browsing contexts do not expose media-query state.
  }
  let deviceId = null;
  try {
    deviceId = environment.localStorage?.getItem(pushDeviceStorageKey) || null;
  } catch {
    // A browser may block local storage. The snapshot remains useful locally.
  }

  const cachedFcmState = getCachedFcmRegistrationState();
  const notificationPermission = permissionState(environment);
  return {
    deviceId,
    notificationPermission,
    serviceWorker: await serviceWorkerState(environment),
    // Cached registration is not current readiness when permission was revoked.
    // Unknown also avoids treating a fresh page's empty cache as missing server state.
    fcmRegistration: notificationPermission === "granted" && ["registered", "error"].includes(cachedFcmState)
      ? cachedFcmState : "unknown",
    platform: coarsePlatform(userAgent, environment.navigator?.platform),
    browserClass: coarseBrowser(userAgent),
    standalone: environment.navigator?.standalone === true || displayModeStandalone,
    appVersion,
    checkedAt: new Date().toISOString(),
  };
}

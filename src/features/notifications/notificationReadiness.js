/** Pure worker identity check; a root app-shell worker is not the FCM worker. */
export function messagingWorkerReadiness(registration, origin) {
  if (!registration?.active) return "missing";
  try {
    const scope = new URL("/firebase-messaging-push/", origin);
    const script = new URL("/firebase-messaging-sw.js", origin);
    return registration.scope === scope.href && registration.active.scriptURL === script.href ? "ready" : "mismatch";
  } catch {
    return "mismatch";
  }
}

/** Headless contract. Contains no copy, permissions, provider work or delivery inference. */
export function deriveNotificationReadiness({ platform, standalone, notificationPermission, worker, fcmRegistration } = {}) {
  const permission = ["granted", "default", "denied"].includes(notificationPermission) ? notificationPermission : "unsupported";
  const workerState = ["ready", "missing", "mismatch", "error", "unsupported"].includes(worker) ? worker : "missing";
  const registration = ["registered", "missing", "error", "unsupported"].includes(fcmRegistration) ? fcmRegistration : "unknown";
  let reason = "registered";
  if (permission === "unsupported") reason = "unsupported";
  else if (permission !== "granted") reason = `permission-${permission}`;
  else if (platform === "ios" && standalone !== true) reason = "ios-standalone-required";
  else if (workerState !== "ready") reason = `worker-${workerState}`;
  else if (registration !== "registered") reason = `registration-${registration}`;
  return {
    context: standalone === true ? "standalone" : "browser-tab",
    // A tab cannot tell whether a separate installed PWA exists.
    installation: standalone === true ? "running-standalone" : "unknown",
    permission, worker: workerState, registration, ready: reason === "registered", reason, delivery: "UNKNOWN",
  };
}

export const fcmFailureStages = new Set(["support", "permission", "serialization", "worker", "token", "enrollment"]);
export const fcmFailureCodes = new Set(["timeout", "superseded", "unauthenticated", "permission-denied", "unavailable", "invalid-token", "failed"]);

export function safeFcmFailureFields({ fcmRegistration, fcmErrorStage, fcmErrorCode }) {
  return fcmRegistration === "error" && fcmFailureStages.has(fcmErrorStage) && fcmFailureCodes.has(fcmErrorCode)
    ? { fcmErrorStage, fcmErrorCode } : {};
}

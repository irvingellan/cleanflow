import OneSignal from "react-onesignal";
import { ProviderTimeoutError, withProviderTimeout } from "./providerTimeout.js";

const productionOrigin = "https://clean-flow-prototipo.web.app";
const workerPath = "onesignal/OneSignalSDKWorker.js";
const workerScope = "/onesignal/";
const sdkScriptId = "onesignal-sdk";

let sdkInitializationPromise = null;
let lastOneSignalFailure = null;
let sdkScriptState = "not-requested";

function browserRuntime() {
  return typeof window !== "undefined";
}

function configuredAppId() {
  return import.meta.env.VITE_ONESIGNAL_APP_ID?.trim() || "";
}

function supportedOrigin() {
  return import.meta.env.MODE === "test" || window.location.origin === productionOrigin;
}

function shortenedId(value) {
  return typeof value === "string" && value.length > 8 ? value.slice(-8) : value || null;
}

function trackSdkScript() {
  const script = document.getElementById(sdkScriptId);
  if (!script || sdkScriptState !== "not-requested") return;

  sdkScriptState = "loading";
  script.addEventListener("load", () => {
    sdkScriptState = "loaded";
  }, { once: true });
  script.addEventListener("error", () => {
    sdkScriptState = "failed";
  }, { once: true });
}

function currentSdkScriptState() {
  if (!browserRuntime()) return "unavailable";
  if (sdkScriptState === "not-requested" && window.OneSignal) return "loaded";
  return sdkScriptState;
}

function originState() {
  if (!browserRuntime()) return "unavailable";
  return supportedOrigin() ? "expected" : "unsupported";
}

function safeFailureCode(stage, error) {
  if (error instanceof ProviderTimeoutError) return "timeout";

  const message = String(error?.message || error || "").toLowerCase();
  if (stage === "initialization" && /(origin|site url|app id|app_id)/.test(message)) return "originConfig";
  if (/(service worker|worker registration)/.test(message)) return "workerRegistration";
  if (/(not support|unsupported)/.test(message)) return "unsupported";
  return "failed";
}

function providerFailure(stage, error) {
  const code = safeFailureCode(stage, error);
  const sdkLoadFailure = stage === "initialization"
    && code === "timeout"
    && currentSdkScriptState() === "loading";
  const failureStage = sdkLoadFailure ? "sdkLoad" : stage;
  lastOneSignalFailure = { stage: failureStage, code };
  const safeError = new Error(`OneSignal ${stage} ${code}.`);
  safeError.oneSignalStage = failureStage;
  safeError.oneSignalCode = code;
  return safeError;
}

async function runOneSignalOperation(stage, operation) {
  try {
    return await withProviderTimeout(operation, `OneSignal ${stage}`);
  } catch (error) {
    throw providerFailure(stage, error);
  }
}

function diagnosticFields() {
  return lastOneSignalFailure
    ? { errorStage: lastOneSignalFailure.stage, errorCode: lastOneSignalFailure.code }
    : {};
}

export function oneSignalDiagnosticFailure(error) {
  return {
    configured: Boolean(configuredAppId()),
    initialized: false,
    optedIn: false,
    subscriptionId: null,
    state: "error",
    errorStage: error?.oneSignalStage || "initialization",
    errorCode: error?.oneSignalCode || "failed",
    sdkState: currentSdkScriptState(),
    originState: originState(),
  };
}

/**
 * The production OneSignal app is intentionally never initialized from localhost:
 * browser subscriptions are origin-bound and must be created on the deployed app.
 */
export function oneSignalAvailable() {
  return browserRuntime() && Boolean(configuredAppId()) && supportedOrigin();
}

export async function initializeOneSignal() {
  if (!oneSignalAvailable()) return null;

  if (!sdkInitializationPromise) {
    try {
      sdkInitializationPromise = Promise.resolve(OneSignal.init({
        appId: configuredAppId(),
        serviceWorkerPath: workerPath,
        serviceWorkerParam: { scope: workerScope },
        welcomeNotification: { disable: true },
      }))
      .then(() => OneSignal)
      .catch((error) => {
        sdkInitializationPromise = null;
        throw error;
      });
      trackSdkScript();
    } catch (error) {
      sdkInitializationPromise = null;
      throw providerFailure("initialization", error);
    }
  }

  return runOneSignalOperation("initialization", sdkInitializationPromise);
}

export async function oneSignalSubscriptionState() {
  const instance = await initializeOneSignal();

  if (!instance) {
    return {
      configured: Boolean(configuredAppId()),
      initialized: false,
      optedIn: false,
      subscriptionId: null,
      state: "unavailable",
      sdkState: currentSdkScriptState(),
      originState: originState(),
    };
  }

  const subscription = instance.User.PushSubscription;
  return {
    configured: true,
    initialized: true,
    optedIn: subscription.optedIn === true,
    subscriptionId: shortenedId(subscription.id),
    state: subscription.optedIn === true ? "active" : "not-subscribed",
    sdkState: currentSdkScriptState(),
    originState: originState(),
    ...diagnosticFields(),
  };
}

export async function associateOneSignalUser(userId) {
  const instance = await initializeOneSignal();

  if (!instance || !userId) return oneSignalSubscriptionState();

  await runOneSignalOperation("identityAssociation", instance.login(userId));
  return oneSignalSubscriptionState();
}

export async function requestOneSignalSubscription(userId) {
  const instance = await initializeOneSignal();

  if (!instance) return oneSignalSubscriptionState();

  // This is called only from the manager's explicit notification button. optIn()
  // prompts when there is no token and also re-enables a previously opted-out token.
  await runOneSignalOperation("subscriptionOptIn", instance.User.PushSubscription.optIn());
  if (userId) await runOneSignalOperation("identityAssociation", instance.login(userId));

  lastOneSignalFailure = null;
  return oneSignalSubscriptionState();
}

export async function clearOneSignalUser() {
  if (!sdkInitializationPromise) return;

  const instance = await initializeOneSignal();
  await runOneSignalOperation("identityCleanup", instance.logout());
}

export async function oneSignalWorkerState() {
  if (!oneSignalAvailable() || !("serviceWorker" in navigator)) return { state: "unavailable" };

  try {
    const registration = await withProviderTimeout(
      navigator.serviceWorker.getRegistration(workerScope),
      "OneSignal service worker lookup",
    );
    if (!registration) return { state: "not-registered" };

    return {
      state: registration.scope.endsWith(workerScope) ? "registered" : "scope-mismatch",
    };
  } catch {
    return { state: "check-error" };
  }
}

export const oneSignalWorker = { path: workerPath, scope: workerScope };

export const productionFirebaseProjectId = "clean-flow-prototipo";
export const productionHostingOrigin = "https://clean-flow-prototipo.web.app";
const projectPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const firebaseKeys = ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"];

export function resolveCleanFlowEnvironment({ mode, firebaseProjectId } = {}) {
  if (["test", "emulator", "e2e"].includes(mode)) return "emulator";
  if (mode === "sandbox") return "sandbox";
  return firebaseProjectId === productionFirebaseProjectId ? "production" : "unknown";
}

export function resolveSandboxOrigin({ sandboxProjectId, sandboxOrigin } = {}) {
  if (!sandboxProjectId) return "";
  if (!projectPattern.test(sandboxProjectId) || sandboxProjectId === productionFirebaseProjectId || sandboxProjectId === "demo-cleanflow") throw new Error("Sandbox cannot target Production, Emulator or an invalid project.");
  const expected = `https://${sandboxProjectId}.web.app`;
  if (sandboxOrigin && sandboxOrigin !== expected) throw new Error("Sandbox origin must belong to its dedicated project.");
  return expected;
}

export function assertFirebaseEnvironmentBinding({ environment, firebaseProjectId, sandboxProjectId } = {}) {
  if (environment === "emulator" && firebaseProjectId === "demo-cleanflow") return;
  if (environment === "production" && firebaseProjectId === productionFirebaseProjectId) return;
  if (environment === "sandbox" && sandboxProjectId && sandboxProjectId !== productionFirebaseProjectId && sandboxProjectId !== "demo-cleanflow"
    && firebaseProjectId === sandboxProjectId) return;
  throw new Error("Invalid Firebase environment binding; refusing initialization.");
}

// Sandbox has a separate opt-in and key. Normal Sandbox and emulator builds
// retain their previous notification configuration.
export function webPushVapidKey(mode, values) {
  if (mode === "sandbox") {
    return values.VITE_CLEANFLOW_SANDBOX_PUSH_PILOT === "enabled" ? values.VITE_FIREBASE_SANDBOX_VAPID_KEY : "";
  }
  return values.VITE_FIREBASE_VAPID_KEY;
}

/** Shared by Vite, generated messaging worker and browser SDK initialization. */
export function assertBuildEnvironment(mode, values, { approvedPrivateEmulatorOrigin } = {}) {
  privateOriginForBuild(mode, values, approvedPrivateEmulatorOrigin);
  const projectId = values.VITE_FIREBASE_PROJECT_ID;
  const environment = resolveCleanFlowEnvironment({ mode, firebaseProjectId: projectId });
  if (mode === "test") return { environment: "emulator", projectId: "demo-cleanflow" };
  if (values.VITE_CLEANFLOW_ENV && values.VITE_CLEANFLOW_ENV !== environment) throw new Error("Build environment mismatch.");
  if (environment === "emulator" && values.VITE_USE_FIREBASE_EMULATORS !== "true") throw new Error("Emulator connection is required.");
  assertFirebaseEnvironmentBinding({ environment, firebaseProjectId: projectId, sandboxProjectId: values.VITE_CLEANFLOW_SANDBOX_PROJECT_ID });
  if (firebaseKeys.some(key => !values[`VITE_FIREBASE_${key}`])) throw new Error("Missing Firebase build configuration.");
  if (![projectId + ".firebaseapp.com", ...(environment === "emulator" ? [projectId + ".local"] : [])].includes(values.VITE_FIREBASE_AUTH_DOMAIN)
    || ![projectId + ".appspot.com", projectId + ".firebasestorage.app"].includes(values.VITE_FIREBASE_STORAGE_BUCKET)
    || !values.VITE_FIREBASE_APP_ID.startsWith(`1:${values.VITE_FIREBASE_MESSAGING_SENDER_ID}:web:`)) {
    throw new Error("Firebase Auth/Storage/app configuration crosses project boundaries.");
  }
  const sandboxPushPilot = values.VITE_CLEANFLOW_SANDBOX_PUSH_PILOT;
  const sandboxVapid = values.VITE_FIREBASE_SANDBOX_VAPID_KEY;
  if ((sandboxPushPilot || sandboxVapid) && (environment !== "sandbox" || sandboxPushPilot !== "enabled"
    || !sandboxVapid || values.VITE_NOTIFICATION_INBOX_MODE !== "enabled"
    || values.VITE_AUTOMATIC_OFFERS_MODE !== "disabled")) {
    throw new Error("Sandbox push pilot requires its separate key, Inbox enabled and automatic offers disabled.");
  }
  if (environment === "sandbox") {
    resolveSandboxOrigin({ sandboxProjectId: projectId, sandboxOrigin: values.VITE_CLEANFLOW_SANDBOX_ORIGIN });
    if (values.VITE_ONESIGNAL_APP_ID || values.VITE_FIREBASE_VAPID_KEY) throw new Error("Sandbox notification configuration must not inherit production values.");
  }
  return { environment, projectId };
}

function privateOriginForBuild(mode, values, approvedOrigin) {
  const requested = values.VITE_CLEANFLOW_PRIVATE_EMULATOR_ORIGIN;
  if (!requested) return "";
  if (mode !== "emulator" || values.VITE_FIREBASE_PROJECT_ID !== "demo-cleanflow"
    || values.VITE_USE_FIREBASE_EMULATORS !== "true" || !approvedOrigin || requested !== approvedOrigin) {
    throw new Error("Private origin requires exact local approval and demo emulator build.");
  }
  const parsed = new URL(approvedOrigin);
  if (parsed.protocol !== "https:" || parsed.origin !== approvedOrigin || parsed.username || parsed.password
    || parsed.port !== "8443" || approvedOrigin.includes("*")) throw new Error("Invalid exact private origin approval.");
  return approvedOrigin;
}

export function assertHostingOriginBinding({ environment, currentOrigin, sandboxProjectId,
  buildMode, firebaseProjectId, privateEmulatorOrigin, approvedPrivateEmulatorOrigin } = {}) {
  if (privateEmulatorOrigin) {
    const approved = privateOriginForBuild(buildMode, {
      VITE_CLEANFLOW_PRIVATE_EMULATOR_ORIGIN: privateEmulatorOrigin,
      VITE_FIREBASE_PROJECT_ID: firebaseProjectId,
      VITE_USE_FIREBASE_EMULATORS: environment === "emulator" ? "true" : "false",
    }, approvedPrivateEmulatorOrigin);
    if (environment === "emulator" && currentOrigin === approved) return;
  }
  if (!currentOrigin || localOrigin.test(currentOrigin)) return;
  const projectId = environment === "sandbox" ? sandboxProjectId
    : environment === "production" ? productionFirebaseProjectId : "";
  if (!projectId || projectId === productionFirebaseProjectId && environment === "sandbox") throw new Error("Invalid Hosting environment.");
  if (!projectPattern.test(projectId)) throw new Error("Invalid Hosting project.");
  const preview = new RegExp(`^https://${projectId}--[a-z0-9-]+[.]web[.]app$`);
  if (![ `https://${projectId}.web.app`, `https://${projectId}.firebaseapp.com` ].includes(currentOrigin)
    && !preview.test(currentOrigin)) throw new Error("Hosting origin does not match Firebase project.");
}

const values = import.meta.env || {};
export const cleanflowEnvironment = resolveCleanFlowEnvironment({ mode: values.MODE, firebaseProjectId: values.VITE_FIREBASE_PROJECT_ID });
export const cleanflowSandboxOrigin = resolveSandboxOrigin({
  sandboxProjectId: values.VITE_CLEANFLOW_SANDBOX_PROJECT_ID,
  sandboxOrigin: values.VITE_CLEANFLOW_SANDBOX_ORIGIN,
});
// Presentation only: this does not authorize manager data or Dev Center mutations.
export function canShowEnvironmentNavigation(user, environment = cleanflowEnvironment, allowedEmails = import.meta.env.VITE_CLEANFLOW_ENV_NAVIGATION_EMAILS) {
  if (!["production", "sandbox"].includes(environment) || !user?.uid || user.isAnonymous === true || typeof user.email !== "string" || typeof allowedEmails !== "string") return false;
  const emails = allowedEmails.split(",").map(email => email.trim().toLowerCase())
    .filter(email => /^[^\s@*]+@[^\s@*]+\.[^\s@*]+$/.test(email));
  return emails.includes(user.email.trim().toLowerCase());
}

export function environmentNavigationTarget(environment = cleanflowEnvironment, sandboxBinding = {
  sandboxProjectId: import.meta.env.VITE_CLEANFLOW_SANDBOX_PROJECT_ID,
  sandboxOrigin: import.meta.env.VITE_CLEANFLOW_SANDBOX_ORIGIN,
}) {
  if (environment === "production") {
    const origin = resolveSandboxOrigin(sandboxBinding);
    if (origin) return { href: origin, labelKey: "environment.openSandbox" };
  }
  if (environment === "sandbox") return { href: productionHostingOrigin, labelKey: "environment.backToProduction" };
  return null;
}

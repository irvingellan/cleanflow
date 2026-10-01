export const productionFirebaseProjectId = "clean-flow-prototipo";
export const productionHostingOrigin = "https://clean-flow-prototipo.web.app";

const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function resolveCleanFlowEnvironment({
  mode,
  explicitEnvironment,
  firebaseProjectId,
} = {}) {
  if (["test", "emulator", "e2e"].includes(mode)) return "emulator";
  if (mode === "sandbox" || explicitEnvironment === "sandbox") return "sandbox";
  if (explicitEnvironment === "production") return "production";
  if (firebaseProjectId === productionFirebaseProjectId) return "production";
  return "unknown";
}

export function resolveSandboxOrigin({ sandboxOrigin, sandboxProjectId } = {}) {
  const explicitOrigin = typeof sandboxOrigin === "string"
    ? sandboxOrigin.trim().replace(/\/+$/, "")
    : "";
  if (explicitOrigin) return explicitOrigin;

  const projectId = typeof sandboxProjectId === "string" ? sandboxProjectId.trim() : "";
  return projectId ? `https://${projectId}.web.app` : "";
}

export function assertFirebaseEnvironmentBinding({
  environment,
  firebaseProjectId,
  sandboxProjectId,
} = {}) {
  if (environment === "emulator") return;

  if (environment === "production") {
    if (firebaseProjectId !== productionFirebaseProjectId) {
      throw new Error("Production build is not bound to the production Firebase project.");
    }
    return;
  }

  if (environment === "sandbox") {
    const sandboxId = typeof sandboxProjectId === "string" ? sandboxProjectId.trim() : "";
    if (!sandboxId || sandboxId === productionFirebaseProjectId || firebaseProjectId !== sandboxId) {
      throw new Error("Sandbox build must be bound to one explicit non-production Firebase project.");
    }
    return;
  }

  throw new Error("CleanFlow environment is unknown; refusing Firebase initialization.");
}

export function assertHostingOriginBinding({
  environment,
  currentOrigin,
  sandboxOrigin,
  sandboxProjectId,
  productionOrigin = productionHostingOrigin,
} = {}) {
  if (environment === "emulator" || !currentOrigin || localOriginPattern.test(currentOrigin)) return;

  if (environment === "production") {
    const allowed = new Set([
      productionOrigin.replace(/\/+$/, ""),
      "https://clean-flow-prototipo.firebaseapp.com",
    ]);
    if (!allowed.has(currentOrigin.replace(/\/+$/, ""))) {
      throw new Error("Production build is running on an unexpected Hosting origin.");
    }
    return;
  }

  if (environment === "sandbox") {
    const expected = resolveSandboxOrigin({ sandboxOrigin, sandboxProjectId });
    if (!expected) throw new Error("Sandbox Hosting origin is not configured.");
    const allowed = new Set([
      expected,
      sandboxProjectId ? `https://${sandboxProjectId}.firebaseapp.com` : "",
    ].filter(Boolean));
    if (!allowed.has(currentOrigin.replace(/\/+$/, ""))) {
      throw new Error("Sandbox build is running on an unexpected Hosting origin.");
    }
    return;
  }

  throw new Error("CleanFlow environment is unknown; refusing Hosting binding.");
}

const runtimeEnvironment = import.meta.env;

export const cleanflowEnvironment = resolveCleanFlowEnvironment({
  mode: runtimeEnvironment.MODE,
  explicitEnvironment: runtimeEnvironment.VITE_CLEANFLOW_ENV,
  firebaseProjectId: runtimeEnvironment.VITE_FIREBASE_PROJECT_ID,
});

export const cleanflowProductionOrigin =
  runtimeEnvironment.VITE_CLEANFLOW_PRODUCTION_ORIGIN || productionHostingOrigin;

export const cleanflowSandboxOrigin = resolveSandboxOrigin({
  sandboxOrigin: runtimeEnvironment.VITE_CLEANFLOW_SANDBOX_ORIGIN,
  sandboxProjectId: runtimeEnvironment.VITE_CLEANFLOW_SANDBOX_PROJECT_ID,
});

export function environmentNavigationTarget(environment = cleanflowEnvironment) {
  if (environment === "production" && cleanflowSandboxOrigin) {
    return { href: cleanflowSandboxOrigin, label: "Open Sandbox" };
  }
  if (environment === "sandbox") {
    return { href: cleanflowProductionOrigin, label: "Back to Production" };
  }
  return null;
}

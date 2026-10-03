export const devCenterProductionProjectId = "clean-flow-prototipo";
export const devCenterEmulatorProjectId = "demo-cleanflow";

export function resolveDevCenterProjectId({ projectIdValue, environment = {} } = {}) {
  let declaredProjectId = "";
  try {
    declaredProjectId = projectIdValue?.() || "";
  } catch {
    // Firebase's builtin reads FIREBASE_CONFIG; isolated tests may not set it.
  }
  const identities = [declaredProjectId, environment.GCLOUD_PROJECT, environment.GCP_PROJECT]
    .filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
  if (identities.includes(devCenterProductionProjectId)) return devCenterProductionProjectId;
  return new Set(identities).size === 1 ? identities[0] : "";
}

export function resolveDevCenterEnvironment({ functionsEmulator, currentProjectId, sandboxProjectId } = {}) {
  const current = typeof currentProjectId === "string" ? currentProjectId.trim() : "";
  const sandbox = typeof sandboxProjectId === "string" ? sandboxProjectId.trim() : "";
  // An emulator flag must never turn a production/unknown project into a safe target.
  if (current === devCenterProductionProjectId) return "production";
  if (functionsEmulator === "true") {
    return current === devCenterEmulatorProjectId ? "emulator" : "unknown";
  }
  if (sandbox && sandbox !== devCenterProductionProjectId
    && sandbox !== devCenterEmulatorProjectId && current === sandbox) return "sandbox";
  return "unknown";
}

export function assertDevCenterMutationEnvironment(options = {}) {
  const environment = resolveDevCenterEnvironment(options);
  if (!["emulator", "sandbox"].includes(environment)) {
    throw new Error("Dev Center mutations require demo-cleanflow emulators or the explicitly allowlisted Sandbox project.");
  }
  return environment;
}

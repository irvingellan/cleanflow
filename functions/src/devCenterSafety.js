export const devCenterProductionProjectId = "clean-flow-prototipo";

export function resolveDevCenterEnvironment({
  functionsEmulator,
  currentProjectId,
  sandboxProjectId,
  productionProjectId = devCenterProductionProjectId,
} = {}) {
  if (functionsEmulator === "true") return "emulator";

  const current = typeof currentProjectId === "string" ? currentProjectId.trim() : "";
  const sandbox = typeof sandboxProjectId === "string" ? sandboxProjectId.trim() : "";

  if (current === productionProjectId) return "production";
  if (sandbox && sandbox !== productionProjectId && current === sandbox) return "sandbox";
  return "unknown";
}

export function assertDevCenterMutationEnvironment(options = {}) {
  const environment = resolveDevCenterEnvironment(options);
  if (!["emulator", "sandbox"].includes(environment)) {
    throw new Error("Dev Center mutations require the Firebase emulator or the explicitly allowlisted Sandbox project.");
  }
  return environment;
}

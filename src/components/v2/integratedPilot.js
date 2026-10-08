// Presentation selection only. ManagerAccess and server authorization remain independent.
export function resolveManagerExperience(value) {
  if (value === undefined || value === "" || value === "current") return "current";
  if (value === "v2") return "v2";
  throw new Error("Manager experience must be current or v2; refusing ambiguous build.");
}
export function integratedPilotEnabled({ mode, authorized, buildExperience = "current", search = "" } = {}) {
  if (mode === "production") return buildExperience === "v2";
  return mode === "sandbox" && authorized === true
    && new URLSearchParams(search).get("experience") === "v2";
}

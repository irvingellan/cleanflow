// Presentation selection only. ManagerAccess and server authorization remain independent.
export function integratedPilotEnabled({ mode, authorized, search = "" } = {}) {
  return mode === "sandbox" && authorized === true
    && new URLSearchParams(search).get("experience") === "v2";
}

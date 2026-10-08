// UI opt-in only. Never authorizes ManagerAccess, data or Dev Center.
export const shellPilotStorageKey = "cleanflow-sandbox-shell-pilot";
export function shellPilotEnabled({ mode, authorized, search = "", storage } = {}) {
  if (mode !== "sandbox" || authorized !== true) return false;
  const choice = new URLSearchParams(search).get("shell");
  if (choice === "current") return false;
  if (choice === "v2") return true;
  try { return storage?.getItem(shellPilotStorageKey) === "v2"; } catch { return false; }
}
export function rememberShellPilot(choice, storage) {
  try { storage?.setItem(shellPilotStorageKey, choice === "v2" ? "v2" : "current"); } catch { /* query remains explicit */ }
}
export function shellComparisonHref(search, choice) {
  const query = new URLSearchParams(search); query.set("shell", choice);
  return `?${query.toString()}`;
}

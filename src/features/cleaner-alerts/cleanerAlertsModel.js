// Whether each cleaner's phone can receive CleanFlow alerts, and the one next step.
// States, in the order a cleaner moves through them:
//   no-app     → she has never opened her agenda (no active access)
//   alerts-off → the manager has not turned on "Phone alerts" for her
//   no-device  → alerts are on, but no phone of hers is subscribed yet
//   ready      → at least one phone will receive alerts
//   unknown    → the server could not say (offline, error, transport unavailable)
export const alertStates = ["no-app", "alerts-off", "no-device", "unknown", "ready"];

export function alertReadiness({ cleaner, access, overview }) {
  if (!access) return { state: "unknown" };
  if (!access.active) return { state: "no-app" };
  if (cleaner?.pushAlertsEnabled !== true) return { state: "alerts-off" };
  if (!overview || overview.state !== "ready") return { state: "unknown" };
  const devices = Number.isFinite(overview.activeDevices) ? overview.activeDevices : 0;
  return devices > 0 ? { state: "ready", devices } : { state: "no-device" };
}

/** Rows sorted so the cleaners who need action come first, then by name. */
export function buildAlertRows(entries) {
  const rank = (state) => alertStates.indexOf(state);
  return entries
    .map(({ cleaner, access, overview }) => ({ cleaner, ...alertReadiness({ cleaner, access, overview }) }))
    .sort((first, second) => rank(first.state) - rank(second.state)
      || (first.cleaner.name || "").localeCompare(second.cleaner.name || ""));
}

export function alertSummary(rows) {
  return { total: rows.length, ready: rows.filter((row) => row.state === "ready").length };
}

export const isAlertEligible = (cleaner) => cleaner?.active !== false && !cleaner?.archivedAt;

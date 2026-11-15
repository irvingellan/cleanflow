import { getCleaners } from "../cleaners/cleanerService.js";
import { getCleanerHubAccess, getCleanerPushOverview, setCleanerPushAlerts } from "../cleaners/cleanerHubAccessService.js";
import { buildAlertRows, isAlertEligible } from "./cleanerAlertsModel.js";

/** Read-only: access status per cleaner, and device count only where alerts are on. */
export async function loadCleanerAlerts() {
  const cleaners = (await getCleaners()).filter(isAlertEligible);
  const entries = await Promise.all(cleaners.map(async (cleaner) => {
    const access = await getCleanerHubAccess(cleaner.id).catch(() => null);
    const overview = access?.active && cleaner.pushAlertsEnabled === true
      ? await getCleanerPushOverview(cleaner.id).catch(() => null)
      : null;
    return { cleaner, access, overview };
  }));
  return buildAlertRows(entries);
}

export { setCleanerPushAlerts };

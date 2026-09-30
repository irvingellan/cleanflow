import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";
import { getLocalPushDeviceId } from "./notificationService.js";
import { readLocalNotificationHealth } from "./notificationHealthService.js";

const reportHealthCall = httpsCallable(functions, "reportManagerNotificationHealth");

/** Best effort only: diagnostics must never block the manager app. */
export async function reportCurrentManagerNotificationHealth() {
  try {
    const deviceId = getLocalPushDeviceId();
    const {
      notificationPermission, serviceWorker, fcmRegistration,
      platform, browserClass, standalone, appVersion,
    } = await readLocalNotificationHealth();
    await reportHealthCall({
      deviceId, notificationPermission, serviceWorker, fcmRegistration,
      platform, browserClass, standalone, appVersion,
    });
    return true;
  } catch {
    return false;
  }
}

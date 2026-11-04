import { getAuth } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { firebaseApp, functions } from "../../services/firebase/client.js";
import { getLocalPushDeviceId } from "./notificationService.js";
import { readLocalNotificationHealth } from "./notificationHealthService.js";
import { safeFcmFailureFields } from "./notificationReadiness.js";

const reportHealthCall = httpsCallable(functions, "reportManagerNotificationHealth");

/** Best effort only: diagnostics must never block the manager app. */
export async function reportCurrentManagerNotificationHealth() {
  try {
    const user = getAuth(firebaseApp).currentUser;
    if (!user?.uid) return false;
    const deviceId = getLocalPushDeviceId();
    const {
      notificationPermission, serviceWorker, fcmRegistration,
      platform, browserClass, standalone, appVersion, fcmErrorStage, fcmErrorCode,
    } = await readLocalNotificationHealth();
    if (getAuth(firebaseApp).currentUser !== user) return false;
    await reportHealthCall({
      deviceId, notificationPermission, serviceWorker, fcmRegistration,
      platform, browserClass, standalone, appVersion,
      ...safeFcmFailureFields({ fcmRegistration, fcmErrorStage, fcmErrorCode }),
    });
    return getAuth(firebaseApp).currentUser === user;
  } catch {
    return false;
  }
}

import { doc, getDocFromServer } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { setCleanerPushAlerts as writeCleanerPushAlerts } from "./cleanerService.js";
import { db, firebaseApp, functions } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

function timestampIso(value) {
  return value?.toDate?.()?.toISOString?.() || null;
}

/** Server-written link status; never contains codes, hashes or account IDs for display. */
export async function getCleanerHubAccess(cleanerId) {
  const snapshot = await getDocFromServer(doc(db, "organizations", organizationId, "cleanerHubAccess", cleanerId));
  if (!snapshot.exists()) return { active: false, linkedAt: null, revokedAt: null, pendingCodeExpiresAt: null };
  const data = snapshot.data();
  return {
    active: data.active === true,
    linkedAt: timestampIso(data.linkedAt),
    revokedAt: timestampIso(data.revokedAt),
    pendingCodeExpiresAt: timestampIso(data.pendingCodeExpiresAt),
  };
}

export async function issueCleanerAccessCode(cleanerId, { additionalDevice = false } = {}) {
  const { data } = await httpsCallable(functions, "issueCleanerAccessCode")({
    cleanerId, ...(additionalDevice ? { additionalDevice: true } : {}),
  });
  return data;
}

export async function revokeCleanerHubAccess(cleanerId) {
  const { data } = await httpsCallable(functions, "revokeCleanerHubAccess")({ cleanerId });
  return data;
}

export function cleanerHubUrl(origin = window.location.origin) {
  return `${origin}/agenda`;
}

export function setCleanerPushAlerts(cleanerId, enabled) {
  return writeCleanerPushAlerts(cleanerId, enabled, getAuth(firebaseApp).currentUser?.uid);
}

import { doc as serverDoc, getDoc as getServerDoc } from "firebase/firestore/lite";
import { httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { setCleanerPushAlerts as writeCleanerPushAlerts } from "./cleanerService.js";
import { firebaseApp, functions } from "../../services/firebase/client.js";
import { serverFirestore, withReadDeadline } from "../../services/firebase/serverReads.js";
import { currentOrganizationId } from "../../services/organization/currentOrganization.js";

function timestampIso(value) {
  return value?.toDate?.()?.toISOString?.() || null;
}

/** Server-written link status; never contains codes, hashes or account IDs for display. */
export async function getCleanerHubAccess(cleanerId) {
  // One-shot server read with a deadline, independent of the realtime channel.
  const snapshot = await withReadDeadline(getServerDoc(
    serverDoc(serverFirestore(), "organizations", currentOrganizationId(), "cleanerHubAccess", cleanerId),
  ));
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

/** Whether alerts are on and how many of the cleaner's phones would receive them. */
export async function getCleanerPushOverview(cleanerId) {
  const { data } = await httpsCallable(functions, "cleanerPushTest")({ action: "overview", cleanerId });
  return data;
}

/** Sends one test notice to the cleaner's active phones and returns the provider outcome. */
export async function sendCleanerPushTest(cleanerId) {
  const { data } = await httpsCallable(functions, "cleanerPushTest", { timeout: 30_000 })({ action: "send", cleanerId });
  return data;
}

export function setCleanerPushAlerts(cleanerId, enabled) {
  return writeCleanerPushAlerts(cleanerId, enabled, getAuth(firebaseApp).currentUser?.uid);
}

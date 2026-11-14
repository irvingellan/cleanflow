import { onIdTokenChanged, signInWithCustomToken, signOut } from "firebase/auth";
import { clearIndexedDbPersistence, collection, disableNetwork, doc, enableNetwork, getDocFromServer, getDocsFromServer, onSnapshot, query, terminate, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { prepareCleanerPushAccountSwitch, prepareCleanerPushSignOut } from "../notifications/cleanerPushService.js";
import { cleanerHubFirebase } from "./cleanerHubFirebase.js";

/**
 * Cleaner Hub service boundary. UI code never touches Firebase directly.
 * Reads come only from the server-written cleanerAgenda projection; actions go
 * through cleaner-authorized callables that reuse existing domain services.
 */

function claimsFrom(result) {
  const hub = result?.claims?.cleanerHub;
  return hub && typeof hub.organizationId === "string" && typeof hub.cleanerId === "string"
    && typeof hub.sessionId === "string" && hub.sessionId.length > 0 ? hub : null;
}

export function subscribeCleanerSession(onSession) {
  const { auth } = cleanerHubFirebase();
  let version = 0;
  const unsubscribe = onIdTokenChanged(auth, async (user) => {
    const current = ++version;
    if (!user) {
      onSession({ status: "signed-out" });
      return;
    }
    try {
      const claims = claimsFrom(await user.getIdTokenResult());
      if (current !== version) return;
      onSession(claims
        ? { status: "signed-in", uid: user.uid, organizationId: claims.organizationId, cleanerId: claims.cleanerId, sessionId: claims.sessionId }
        : { status: "not-cleaner" });
    } catch {
      // Offline reopen: the stored session exists but claims could not refresh.
      if (current === version) onSession({ status: "unverified" });
    }
  });
  return () => {
    version += 1;
    unsubscribe();
  };
}

export async function redeemAccessCode(code) {
  const { auth, functions } = cleanerHubFirebase();
  const redeem = httpsCallable(functions, "redeemCleanerAccessCode");
  const { data } = await redeem({ code });
  await prepareCleanerPushAccountSwitch();
  await signInWithCustomToken(auth, data.token);
}

function activeMembership(data, { cleanerId, sessionId }) {
  return data?.role === "CLEANER" && data.active === true
    && data.cleanerId === cleanerId
    && (Object.hasOwn(data, "sessionIds")
      ? Array.isArray(data.sessionIds) && data.sessionIds.includes(sessionId)
      : data.sessionId === sessionId);
}

/** Live CLEANER membership. Revocation or removal ends the session here. */
export function subscribeMembership(scope, onMembership) {
  const { organizationId, uid } = scope;
  const { db } = cleanerHubFirebase();
  return onSnapshot(
    doc(db, "organizations", organizationId, "members", uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) return;
      const data = snapshot.data();
      onMembership(activeMembership(data, scope)
        ? { state: "active", displayName: data.displayName || null, preferredLanguage: data.preferredLanguage || null }
        : { state: "revoked" });
    },
    (error) => {
      console.warn("cleaner-hub-membership-listener", error?.code || "unknown");
      onMembership({ state: error?.code === "permission-denied" ? "revoked" : "error" });
    },
  );
}

export function subscribeAgenda({ organizationId, cleanerId }, onAgenda, onError) {
  const { db } = cleanerHubFirebase();
  return onSnapshot(
    query(collection(db, "organizations", organizationId, "cleanerAgenda"), where("cleanerId", "==", cleanerId)),
    { includeMetadataChanges: true },
    (snapshot) => onAgenda({
      entries: snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id })),
      fromCache: snapshot.metadata.fromCache,
    }),
    (error) => {
      // Code only; no identifiers. A failed listener stops, so the hook retries.
      console.warn("cleaner-hub-agenda-listener", error?.code || "unknown");
      onError(error?.code || "unknown");
    },
  );
}

/**
 * Server check that does not depend on the live stream: confirms the membership
 * is still active and returns the current agenda. Used while the app is open,
 * so a silently stalled connection can never keep stale data labelled current.
 */
export async function verifyFromServer(scope) {
  const { organizationId, uid, cleanerId } = scope;
  const { db } = cleanerHubFirebase();
  let member;
  try {
    member = await getDocFromServer(doc(db, "organizations", organizationId, "members", uid));
  } catch (error) {
    if (error?.code === "permission-denied") return { active: false };
    throw error;
  }
  if (!activeMembership(member.data(), scope)) return { active: false };
  const agenda = await getDocsFromServer(query(collection(db, "organizations", organizationId, "cleanerAgenda"), where("cleanerId", "==", cleanerId)));
  return { active: true, entries: agenda.docs.map((entry) => ({ ...entry.data(), id: entry.id })) };
}

/**
 * Reopens Firestore's connection after the phone regains network or the
 * Home Screen app returns to the foreground; long-lived streams often die there.
 */
export async function reconnectAgenda() {
  const { db } = cleanerHubFirebase();
  try {
    await disableNetwork(db);
  } finally {
    await enableNetwork(db);
  }
}

/** FB01: shared access details for a Job this cleaner is on. Never stored. */
export async function getMyJobAccess(jobId) {
  const { functions } = cleanerHubFirebase();
  const { data } = await httpsCallable(functions, "getMyJobAccess")({ jobId });
  return data;
}

export async function openMyChecklist(jobId) {
  const { functions } = cleanerHubFirebase();
  const { data } = await httpsCallable(functions, "openMyChecklist")({ jobId });
  return data;
}

export async function respondToMyOffer(jobId, status, current = {}) {
  const { functions } = cleanerHubFirebase();
  const { data } = await httpsCallable(functions, "respondToMyOffer", { timeout: 15_000 })({ jobId, status, ...current });
  return data;
}

/** Signs out and wipes this device's cached agenda before the page reloads. */
export async function signOutCleaner(session) {
  const { auth, db } = cleanerHubFirebase();
  await prepareCleanerPushSignOut(session);
  await signOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Memory-only cache or another tab still open: the reload below clears memory.
  }
}

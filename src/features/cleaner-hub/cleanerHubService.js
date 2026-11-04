import { onAuthStateChanged, signInWithCustomToken, signOut } from "firebase/auth";
import { clearIndexedDbPersistence, collection, doc, onSnapshot, query, terminate, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { cleanerHubFirebase } from "./cleanerHubFirebase.js";

/**
 * Cleaner Hub service boundary. UI code never touches Firebase directly.
 * Reads come only from the server-written cleanerAgenda projection; actions go
 * through cleaner-authorized callables that reuse existing domain services.
 */

function claimsFrom(result) {
  const hub = result?.claims?.cleanerHub;
  return hub && typeof hub.organizationId === "string" && typeof hub.cleanerId === "string" ? hub : null;
}

export function subscribeCleanerSession(onSession) {
  const { auth } = cleanerHubFirebase();
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onSession({ status: "signed-out" });
      return;
    }
    try {
      const claims = claimsFrom(await user.getIdTokenResult());
      onSession(claims
        ? { status: "signed-in", uid: user.uid, organizationId: claims.organizationId, cleanerId: claims.cleanerId }
        : { status: "not-cleaner" });
    } catch {
      // Offline reopen: the stored session exists but claims could not refresh.
      onSession({ status: "unverified" });
    }
  });
}

export async function redeemAccessCode(code) {
  const { auth, functions } = cleanerHubFirebase();
  const redeem = httpsCallable(functions, "redeemCleanerAccessCode");
  const { data } = await redeem({ code });
  await signInWithCustomToken(auth, data.token);
}

/** Live CLEANER membership. Revocation or removal ends the session here. */
export function subscribeMembership({ organizationId, uid, cleanerId }, onMembership) {
  const { db } = cleanerHubFirebase();
  return onSnapshot(
    doc(db, "organizations", organizationId, "members", uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) return;
      const data = snapshot.data();
      const active = data?.role === "CLEANER" && data?.active === true && data?.cleanerId === cleanerId;
      onMembership(active
        ? { state: "active", displayName: data.displayName || null, preferredLanguage: data.preferredLanguage || null }
        : { state: "revoked" });
    },
    (error) => onMembership({ state: error?.code === "permission-denied" ? "revoked" : "error" }),
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
    (error) => onError(error?.code || "unknown"),
  );
}

export async function openMyChecklist(jobId) {
  const { functions } = cleanerHubFirebase();
  const { data } = await httpsCallable(functions, "openMyChecklist")({ jobId });
  return data;
}

export async function respondToMyOffer(jobId, status) {
  const { functions } = cleanerHubFirebase();
  const { data } = await httpsCallable(functions, "respondToMyOffer")({ jobId, status });
  return data;
}

/** Signs out and wipes this device's cached agenda before the page reloads. */
export async function signOutCleaner() {
  const { auth, db } = cleanerHubFirebase();
  await signOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Memory-only cache or another tab still open: the reload below clears memory.
  }
}

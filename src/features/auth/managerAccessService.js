import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

function membershipReference(user) {
  return doc(db, "organizations", organizationId, "members", user.uid);
}

function isActiveManager(snapshot) {
  const membership = snapshot.data();
  return membership?.role === "MANAGER" && membership?.active === true;
}

export async function verifyManagerAccess(user) {
  if (!user?.uid || user.isAnonymous) return false;
  const snapshot = await getDocFromServer(membershipReference(user));
  // getDocFromServer must never fall back to cached authority, even if SDK behavior changes.
  if (snapshot.metadata.fromCache) throw Object.assign(new Error(), { code: "unavailable" });
  return isActiveManager(snapshot);
}

export function subscribeToManagerAccess(user, onAccess, onError, onCacheSnapshot = () => {}) {
  if (!user?.uid || user.isAnonymous) {
    onAccess(false);
    return () => {};
  }
  return onSnapshot(
    membershipReference(user),
    { includeMetadataChanges: true },
    (snapshot) => {
      // The UI never grants entry from a stale cached membership. Rules remain authoritative.
      if (snapshot.metadata.fromCache) {
        onCacheSnapshot();
        return;
      }
      onAccess(isActiveManager(snapshot));
    },
    onError,
  );
}

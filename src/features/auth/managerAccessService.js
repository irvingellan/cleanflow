import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

export function subscribeToManagerAccess(user, onAccess, onError) {
  if (!user?.uid || user.isAnonymous) {
    onAccess(false);
    return () => {};
  }
  return onSnapshot(
    doc(db, "organizations", organizationId, "members", user.uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      // The UI never grants entry from a stale cached membership. Rules remain authoritative.
      if (snapshot.metadata.fromCache) return;
      const membership = snapshot.data();
      onAccess(membership?.role === "MANAGER" && membership?.active === true);
    },
    onError,
  );
}

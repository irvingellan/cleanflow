import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

// Keep atomic revocation well below Firestore's transaction limits. This
// server-only document contains hashes, never the bearer links or manager status.
const maximumLiveGrants = 32;

function grantsRef(accessRef) {
  return accessRef.parent.parent.collection("cleanerHubChecklistGrants").doc(accessRef.id);
}

async function getGrants(transaction, accessRef) {
  const snapshot = await transaction.get(grantsRef(accessRef));
  const grants = snapshot.exists ? snapshot.data().grants : [];
  if (!Array.isArray(grants) || grants.length > maximumLiveGrants) {
    throw new HttpsError("failed-precondition", "Checklist link state is unavailable.");
  }
  return grants;
}

export async function recordHubChecklistGrant(transaction, accessRef, grant, now) {
  const grants = await getGrants(transaction, accessRef);
  const active = grants.filter((item) => item.expiresAtMs > now.getTime()
    && (item.jobId !== grant.jobId || item.runId !== grant.runId));
  if (active.length >= maximumLiveGrants) {
    throw new HttpsError("resource-exhausted", "Too many active checklist links.");
  }
  transaction.set(grantsRef(accessRef), { grants: [...active, grant] });
}

export async function readHubChecklistGrants(transaction, accessRef) {
  const grants = await getGrants(transaction, accessRef);
  const organization = accessRef.parent.parent;
  return Promise.all(grants.map(async (grant) => {
    const reference = organization.collection("jobs").doc(grant.jobId)
      .collection("checklistRuns").doc(grant.runId).collection("checklistCapabilities").doc("active");
    return { grant, snapshot: await transaction.get(reference) };
  }));
}

export function revokeHubChecklistGrants(transaction, accessRef, grants) {
  for (const { grant, snapshot } of grants) {
    const data = snapshot.data();
    if (data?.status === "ACTIVE" && data.cleanerId === accessRef.id && data.tokenHash === grant.tokenHash) {
      transaction.update(snapshot.ref, { status: "REVOKED", revokedAt: FieldValue.serverTimestamp() });
    }
  }
  transaction.set(grantsRef(accessRef), { grants: [] });
}

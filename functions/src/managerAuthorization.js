import { HttpsError } from "firebase-functions/v2/https";

// This contract is also enforced in Firestore/Storage rules; emulator tests cover parity.
export function isActiveManagerMembership(data) {
  return data?.role === "MANAGER" && data?.active === true;
}

export async function requireOrganizationManager(database, request, organizationId) {
  if (!request.auth?.uid || request.auth.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "A non-anonymous account is required.");
  }

  const membership = await database.doc(
    `organizations/${organizationId}/members/${request.auth.uid}`,
  ).get();
  if (!isActiveManagerMembership(membership.data())) {
    throw new HttpsError("permission-denied", "Active organization manager access is required.");
  }
}

export async function authorizedManagerDevices(database, organizationId, devices) {
  const userIds = [...new Set(devices.map((device) => device.data().userId)
    .filter((uid) => typeof uid === "string" && uid.length > 0 && !uid.includes("/")))];
  if (userIds.length === 0) return [];
  // Re-check membership at dispatch: previously enrolled devices do not outlive revocation.
  const memberships = await database.getAll(...userIds.map((uid) => (
    database.doc(`organizations/${organizationId}/members/${uid}`)
  )));
  const allowedUids = new Set(memberships
    .filter((snapshot) => isActiveManagerMembership(snapshot.data()))
    .map((snapshot) => snapshot.id));
  return devices.filter((device) => device.data().organizationId === organizationId
    && allowedUids.has(device.data().userId));
}

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { isActiveManagerMembership, requireOrganizationManager } from "./managerAuthorization.js";
import { registrationDocumentId } from "./notificationLab.js";

function validateInput(input, deactivate) {
  const allowed = new Set(deactivate ? ["deviceId", "token", "registrationRevision"] : ["deviceId", "token", "language"]);
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !allowed.has(key))
    || typeof input.deviceId !== "string" || !/^[A-Za-z0-9-]{16,80}$/.test(input.deviceId)
    || typeof input.token !== "string" || input.token.length < 32 || input.token.length > 4096
    || /[\s\u0000-\u001f\u007f]/.test(input.token)
    || (deactivate && (!Number.isSafeInteger(input.registrationRevision) || input.registrationRevision < 1))) {
    throw new HttpsError("invalid-argument", "Push device request is invalid.");
  }
}

function signOutSupersedesInvalidation(current) {
  const signedOutAt = current.deactivatedAt;
  const invalidatedAt = current.invalidatedAt;
  // Compare Firestore commit timestamps at their full precision. Missing,
  // malformed or equal timestamps cannot prove the invalidation is historical.
  return current.deactivationReason === "SIGNED_OUT"
    && signedOutAt instanceof Timestamp && invalidatedAt instanceof Timestamp
    && (signedOutAt.seconds > invalidatedAt.seconds
      || (signedOutAt.seconds === invalidatedAt.seconds && signedOutAt.nanoseconds > invalidatedAt.nanoseconds));
}

async function mutateRegistration({ database, organizationId, request }, deactivate) {
  await requireOrganizationManager(database, request, organizationId);
  validateInput(request.data, deactivate);
  const userId = request.auth.uid;
  const { deviceId, token, registrationRevision } = request.data;
  const reference = database.doc(`managerPushDevices/${registrationDocumentId(userId, deviceId)}`);
  const membershipReference = database.doc(`organizations/${organizationId}/members/${userId}`);
  return database.runTransaction(async (transaction) => {
    const [membership, snapshot] = await Promise.all([transaction.get(membershipReference), transaction.get(reference)]);
    if (!isActiveManagerMembership(membership.data())) {
      throw new HttpsError("permission-denied", "Active manager access is required.");
    }
    const current = snapshot.data();
    if (snapshot.exists && (current.userId !== userId || current.organizationId !== organizationId)) {
      throw new HttpsError("permission-denied", "Push device does not belong to this manager.");
    }
    if (deactivate) {
      if (!snapshot.exists || current.active !== true || current.token !== token
        || current.registrationRevision !== registrationRevision) return { deactivated: false };
      transaction.update(reference, { active: false, tokenState: "signed-out", invalidationReason: null,
        deactivationReason: "SIGNED_OUT",
        deactivatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { deactivated: true };
    }
    // Older deployed invalidators can finish after sign-out without clearing
    // its marker. Only a strictly later server sign-out proves old history.
    if (snapshot.exists && current.token === token && (current.tokenState === "invalidated"
      || (current.active === false && current.invalidatedAt != null && !signOutSupersedesInvalidation(current)))) {
      throw new HttpsError("failed-precondition", "The cached FCM token was invalidated.", { reason: "fcm-token-invalidated" });
    }
    const previousRevision = Number.isSafeInteger(current?.registrationRevision) && current.registrationRevision > 0
      ? current.registrationRevision : 0;
    if (previousRevision >= Number.MAX_SAFE_INTEGER) throw new HttpsError("failed-precondition", "Registration revision exhausted.");
    const revision = previousRevision + 1;
    transaction.set(reference, { organizationId, userId, token, registrationRevision: revision,
      language: ["en", "pt", "es"].includes(request.data.language) ? request.data.language : "pt",
      platform: "web", active: true, tokenState: "active", invalidationReason: null,
      deactivationReason: null,
      ...(!snapshot.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(), lastSeenAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { registered: true, registrationRevision: revision };
  });
}

export async function registerManagerDevice(options) { return mutateRegistration(options, false); }
export async function deactivateManagerDevice(options) { return mutateRegistration(options, true); }

import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { isActiveManagerMembership, requireOrganizationManager } from "./managerAuthorization.js";
import { registrationDocumentId } from "./notificationLab.js";

const claimIdPattern = /^[a-f0-9]{64}$/;
const legacyTokenMatchLimit = 20;

function claimKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function managerTokenClaimReference(database, token) {
  return database.doc(`managerPushTokenClaims/${claimKey(token)}`);
}

export function managerInstallationClaimReference(database, installationKey) {
  return database.doc(`managerPushInstallationClaims/${installationKey}`);
}

export function managerClaimMatches(claim, registrationId, record) {
  return claim?.registrationId === registrationId
    && claim.organizationId === record.organizationId && claim.userId === record.userId
    && claim.registrationRevision === record.registrationRevision && claim.installationKey === record.installationKey;
}

async function supersededRegistrations(transaction, database, { organizationId, reference, token, tokenClaim, installationClaim }) {
  const claims = [tokenClaim, installationClaim].filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.data());
  if (claims.some((claim) => claim?.organizationId !== organizationId || !claimIdPattern.test(claim.registrationId || ""))) {
    throw new HttpsError("permission-denied", "Push installation cannot be transferred.");
  }

  const matches = new Map();
  const priorIds = new Set(claims.map((claim) => claim.registrationId).filter((id) => id !== reference.id));
  for (const id of priorIds) {
    const priorRef = database.doc(`managerPushDevices/${id}`);
    const prior = (await transaction.get(priorRef)).data();
    if (prior && claims.some((claim) => managerClaimMatches(claim, id, prior)) && prior.active === true) {
      matches.set(priorRef.path, priorRef);
    }
  }

  // Old documents carry no installation ownership. The exact existing token
  // is the only safe way to adopt them without replacing unrelated devices.
  if (!tokenClaim.exists) {
    const legacy = await transaction.get(database.collection("managerPushDevices")
      .where("token", "==", token).limit(legacyTokenMatchLimit));
    if (legacy.docs.length === legacyTokenMatchLimit) {
      throw new HttpsError("failed-precondition", "Push installation needs manager review.");
    }
    for (const previous of legacy.docs) {
      const record = previous.data();
      if (record.token !== token) continue;
      if (record.organizationId !== organizationId) {
        throw new HttpsError("permission-denied", "Push installation cannot be transferred.");
      }
      if (previous.ref.path !== reference.path && record.active === true) matches.set(previous.ref.path, previous.ref);
    }
  }

  return [...matches.values()];
}

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
    const installationKey = claimKey(deviceId);
    const tokenClaimRef = managerTokenClaimReference(database, token);
    const installationClaimRef = managerInstallationClaimReference(database, installationKey);
    const [tokenClaim, installationClaim] = await Promise.all([
      transaction.get(tokenClaimRef), transaction.get(installationClaimRef),
    ]);
    const previous = await supersededRegistrations(transaction, database, {
      organizationId, reference, token, tokenClaim, installationClaim,
    });
    const now = FieldValue.serverTimestamp();
    for (const previousReference of previous) {
      transaction.update(previousReference, {
        active: false, tokenState: "superseded", deactivationReason: "OWNERSHIP_SUPERSEDED",
        deactivatedAt: now, updatedAt: now,
      });
    }
    const claim = { organizationId, userId, registrationId: reference.id, registrationRevision: revision, installationKey, updatedAt: now };
    transaction.set(tokenClaimRef, claim);
    transaction.set(installationClaimRef, claim);
    transaction.set(reference, { organizationId, userId, token, registrationRevision: revision, installationKey,
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

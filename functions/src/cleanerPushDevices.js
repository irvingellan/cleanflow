import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { assertSessionForMutation, cleanerAccountUid } from "./cleanerHubAccess.js";
import { approvedCleanerPushPilotDevice } from "./cleanerPushPilot.js";

const deviceIdPattern = /^[A-Za-z0-9-]{16,80}$/;
const sessionIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const platforms = new Set(["ios-pwa", "android", "desktop"]);
const languages = new Set(["pt", "en", "es"]);
const inactiveReasons = new Set(["SIGNED_OUT", "PERMISSION_REVOKED"]);

function validSegment(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    && value !== "." && value !== ".." && !value.includes("/");
}

function validCleanerFcmToken(token) {
  return typeof token === "string" && token.length >= 32 && token.length <= 4096
    && !/[\s\u0000-\u001f\u007f]/.test(token);
}

function validRegistrationRevision(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function validateRequest(identity, data, allowed) {
  if (!validSegment(identity?.organizationId) || !validSegment(identity?.cleanerId)
    || identity.uid !== cleanerAccountUid(identity.organizationId, identity.cleanerId)
    || !sessionIdPattern.test(identity.sessionId || "")) {
    throw new HttpsError("permission-denied", "Active cleaner access is required.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)
    || Object.keys(data).some((key) => !allowed.includes(key))
    || typeof data.deviceId !== "string" || !deviceIdPattern.test(data.deviceId)) {
    throw new HttpsError("invalid-argument", "Push installation is invalid.");
  }
}

export function cleanerDeviceReference(database, { organizationId, uid, sessionId }) {
  return database.doc(`organizations/${organizationId}/cleanerPushAccounts/${uid}/devices/${sessionId}`);
}

function cleanerTokenClaimReference(database, token) {
  const digest = createHash("sha256").update(token).digest("hex");
  return database.doc(`cleanerPushTokenClaims/${digest}`);
}

function cleanerInstallationClaimReference(database, deviceId) {
  const digest = createHash("sha256").update(deviceId).digest("hex");
  return database.doc(`cleanerPushInstallationClaims/${digest}`);
}

function ownsRegistration(record, { organizationId, uid, cleanerId, sessionId }) {
  return record?.organizationId === organizationId && record?.userId === uid
    && record?.cleanerId === cleanerId && record?.sessionId === sessionId
    && record?.role === "CLEANER" && record?.provider === "fcm";
}

export function eligibleCleanerRegistration(record, identity) {
  return ownsRegistration(record, identity) && record.active === true
    && record.tokenState === "active" && record.permission === "granted"
    && platforms.has(record.platform) && languages.has(record.language) && typeof record.deviceId === "string" && deviceIdPattern.test(record.deviceId)
    && validCleanerFcmToken(record.token) && validRegistrationRevision(record.registrationRevision)
    && typeof record.bindingId === "string" && /^[a-f0-9]{32}$/.test(record.bindingId);
}

function cleanerClaimMatches(claim, record) {
  return claim?.active === true && claim.organizationId === record.organizationId
    && claim.userId === record.userId && claim.cleanerId === record.cleanerId
    && claim.sessionId === record.sessionId && claim.deviceId === record.deviceId
    && claim.registrationRevision === record.registrationRevision && claim.bindingId === record.bindingId;
}

function cleanerClaimsFor(database, { token, deviceId }) {
  return [cleanerTokenClaimReference(database, token), cleanerInstallationClaimReference(database, deviceId)];
}

async function matchingClaims(transaction, database, record) {
  const claims = await Promise.all(cleanerClaimsFor(database, record).map((reference) => transaction.get(reference)));
  return claims.filter((claim) => cleanerClaimMatches(claim.data(), record));
}

export async function hasCurrentCleanerClaims(transaction, database, record) {
  return (await matchingClaims(transaction, database, record)).length === 2;
}

function assertRegistrationOwner(snapshot, identity) {
  if (snapshot.exists && !ownsRegistration(snapshot.data(), identity)) {
    throw new HttpsError("permission-denied", "Push installation does not belong to this session.");
  }
}

export async function registerCleanerDevice(database, identity, data, mode) {
  if (mode !== "pilot" && mode !== "enabled") {
    throw new HttpsError("failed-precondition", "Cleaner push is not enabled.");
  }
  validateRequest(identity, data, ["deviceId", "token", "platform", "permission", "language"]);
  if (!validCleanerFcmToken(data.token) || !platforms.has(data.platform) || data.permission !== "granted") {
    throw new HttpsError("invalid-argument", "Push enrollment requires a granted permission and valid installation.");
  }
  const reference = cleanerDeviceReference(database, identity);
  const [tokenClaimRef, installationClaimRef] = cleanerClaimsFor(database, data);
  const nextBinding = randomBytes(16).toString("hex");
  return database.runTransaction(async (transaction) => {
    const [snapshot, tokenClaim, installationClaim, approved] = await Promise.all([
      transaction.get(reference), transaction.get(tokenClaimRef), transaction.get(installationClaimRef),
      mode !== "pilot" || approvedCleanerPushPilotDevice(transaction, database, { ...identity, deviceId: data.deviceId }),
      assertSessionForMutation(transaction, database, identity),
    ]);
    if (!approved) {
      throw new HttpsError("permission-denied", "This installation is not eligible for cleaner push.", {
        reason: "cleaner-push-pilot-ineligible",
      });
    }
    assertRegistrationOwner(snapshot, identity);
    const current = snapshot.data();
    const claim = tokenClaim.data();
    if (claim?.invalidatedAt != null || (current?.token === data.token && current.tokenState === "invalidated")) {
      throw new HttpsError("failed-precondition", "The cached FCM token was invalidated.", { reason: "fcm-token-invalidated" });
    }
    const repeated = eligibleCleanerRegistration(current, identity) && current.deviceId === data.deviceId
      && current.token === data.token && cleanerClaimMatches(claim, current)
      && cleanerClaimMatches(installationClaim.data(), current);
    const language = languages.has(data.language) ? data.language : "pt";
    const now = FieldValue.serverTimestamp();
    if (repeated) {
      transaction.update(reference, { language, platform: data.platform, lastSeenAt: now, updatedAt: now });
      return { registered: true, registrationRevision: current.registrationRevision, bindingId: current.bindingId };
    }

    const previousRevision = validRegistrationRevision(current?.registrationRevision) ? current.registrationRevision : 0;
    if (previousRevision === Number.MAX_SAFE_INTEGER) {
      throw new HttpsError("failed-precondition", "Push enrollment revision exhausted.");
    }
    if (validCleanerFcmToken(current?.token) && typeof current.deviceId === "string"
      && deviceIdPattern.test(current.deviceId) && (current.token !== data.token || current.deviceId !== data.deviceId)) {
      const retainedClaimPaths = new Set([tokenClaimRef.path, installationClaimRef.path]);
      const previousClaims = await matchingClaims(transaction, database, current);
      for (const claim of previousClaims) {
        if (!retainedClaimPaths.has(claim.ref.path)) transaction.delete(claim.ref);
      }
    }
    const registrationRevision = previousRevision + 1;
    const owner = {
      organizationId: identity.organizationId, userId: identity.uid, cleanerId: identity.cleanerId,
      sessionId: identity.sessionId, deviceId: data.deviceId, registrationRevision, bindingId: nextBinding,
    };
    transaction.set(reference, {
      ...owner, role: "CLEANER", provider: "fcm", token: data.token, language, platform: data.platform,
      permission: "granted", active: true, tokenState: "active", invalidationReason: null, deactivationReason: null,
      ...(snapshot.exists ? {} : { createdAt: now }), lastSeenAt: now, updatedAt: now,
    }, { merge: true });
    // An account switch or token rotation must retire previous targeting for
    // this installation, even if the switch also changes the FCM token.
    const currentClaim = { ...owner, active: true, updatedAt: now };
    transaction.set(tokenClaimRef, currentClaim);
    transaction.set(installationClaimRef, currentClaim);
    return { registered: true, registrationRevision, bindingId: nextBinding };
  });
}

export async function deactivateCleanerDevice(database, identity, data) {
  validateRequest(identity, data, ["deviceId", "token", "registrationRevision", "reason"]);
  if ((data.token !== undefined && !validCleanerFcmToken(data.token)) || !validRegistrationRevision(data.registrationRevision)
    || !inactiveReasons.has(data.reason)) throw new HttpsError("invalid-argument", "Push deactivation is invalid.");
  const reference = cleanerDeviceReference(database, identity);
  return database.runTransaction(async (transaction) => {
    const [snapshot] = await Promise.all([
      transaction.get(reference), assertSessionForMutation(transaction, database, identity),
    ]);
    assertRegistrationOwner(snapshot, identity);
    const current = snapshot.data();
    if (current?.active !== true || current.deviceId !== data.deviceId
      || !validCleanerFcmToken(current.token) || (data.token !== undefined && current.token !== data.token)
      || current.registrationRevision !== data.registrationRevision) return { deactivated: false };
    const claims = await matchingClaims(transaction, database, current);
    const now = FieldValue.serverTimestamp();
    const permissionRevoked = data.reason === "PERMISSION_REVOKED";
    transaction.update(reference, {
      active: false, tokenState: permissionRevoked ? "permission-revoked" : "signed-out",
      ...(permissionRevoked ? { permission: "revoked" } : {}),
      deactivationReason: data.reason, deactivatedAt: now, updatedAt: now,
    });
    for (const claim of claims) transaction.delete(claim.ref);
    return { deactivated: true };
  });
}

export async function getCleanerDeviceStatus(database, identity, data, mode) {
  validateRequest(identity, data, ["deviceId"]);
  if (mode !== "pilot" && mode !== "enabled") return { state: "unavailable" };
  return database.runTransaction(async (transaction) => {
    const [snapshot, approved] = await Promise.all([
      transaction.get(cleanerDeviceReference(database, identity)),
      mode !== "pilot" || approvedCleanerPushPilotDevice(transaction, database, { ...identity, deviceId: data.deviceId }),
      assertSessionForMutation(transaction, database, identity),
    ]);
    if (!approved) return { state: "pilot-ineligible" };
    assertRegistrationOwner(snapshot, identity);
    const current = snapshot.data();
    if (current?.deviceId !== data.deviceId || !validRegistrationRevision(current.registrationRevision)) return { state: "missing" };
    const registrationRevision = current.registrationRevision;
    if (["invalidated", "signed-out", "permission-revoked"].includes(current.tokenState)) {
      return { state: current.tokenState, registrationRevision };
    }
    if (!eligibleCleanerRegistration(current, identity)) return { state: "missing" };
    const active = await hasCurrentCleanerClaims(transaction, database, current);
    return { state: active ? "active" : "superseded", registrationRevision };
  }, { readOnly: true });
}

/** Invalid-token results belong to the exact device and global token binding sent. */
export async function invalidateCleanerDevice(database, snapshot) {
  const sent = snapshot.data();
  const [tokenClaimRef, installationClaimRef] = cleanerClaimsFor(database, sent);
  return database.runTransaction(async (transaction) => {
    const [latest, tokenClaim, installationClaim] = await Promise.all([
      transaction.get(snapshot.ref), transaction.get(tokenClaimRef), transaction.get(installationClaimRef),
    ]);
    const current = latest.data();
    if (current?.active !== true || current.token !== sent.token || !cleanerClaimMatches(tokenClaim.data(), sent)
      || !cleanerClaimMatches({ ...sent, active: true }, current) || current.role !== "CLEANER" || current.provider !== "fcm") return false;
    const now = FieldValue.serverTimestamp();
    transaction.update(snapshot.ref, {
      active: false, tokenState: "invalidated", invalidationReason: "fcm-token-invalidated",
      deactivationReason: "FCM_INVALIDATED", invalidatedAt: now, updatedAt: now,
    });
    transaction.update(tokenClaimRef, { active: false, invalidatedAt: now, updatedAt: now });
    if (cleanerClaimMatches(installationClaim.data(), sent)) transaction.delete(installationClaimRef);
    return true;
  });
}

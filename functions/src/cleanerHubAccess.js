import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { rebuildCleanerAgenda } from "./cleanerAgenda.js";
import { checklistCapabilityState, issueChecklistCapabilityForManager } from "./checklistCapabilityService.js";
import { readHubChecklistGrants, recordHubChecklistGrant, revokeHubChecklistGrants } from "./cleanerHubChecklistAccess.js";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import { respondToAuthenticatedOffer } from "./publicOfferResponseService.js";

/**
 * Cleaner Hub identity boundary.
 *
 * A manager issues a short-lived, single-use access code for an existing Cleaner
 * record. Redeeming it links one Firebase Auth account (a server-chosen UID) to
 * that Cleaner through a CLEANER membership. The code is never stored, only its
 * hash; it is not a session and cannot be reused. Revocation deactivates the
 * membership. A replacement code resets sessions; an additional-device code
 * adds one session to an already active membership.
 */

export const cleanerAccessCodeCollection = "cleanerAccessCodes";
export const cleanerHubAccessCollection = "cleanerHubAccess";
export const cleanerAccessCodeLifetimeMilliseconds = 72 * 60 * 60 * 1000;
const maximumCleanerSessions = 8;
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I, L, O, 0, 1
const codeLength = 12;
const codePattern = new RegExp(`^[${codeAlphabet}]{${codeLength}}$`);

export function newCleanerAccessCode(randomSource = randomBytes) {
  let code = "";
  const limit = 256 - (256 % codeAlphabet.length);
  while (code.length < codeLength) {
    for (const byte of randomSource(24)) {
      if (byte < limit && code.length < codeLength) code += codeAlphabet[byte % codeAlphabet.length];
    }
  }
  return code;
}

export function normalizeCleanerAccessCode(input) {
  if (typeof input !== "string" || input.length > 64) return null;
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return codePattern.test(code) ? code : null;
}

export function formatCleanerAccessCode(code) {
  return code.match(/.{1,4}/g).join("-");
}

export function hashCleanerAccessCode(code) {
  return createHash("sha256").update(`cleaner-access:${code}`).digest("hex");
}

/** Deterministic, non-identifying Auth UID for one Cleaner record. */
export function cleanerAccountUid(organizationId, cleanerId) {
  return `cleaner-${createHash("sha256").update(`${organizationId}/${cleanerId}`).digest("hex").slice(0, 28)}`;
}

export function isActiveCleanerMembership(data) {
  return data?.role === "CLEANER" && data?.active === true
    && validCleanerId(data.cleanerId);
}

export function cleanerSessionIds(data) {
  if (data && Object.hasOwn(data, "sessionIds")) return Array.isArray(data.sessionIds) ? data.sessionIds : [];
  return typeof data?.sessionId === "string" && data.sessionId ? [data.sessionId] : [];
}

export function isActiveCleanerSession(data, claims) {
  return isActiveCleanerMembership(data)
    && validCleanerId(claims?.organizationId) && data.organizationId === claims.organizationId
    && data.cleanerId === claims.cleanerId
    && typeof claims.sessionId === "string" && claims.sessionId.length > 0
    && cleanerSessionIds(data).includes(claims.sessionId);
}

function validCleanerId(cleanerId) {
  return typeof cleanerId === "string" && cleanerId.length > 0 && cleanerId.length <= 256 && !cleanerId.includes("/");
}

function firstName(value) {
  if (typeof value !== "string") return null;
  return value.trim().split(/\s+/)[0]?.slice(0, 40) || null;
}

export function eligibleCleaner(data) {
  return data?.active === true && data.archivedAt == null;
}

function usableCode(data, now) {
  if (data?.status !== "ACTIVE" || typeof data.expiresAt?.toMillis !== "function") return false;
  const expiry = data.expiresAt.toMillis();
  const current = typeof now === "function" ? now() : now;
  return Number.isFinite(expiry) && expiry > current.getTime();
}

function assertActiveManager(snapshot) {
  if (!isActiveManagerMembership(snapshot.data())) {
    throw new HttpsError("permission-denied", "Active organization manager access is required.");
  }
}

export async function requireActiveCleaner(database, request, organizationId) {
  if (!request.auth?.uid || request.auth.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "A signed-in cleaner account is required.");
  }
  const claims = request.auth.token?.cleanerHub;
  const membership = await database.doc(`organizations/${organizationId}/members/${request.auth.uid}`).get();
  if (claims?.organizationId !== organizationId || !isActiveCleanerSession(membership.data(), claims)) {
    throw new HttpsError("permission-denied", "Active cleaner access is required.");
  }
  const { cleanerId, sessionId } = claims;
  const cleaner = await database.doc(`organizations/${organizationId}/cleaners/${cleanerId}`).get();
  if (!eligibleCleaner(cleaner.data())) {
    throw new HttpsError("permission-denied", "Active cleaner access is required.");
  }
  return { uid: request.auth.uid, cleanerId, sessionId };
}

export async function issueCleanerAccessCodeForManager(database, {
  organizationId, cleanerId, actorUid, additionalDevice = false, now = new Date(), randomSource = randomBytes,
}) {
  if (!validCleanerId(cleanerId)) throw new HttpsError("invalid-argument", "Cleaner is invalid.");
  const code = newCleanerAccessCode(randomSource);
  const codeHash = hashCleanerAccessCode(code);
  const expiresAt = Timestamp.fromMillis(now.getTime() + cleanerAccessCodeLifetimeMilliseconds);
  const cleanerRef = database.doc(`organizations/${organizationId}/cleaners/${cleanerId}`);
  const accessRef = database.doc(`organizations/${organizationId}/${cleanerHubAccessCollection}/${cleanerId}`);
  const actorRef = database.doc(`organizations/${organizationId}/members/${actorUid}`);
  const codes = database.collection(cleanerAccessCodeCollection);

  await database.runTransaction(async (transaction) => {
    // All changes for this cleaner serialize on their access record.
    await transaction.get(accessRef);
    const [manager, cleaner, previousCodes, member] = await Promise.all([
      transaction.get(actorRef),
      transaction.get(cleanerRef),
      transaction.get(codes.where("organizationId", "==", organizationId)
        .where("cleanerId", "==", cleanerId).where("status", "==", "ACTIVE")),
      additionalDevice
        ? transaction.get(database.doc(`organizations/${organizationId}/members/${cleanerAccountUid(organizationId, cleanerId)}`))
        : null,
    ]);
    assertActiveManager(manager);
    if (!eligibleCleaner(cleaner.data())) {
      throw new HttpsError("failed-precondition", "Only an active, unarchived cleaner can receive access.");
    }
    if (additionalDevice && !canAddCleanerSession(member.data(), organizationId, cleanerId)) {
      throw new HttpsError("failed-precondition", "This cleaner cannot add another device.");
    }
    for (const previous of previousCodes.docs) {
      transaction.update(previous.ref, { status: "REPLACED", replacedAt: FieldValue.serverTimestamp() });
    }
    transaction.create(codes.doc(codeHash), {
      organizationId,
      cleanerId,
      status: "ACTIVE",
      ...(additionalDevice ? { additionalDevice: true } : {}),
      createdByUid: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    });
    transaction.set(accessRef, {
      organizationId,
      cleanerId,
      pendingCodeExpiresAt: expiresAt,
      pendingCodeIssuedAt: FieldValue.serverTimestamp(),
      updatedByUid: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { code: formatCleanerAccessCode(code), expiresAt: expiresAt.toDate().toISOString() };
}

function canAddCleanerSession(data, organizationId, cleanerId) {
  return isActiveCleanerMembership(data) && data.organizationId === organizationId
    && data.cleanerId === cleanerId && cleanerSessionIds(data).length > 0
    && cleanerSessionIds(data).length < maximumCleanerSessions;
}

/**
 * Public entry: the code alone selects the Cleaner; no caller-supplied
 * organization or Cleaner ID is trusted. Failures share one generic answer.
 */
export async function redeemCleanerAccessCode(database, {
  input, auth, now = () => new Date(), rebuild = rebuildCleanerAgenda, logger = console,
}) {
  const code = normalizeCleanerAccessCode(input);
  const unavailable = () => new HttpsError("failed-precondition", "This code is not valid anymore.");
  if (!code) throw unavailable();
  const codeRef = database.collection(cleanerAccessCodeCollection).doc(hashCleanerAccessCode(code));
  const preview = await codeRef.get();
  const previewData = preview.data();
  if (!usableCode(previewData, now)) throw unavailable();
  const { organizationId, cleanerId } = previewData;
  if (!validCleanerId(cleanerId) || !validCleanerId(organizationId)) throw unavailable();
  const uid = cleanerAccountUid(organizationId, cleanerId);
  const memberRef = database.doc(`organizations/${organizationId}/members/${uid}`);
  const cleanerRef = database.doc(`organizations/${organizationId}/cleaners/${cleanerId}`);
  const accessRef = database.doc(`organizations/${organizationId}/${cleanerHubAccessCollection}/${cleanerId}`);
  if (!eligibleCleaner((await cleanerRef.get()).data())) throw unavailable();

  // Sign-in creates the Auth user if needed. Prepare signing and backfill
  // before consuming the code so a retry can recover either failure.
  const sessionId = randomBytes(16).toString("hex");
  const token = await auth.createCustomToken(uid, { cleanerHub: { organizationId, cleanerId, sessionId } });
  try {
    await rebuild(database, { organizationId, cleanerId });
  } catch (error) {
    logger.warn?.("Cleaner agenda rebuild before linking failed.", { code: error?.code || "unknown" });
    throw new HttpsError("unavailable", "The cleaner agenda is temporarily unavailable.");
  }

  await database.runTransaction(async (transaction) => {
    await transaction.get(accessRef);
    const [codeSnapshot, cleaner, member, grants] = await Promise.all([
      transaction.get(codeRef), transaction.get(cleanerRef), transaction.get(memberRef),
      readHubChecklistGrants(transaction, accessRef),
    ]);
    const current = codeSnapshot.data();
    if (!usableCode(current, now)
      || current.organizationId !== organizationId || current.cleanerId !== cleanerId) throw unavailable();
    if (!eligibleCleaner(cleaner.data())) throw unavailable();
    if (member.exists && (member.data().role !== "CLEANER" || member.data().cleanerId !== cleanerId)) throw unavailable();
    const cleanerData = cleaner.data();
    const additionalDevice = current.additionalDevice === true;
    if (additionalDevice && !canAddCleanerSession(member.data(), organizationId, cleanerId)) throw unavailable();
    const retainedSessionIds = additionalDevice ? cleanerSessionIds(member.data()) : [];
    // A published Hub tab checks the scalar against its own Auth claim.
    const previousAnchor = member.data()?.sessionId;
    const legacySessionId = retainedSessionIds.includes(previousAnchor) ? previousAnchor : sessionId;
    const sessionIds = [...retainedSessionIds, sessionId];
    if (!additionalDevice) revokeHubChecklistGrants(transaction, accessRef, grants);
    transaction.update(codeRef, { status: "USED", usedAt: FieldValue.serverTimestamp(), usedByUid: uid });
    // Only what the cleaner's own screen needs: her first name and language.
    transaction.set(memberRef, {
      organizationId,
      role: "CLEANER",
      active: true,
      cleanerId,
      sessionId: legacySessionId,
      sessionIds,
      displayName: firstName(cleanerData.name),
      preferredLanguage: ["pt", "en", "es"].includes(cleanerData.preferredLanguage) ? cleanerData.preferredLanguage : null,
      linkedVia: "ACCESS_CODE",
      linkedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(accessRef, {
      organizationId,
      cleanerId,
      active: true,
      linkedAt: FieldValue.serverTimestamp(),
      revokedAt: null,
      pendingCodeExpiresAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { token };
}

export async function revokeCleanerHubAccessForManager(database, { organizationId, cleanerId, actorUid }) {
  if (!validCleanerId(cleanerId)) throw new HttpsError("invalid-argument", "Cleaner is invalid.");
  const uid = cleanerAccountUid(organizationId, cleanerId);
  const memberRef = database.doc(`organizations/${organizationId}/members/${uid}`);
  const accessRef = database.doc(`organizations/${organizationId}/${cleanerHubAccessCollection}/${cleanerId}`);
  const actorRef = database.doc(`organizations/${organizationId}/members/${actorUid}`);
  const codes = database.collection(cleanerAccessCodeCollection);
  await database.runTransaction(async (transaction) => {
    await transaction.get(accessRef);
    const [manager, member, activeCodes, grants] = await Promise.all([
      transaction.get(actorRef),
      transaction.get(memberRef),
      transaction.get(codes.where("organizationId", "==", organizationId)
        .where("cleanerId", "==", cleanerId).where("status", "==", "ACTIVE")),
      readHubChecklistGrants(transaction, accessRef),
    ]);
    assertActiveManager(manager);
    revokeHubChecklistGrants(transaction, accessRef, grants);
    if (member.exists && member.data().role === "CLEANER") {
      transaction.update(memberRef, { active: false, sessionIds: [], revokedAt: FieldValue.serverTimestamp(), revokedByUid: actorUid });
    }
    for (const code of activeCodes.docs) {
      transaction.update(code.ref, { status: "REVOKED", revokedAt: FieldValue.serverTimestamp() });
    }
    transaction.set(accessRef, {
      organizationId,
      cleanerId,
      active: false,
      pendingCodeExpiresAt: null,
      revokedAt: FieldValue.serverTimestamp(),
      updatedByUid: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { active: false };
}

function rosterIncludes(job, cleanerId) {
  if (!job || job.archivedAt) return false;
  const ids = Array.isArray(job.assignedCleanerIds) ? job.assignedCleanerIds : [job.assignedCleanerId];
  return ids.includes(cleanerId);
}

export async function assertSessionForMutation(transaction, database, { organizationId, cleanerId, uid, sessionId }) {
  const [member, cleaner] = await Promise.all([
    transaction.get(database.doc(`organizations/${organizationId}/members/${uid}`)),
    transaction.get(database.doc(`organizations/${organizationId}/cleaners/${cleanerId}`)),
  ]);
  if (!isActiveCleanerSession(member.data(), { organizationId, cleanerId, sessionId }) || !eligibleCleaner(cleaner.data())) {
    throw new HttpsError("permission-denied", "Active cleaner access is required.");
  }
}

/**
 * Opens the existing public checklist flow for the signed-in, assigned cleaner.
 * Reuses the manager-equivalent capability issuance and its eligibility rules;
 * it never takes over a link that a teammate currently holds.
 */
export async function openChecklistForCleaner(database, {
  organizationId, cleanerId, uid, sessionId, jobId, runId, newToken, hashToken, now = new Date(),
}) {
  if (!validCleanerId(jobId)) throw new HttpsError("invalid-argument", "Job is invalid.");
  const jobRef = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const runRef = jobRef.collection("checklistRuns").doc(runId);
  const capabilityRef = runRef.collection("checklistCapabilities").doc("active");
  const [job, run, capability] = await Promise.all([jobRef.get(), runRef.get(), capabilityRef.get()]);
  const jobData = job.exists ? job.data() : null;
  if (!rosterIncludes(jobData, cleanerId)) return { state: "unavailable" };
  if (!["ASSIGNED", "IN_PROGRESS"].includes(jobData.operationalStatus)) {
    return { state: jobData.operationalStatus === "COMPLETED" ? "done" : "unavailable" };
  }
  const runData = run.exists ? run.data() : null;
  if (!runData) return { state: "not-ready" };
  if (runData.status === "READY_FOR_REVIEW") return { state: "submitted" };
  if (runData.status !== "DRAFT") return { state: "done" };
  const capabilityData = capability.exists ? capability.data() : null;
  if (capabilityData && capabilityData.cleanerId !== cleanerId
    && checklistCapabilityState(capabilityData, jobData, runData, now) === "ACTIVE") {
    return { state: "teammate" };
  }
  const token = newToken();
  const tokenHash = hashToken(token);
  const accessRef = database.doc(`organizations/${organizationId}/${cleanerHubAccessCollection}/${cleanerId}`);
  try {
    const result = await issueChecklistCapabilityForManager(database, {
      organizationId, jobId, runId, cleanerId, actorUid: uid, token, tokenHash, now,
      beforeIssue: async ({ transaction, job, run, capability, expiresAt }) => {
        await assertSessionForMutation(transaction, database, { organizationId, cleanerId, uid, sessionId });
        if (capability && capability.cleanerId !== cleanerId
          && checklistCapabilityState(capability, job, run, now) === "ACTIVE") {
          throw new HttpsError("failed-precondition", "A teammate already has the checklist link.", { reason: "hub-teammate" });
        }
        await recordHubChecklistGrant(transaction, accessRef, { jobId, runId, tokenHash, expiresAtMs: expiresAt.toMillis() }, now);
      },
    });
    return { state: "ready", token: result.token };
  } catch (error) {
    if (error instanceof HttpsError && error.code === "failed-precondition") {
      return { state: error.details?.reason === "hub-teammate" ? "teammate" : "unavailable" };
    }
    throw error;
  }
}

/** Answers only the Offer addressed to this authenticated, active Cleaner. */
export async function respondToOfferForCleaner(database, { organizationId, cleanerId, uid, sessionId, jobId, status }) {
  if (!validCleanerId(jobId) || !["INTERESTED", "DECLINED", "ACCEPTED"].includes(status)) {
    throw new HttpsError("invalid-argument", "Offer response is invalid.");
  }
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const offerReference = jobReference.collection("offers").doc(cleanerId);
  return respondToAuthenticatedOffer(database, {
    organizationId, jobReference, offerReference, status,
  }, { cleanerId, uid }, (transaction) => (
    assertSessionForMutation(transaction, database, { organizationId, cleanerId, uid, sessionId })
  ));
}

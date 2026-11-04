import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { rebuildCleanerAgenda } from "./cleanerAgenda.js";
import { checklistCapabilityState, issueChecklistCapabilityForManager } from "./checklistCapabilityService.js";
import { respondToPublicOffer } from "./publicOfferResponseService.js";

/**
 * Cleaner Hub identity boundary.
 *
 * A manager issues a short-lived, single-use access code for an existing Cleaner
 * record. Redeeming it links one Firebase Auth account (a server-chosen UID) to
 * that Cleaner through a CLEANER membership. The code is never stored, only its
 * hash; it is not a session and cannot be reused. Revocation deactivates the
 * membership (rules deny immediately) and revokes refresh tokens.
 */

export const cleanerAccessCodeCollection = "cleanerAccessCodes";
export const cleanerHubAccessCollection = "cleanerHubAccess";
export const cleanerAccessCodeLifetimeMilliseconds = 72 * 60 * 60 * 1000;
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
    && typeof data.cleanerId === "string" && data.cleanerId.length > 0;
}

function validCleanerId(cleanerId) {
  return typeof cleanerId === "string" && cleanerId.length > 0 && cleanerId.length <= 256 && !cleanerId.includes("/");
}

function firstName(value) {
  if (typeof value !== "string") return null;
  return value.trim().split(/\s+/)[0]?.slice(0, 40) || null;
}

function eligibleCleaner(data) {
  return Boolean(data) && data.active === true && !data.archivedAt;
}

export async function requireActiveCleaner(database, request, organizationId) {
  if (!request.auth?.uid || request.auth.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "A signed-in cleaner account is required.");
  }
  const membership = await database.doc(`organizations/${organizationId}/members/${request.auth.uid}`).get();
  if (!isActiveCleanerMembership(membership.data())) {
    throw new HttpsError("permission-denied", "Active cleaner access is required.");
  }
  return { uid: request.auth.uid, cleanerId: membership.data().cleanerId };
}

export async function issueCleanerAccessCodeForManager(database, {
  organizationId, cleanerId, actorUid, now = new Date(), randomSource = randomBytes,
}) {
  if (!validCleanerId(cleanerId)) throw new HttpsError("invalid-argument", "Cleaner is invalid.");
  const code = newCleanerAccessCode(randomSource);
  const codeHash = hashCleanerAccessCode(code);
  const expiresAt = Timestamp.fromMillis(now.getTime() + cleanerAccessCodeLifetimeMilliseconds);
  const cleanerRef = database.doc(`organizations/${organizationId}/cleaners/${cleanerId}`);
  const accessRef = database.doc(`organizations/${organizationId}/${cleanerHubAccessCollection}/${cleanerId}`);
  const codes = database.collection(cleanerAccessCodeCollection);

  await database.runTransaction(async (transaction) => {
    const [cleaner, previousCodes] = await Promise.all([
      transaction.get(cleanerRef),
      transaction.get(codes.where("organizationId", "==", organizationId)
        .where("cleanerId", "==", cleanerId).where("status", "==", "ACTIVE")),
    ]);
    if (!eligibleCleaner(cleaner.exists ? cleaner.data() : null)) {
      throw new HttpsError("failed-precondition", "Only an active, unarchived cleaner can receive access.");
    }
    for (const previous of previousCodes.docs) {
      transaction.update(previous.ref, { status: "REPLACED", replacedAt: FieldValue.serverTimestamp() });
    }
    transaction.set(codes.doc(codeHash), {
      organizationId,
      cleanerId,
      status: "ACTIVE",
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

/**
 * Public entry: the code alone selects the Cleaner; no caller-supplied
 * organization or Cleaner ID is trusted. Failures share one generic answer.
 */
export async function redeemCleanerAccessCode(database, {
  input, auth, now = new Date(), rebuild = rebuildCleanerAgenda, logger = console,
}) {
  const code = normalizeCleanerAccessCode(input);
  const unavailable = () => new HttpsError("failed-precondition", "This code is not valid anymore.");
  if (!code) throw unavailable();
  const codeRef = database.collection(cleanerAccessCodeCollection).doc(hashCleanerAccessCode(code));
  const preview = await codeRef.get();
  const previewData = preview.exists ? preview.data() : null;
  if (!previewData || previewData.status !== "ACTIVE" || previewData.expiresAt?.toMillis?.() <= now.getTime()) throw unavailable();
  const { organizationId, cleanerId } = previewData;
  if (!validCleanerId(cleanerId) || typeof organizationId !== "string") throw unavailable();
  const uid = cleanerAccountUid(organizationId, cleanerId);

  // Prepare identity before consuming the code, so a failure leaves it usable.
  try {
    await auth.getUser(uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    await auth.createUser({ uid });
  }
  const token = await auth.createCustomToken(uid, { cleanerHub: { organizationId, cleanerId } });

  const memberRef = database.doc(`organizations/${organizationId}/members/${uid}`);
  const cleanerRef = database.doc(`organizations/${organizationId}/cleaners/${cleanerId}`);
  const accessRef = database.doc(`organizations/${organizationId}/${cleanerHubAccessCollection}/${cleanerId}`);
  await database.runTransaction(async (transaction) => {
    const [codeSnapshot, cleaner, member] = await Promise.all([
      transaction.get(codeRef), transaction.get(cleanerRef), transaction.get(memberRef),
    ]);
    const current = codeSnapshot.exists ? codeSnapshot.data() : null;
    if (!current || current.status !== "ACTIVE" || current.expiresAt?.toMillis?.() <= now.getTime()
      || current.organizationId !== organizationId || current.cleanerId !== cleanerId) throw unavailable();
    if (!eligibleCleaner(cleaner.exists ? cleaner.data() : null)) throw unavailable();
    if (member.exists && member.data().role && member.data().role !== "CLEANER") throw unavailable();
    const cleanerData = cleaner.data();
    transaction.update(codeRef, { status: "USED", usedAt: FieldValue.serverTimestamp(), usedByUid: uid });
    // Only what the cleaner's own screen needs: her first name and language.
    transaction.set(memberRef, {
      organizationId,
      role: "CLEANER",
      active: true,
      cleanerId,
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

  try {
    await rebuild(database, { organizationId, cleanerId });
  } catch (error) {
    // The live triggers still keep the agenda current; log without identifiers.
    logger.warn?.("Cleaner agenda rebuild after linking failed.", { code: error?.code || "unknown" });
  }
  return { token };
}

export async function revokeCleanerHubAccessForManager(database, { organizationId, cleanerId, actorUid, auth }) {
  if (!validCleanerId(cleanerId)) throw new HttpsError("invalid-argument", "Cleaner is invalid.");
  const uid = cleanerAccountUid(organizationId, cleanerId);
  const memberRef = database.doc(`organizations/${organizationId}/members/${uid}`);
  const accessRef = database.doc(`organizations/${organizationId}/${cleanerHubAccessCollection}/${cleanerId}`);
  const codes = database.collection(cleanerAccessCodeCollection);
  await database.runTransaction(async (transaction) => {
    const [member, activeCodes] = await Promise.all([
      transaction.get(memberRef),
      transaction.get(codes.where("organizationId", "==", organizationId)
        .where("cleanerId", "==", cleanerId).where("status", "==", "ACTIVE")),
    ]);
    if (member.exists && member.data().role === "CLEANER") {
      transaction.update(memberRef, { active: false, revokedAt: FieldValue.serverTimestamp(), revokedByUid: actorUid });
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
  try {
    await auth.revokeRefreshTokens(uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
  return { active: false };
}

function rosterIncludes(job, cleanerId) {
  if (!job || job.archivedAt) return false;
  const ids = Array.isArray(job.assignedCleanerIds) ? job.assignedCleanerIds : [job.assignedCleanerId];
  return ids.includes(cleanerId);
}

/**
 * Opens the existing public checklist flow for the signed-in, assigned cleaner.
 * Reuses the manager-equivalent capability issuance and its eligibility rules;
 * it never takes over a link that a teammate currently holds.
 */
export async function openChecklistForCleaner(database, {
  organizationId, cleanerId, uid, jobId, runId, newToken, hashToken, now = new Date(),
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
  try {
    const result = await issueChecklistCapabilityForManager(database, {
      organizationId, jobId, runId, cleanerId, actorUid: uid, token, tokenHash: hashToken(token), now,
    });
    return { state: "ready", token: result.token };
  } catch (error) {
    if (error instanceof HttpsError && error.code === "failed-precondition") return { state: "unavailable" };
    throw error;
  }
}

/** Answers the cleaner's own Offer through the existing public Offer service. */
export async function respondToOfferForCleaner(database, { organizationId, cleanerId, jobId, status }) {
  if (!validCleanerId(jobId) || !["INTERESTED", "DECLINED"].includes(status)) {
    throw new HttpsError("invalid-argument", "Offer response is invalid.");
  }
  const jobReference = database.doc(`organizations/${organizationId}/jobs/${jobId}`);
  const offerReference = jobReference.collection("offers").doc(cleanerId);
  const offer = await offerReference.get();
  const data = offer.exists ? offer.data() : null;
  if (!data || data.cleanerId !== cleanerId || typeof data.publicOfferTokenHash !== "string") {
    return { state: "unavailable" };
  }
  return respondToPublicOffer(database, {
    organizationId, jobReference, offerReference, tokenHash: data.publicOfferTokenHash, status,
  });
}

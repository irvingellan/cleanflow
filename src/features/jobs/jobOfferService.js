import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../services/firebase/client.js";
import { automaticOfferDisplayStatus, isAutomaticOfferJob } from "./automaticOffers.js";
import { managerDecisionOf, offerManagerDecisions, rosterCleanerIds } from "./offerSlots.js";
import {
  canManageAssignmentAwareOffers,
  isAssignmentAwareJob,
  normalizeJobRecord,
} from "./jobCompatibility.js";

const organizationId = "cleanflow-demo";
const publicOfferTokenLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1000;

function createPublicOfferToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hashPublicOfferToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function offersCollection(jobId) {
  return collection(
    db,
    "organizations",
    organizationId,
    "jobs",
    jobId,
    "offers",
  );
}

function offerDocument(jobId, cleanerId) {
  return doc(
    db,
    "organizations",
    organizationId,
    "jobs",
    jobId,
    "offers",
    cleanerId,
  );
}

function jobDocument(jobId) {
  return doc(db, "organizations", organizationId, "jobs", jobId);
}

function jobFromSnapshot(snapshot) {
  return normalizeJobRecord(snapshot.data(), snapshot.id);
}

function canCreateOffersForJob(job) {
  return !isAssignmentAwareJob(job) || canManageAssignmentAwareOffers(job);
}

function canCreatePublicOfferLinkForJob(job) {
  return isAssignmentAwareJob(job)
    ? ["OFFERED", "ASSIGNED"].includes(job.operationalStatus)
    : job.operationalStatus === "OFFERED";
}

export async function getJobOffers(jobId) {
  const snapshot = await getDocs(offersCollection(jobId));

  return snapshot.docs.map((offerDocumentSnapshot) => ({
    ...offerDocumentSnapshot.data(),
    id: offerDocumentSnapshot.id,
  }));
}

export function subscribeToJobOffer(jobId, offerId, onChange) {
  return onSnapshot(offerDocument(jobId, offerId), (snapshot) => {
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
      onChange(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null);
    }
  }, () => { /* Job Detail can still reload its offers explicitly. */ });
}

export async function respondToJobOffer({ jobId, cleanerId, status }) {
  if (status !== "INTERESTED" && status !== "DECLINED") {
    throw new Error("Invalid job offer response status.");
  }

  await updateDoc(offerDocument(jobId, cleanerId), {
    status,
    respondedAt: serverTimestamp(),
  });
}

export async function createJobOffers({ jobId, cleaners, automatic = false }) {
  const reference = jobDocument(jobId);

  if (automatic) {
    const createAutomaticOffers = httpsCallable(functions, "createAutomaticJobOffers");
    await createAutomaticOffers({ jobId, cleanerIds: cleaners.map((cleaner) => cleaner.id) });
    return jobFromSnapshot(await getDoc(reference));
  }

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists()) {
      const error = new Error("Job not found.");
      error.code = "job-not-found";
      throw error;
    }

    const job = jobFromSnapshot(snapshot);
    if (!canCreateOffersForJob(job) || isAutomaticOfferJob(job)) {
      const error = new Error("Offers cannot be created after work starts.");
      error.code = "offer-management-locked";
      throw error;
    }

    for (const cleaner of cleaners) {
      transaction.set(
        offerDocument(jobId, cleaner.id),
        {
          jobId,
          cleanerId: cleaner.id,
          cleanerName: cleaner.name,
          status: "PENDING",
          createdAt: serverTimestamp(),
        },
      );
    }

    if (job.operationalStatus === "UNASSIGNED") {
      transaction.update(reference, {
        operationalStatus: "OFFERED",
        offeredAt: serverTimestamp(),
      });
    }
  });

  const snapshot = await getDoc(reference);
  return jobFromSnapshot(snapshot);
}

export async function createPublicOfferLink({ jobId, cleanerId, offeredCompensation }) {
  if (
    offeredCompensation !== null &&
    (typeof offeredCompensation !== "number" ||
      !Number.isFinite(offeredCompensation) ||
      offeredCompensation < 0)
  ) {
    const error = new Error("Offered compensation must be explicit and non-negative.");
    error.code = "invalid-offered-compensation";
    throw error;
  }

  const token = createPublicOfferToken();
  const tokenHash = await hashPublicOfferToken(token);
  const legacyExpiresAtMs = Date.now() + publicOfferTokenLifetimeMilliseconds;
  const jobReference = jobDocument(jobId);
  const offerReference = offerDocument(jobId, cleanerId);

  const result = await runTransaction(db, async (transaction) => {
    const [jobSnapshot, offerSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(offerReference),
    ]);

    if (!jobSnapshot.exists() || !offerSnapshot.exists()) {
      const error = new Error("Offer not found.");
      error.code = "offer-not-found";
      throw error;
    }

    const job = jobFromSnapshot(jobSnapshot);
    const offer = offerSnapshot.data();
    const automatic = isAutomaticOfferJob(job);
    const linkAvailable = automatic
      ? automaticOfferDisplayStatus(job, offer) === "AWAITING_ACCEPTANCE"
      : canCreatePublicOfferLinkForJob(job) && offer.status === "PENDING";
    if (!linkAvailable) {
      const error = new Error("Offer is not available for a public link.");
      error.code = "offer-unavailable";
      throw error;
    }

    const expiresAtMs = automatic ? offer.publicOfferExpiresAt.toMillis() : legacyExpiresAtMs;
    transaction.update(offerReference, {
      publicOfferTokenHash: tokenHash,
      ...(!automatic ? {
        publicOfferExpiresAt: Timestamp.fromMillis(expiresAtMs),
        offeredCompensation,
      } : {}),
    });
    return { expiresAtMs, offeredCompensation: automatic ? offer.offeredCompensation ?? null : offeredCompensation };
  });

  return {
    url: new URL(`/offer/${token}`, window.location.origin).toString(),
    ...result,
    tokenHash,
  };
}

export async function revokeAutomaticOffer({ jobId, offerId }) {
  const jobReference = jobDocument(jobId);
  const offerReference = offerDocument(jobId, offerId);

  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, offerSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(offerReference),
    ]);
    if (!jobSnapshot.exists() || !offerSnapshot.exists()
      || automaticOfferDisplayStatus(jobFromSnapshot(jobSnapshot), offerSnapshot.data()) !== "AWAITING_ACCEPTANCE") {
      throw new Error("This offer is no longer available.");
    }
    transaction.update(offerReference, { status: "REVOKED", revokedAt: serverTimestamp() });
  });
}

function offerDecisionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * FB09: the manager closes one manual invitation. WITHDRAWN applies to an
 * unanswered invite, NOT_SELECTED to an interested cleaner who is not chosen.
 * The cleaner's own answer is kept; the decision is stored beside it.
 */
export async function closeOfferByManager({ jobId, offerId, decision, actorUid }) {
  const expectedStatus = { [offerManagerDecisions.withdrawn]: "PENDING", [offerManagerDecisions.notSelected]: "INTERESTED" }[decision];
  if (!expectedStatus || typeof actorUid !== "string" || !actorUid) {
    throw offerDecisionError("invalid-offer-decision", "This offer decision is not valid.");
  }
  const jobReference = jobDocument(jobId);
  const offerReference = offerDocument(jobId, offerId);
  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, offerSnapshot] = await Promise.all([transaction.get(jobReference), transaction.get(offerReference)]);
    if (!jobSnapshot.exists() || !offerSnapshot.exists()) throw offerDecisionError("offer-not-found", "Offer not found.");
    const job = jobFromSnapshot(jobSnapshot);
    const offer = offerSnapshot.data();
    if (isAutomaticOfferJob(job) || managerDecisionOf(offer) || offer.status !== expectedStatus
      || rosterCleanerIds(job).includes(offer.cleanerId)) {
      throw offerDecisionError("offer-changed", "This offer changed. Refresh and try again.");
    }
    transaction.update(offerReference, {
      managerDecision: decision, managerDecisionAt: serverTimestamp(), managerDecisionByUid: actorUid,
    });
  });
}

/** Reopens a closed manual invitation; the earlier decision stays on the record. */
export async function reopenOfferByManager({ jobId, offerId, actorUid }) {
  if (typeof actorUid !== "string" || !actorUid) throw offerDecisionError("invalid-offer-decision", "This offer decision is not valid.");
  const jobReference = jobDocument(jobId);
  const offerReference = offerDocument(jobId, offerId);
  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, offerSnapshot] = await Promise.all([transaction.get(jobReference), transaction.get(offerReference)]);
    if (!jobSnapshot.exists() || !offerSnapshot.exists()) throw offerDecisionError("offer-not-found", "Offer not found.");
    const job = jobFromSnapshot(jobSnapshot);
    const offer = offerSnapshot.data();
    if (isAutomaticOfferJob(job) || !managerDecisionOf(offer) || job.archivedAt
      || !["OFFERED", "ASSIGNED"].includes(job.operationalStatus)) {
      throw offerDecisionError("offer-changed", "This offer changed. Refresh and try again.");
    }
    transaction.update(offerReference, {
      managerDecision: null,
      previousManagerDecision: offer.managerDecision,
      previousManagerDecisionAt: offer.managerDecisionAt ?? null,
      previousManagerDecisionByUid: offer.managerDecisionByUid ?? null,
      managerReopenedAt: serverTimestamp(), managerReopenedByUid: actorUid,
    });
  });
}

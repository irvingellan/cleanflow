import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

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
  return {
    ...snapshot.data(),
    id: snapshot.id,
  };
}

export async function getJobOffers(jobId) {
  const snapshot = await getDocs(offersCollection(jobId));

  return snapshot.docs.map((offerDocumentSnapshot) => ({
    ...offerDocumentSnapshot.data(),
    id: offerDocumentSnapshot.id,
  }));
}

export async function getInterestedJobOffers(jobId) {
  const snapshot = await getDocs(
    query(offersCollection(jobId), where("status", "==", "INTERESTED"), limit(5)),
  );

  return snapshot.docs.map((offerDocumentSnapshot) => ({
    ...offerDocumentSnapshot.data(),
    id: offerDocumentSnapshot.id,
  }));
}

export async function getPendingJobOffers(jobId) {
  const snapshot = await getDocs(
    query(offersCollection(jobId), where("status", "==", "PENDING"), limit(1)),
  );

  return snapshot.docs.map((offerDocumentSnapshot) => ({
    ...offerDocumentSnapshot.data(),
    id: offerDocumentSnapshot.id,
  }));
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

export async function createJobOffers({ jobId, cleaners }) {
  const batch = writeBatch(db);

  for (const cleaner of cleaners) {
    batch.set(
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

  await batch.commit();

  const reference = jobDocument(jobId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists()) {
      const error = new Error("Job not found.");
      error.code = "job-not-found";
      throw error;
    }

    if (snapshot.data().operationalStatus === "UNASSIGNED") {
      transaction.update(reference, {
        operationalStatus: "OFFERED",
        offeredAt: serverTimestamp(),
      });
    }
  });

  const snapshot = await getDoc(reference);
  return jobFromSnapshot(snapshot);
}

export async function createPublicOfferLink({ jobId, cleanerId }) {
  const token = createPublicOfferToken();
  const tokenHash = await hashPublicOfferToken(token);
  const expiresAt = Timestamp.fromMillis(Date.now() + publicOfferTokenLifetimeMilliseconds);
  const jobReference = jobDocument(jobId);
  const offerReference = offerDocument(jobId, cleanerId);

  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, offerSnapshot] = await Promise.all([
      transaction.get(jobReference),
      transaction.get(offerReference),
    ]);

    if (!jobSnapshot.exists() || !offerSnapshot.exists()) {
      const error = new Error("Offer not found.");
      error.code = "offer-not-found";
      throw error;
    }

    if (
      jobSnapshot.data().operationalStatus !== "OFFERED" ||
      offerSnapshot.data().status !== "PENDING"
    ) {
      const error = new Error("Offer is not available for a public link.");
      error.code = "offer-unavailable";
      throw error;
    }

    transaction.update(offerReference, {
      publicOfferTokenHash: tokenHash,
      publicOfferExpiresAt: expiresAt,
    });
  });

  return {
    url: new URL(`/offer/${token}`, window.location.origin).toString(),
  };
}

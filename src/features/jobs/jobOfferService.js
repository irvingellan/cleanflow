import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

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

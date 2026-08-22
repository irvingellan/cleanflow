import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

function jobsCollection() {
  return collection(db, "organizations", organizationId, "jobs");
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

export async function getJobs() {
  const snapshot = await getDocs(jobsCollection());

  return snapshot.docs.map(jobFromSnapshot);
}

export async function assignCleanerToJob(jobId, cleaner) {
  const reference = jobDocument(jobId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists()) {
      const error = new Error("Job not found.");
      error.code = "job-not-found";
      throw error;
    }

    const job = snapshot.data();

    if (job.assignedCleanerId || job.operationalStatus === "ASSIGNED") {
      const error = new Error("This job is already assigned.");
      error.code = "job-already-assigned";
      error.job = jobFromSnapshot(snapshot);
      throw error;
    }

    transaction.update(reference, {
      assignedCleanerId: cleaner.id,
      assignedCleanerName: cleaner.name,
      assignedAt: serverTimestamp(),
      operationalStatus: "ASSIGNED",
    });
  });

  const snapshot = await getDoc(reference);
  return jobFromSnapshot(snapshot);
}

export async function startAssignedJob(jobId) {
  const reference = jobDocument(jobId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists()) {
      const error = new Error("Job not found.");
      error.code = "job-not-found";
      throw error;
    }

    const job = snapshot.data();

    if (job.operationalStatus !== "ASSIGNED") {
      const error = new Error("This job cannot be started from its current status.");
      error.code = "invalid-job-transition";
      error.job = jobFromSnapshot(snapshot);
      throw error;
    }

    transaction.update(reference, {
      operationalStatus: "IN_PROGRESS",
      startedAt: serverTimestamp(),
    });
  });

  const snapshot = await getDoc(reference);
  return jobFromSnapshot(snapshot);
}

export async function completeInProgressJob(jobId) {
  const reference = jobDocument(jobId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists()) {
      const error = new Error("Job not found.");
      error.code = "job-not-found";
      throw error;
    }

    const job = snapshot.data();

    if (job.operationalStatus !== "IN_PROGRESS") {
      const error = new Error("This job cannot be completed from its current status.");
      error.code = "invalid-job-transition";
      error.job = jobFromSnapshot(snapshot);
      throw error;
    }

    transaction.update(reference, {
      operationalStatus: "COMPLETED",
      completedAt: serverTimestamp(),
    });
  });

  const snapshot = await getDoc(reference);
  return jobFromSnapshot(snapshot);
}

export async function createJob({
  propertyId,
  propertyName,
  clientName,
  scheduledDate,
  clientPrice,
  cleanerPayout,
  notes,
}) {
  const jobDocument = await addDoc(
    jobsCollection(),
    {
      organizationId,
      propertyId,
      propertyName,
      clientName,
      scheduledDate,
      clientPrice,
      cleanerPayout,
      notes,
      operationalStatus: "UNASSIGNED",
      createdAt: serverTimestamp(),
    },
  );

  return jobDocument.id;
}

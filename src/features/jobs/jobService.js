import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

function jobsCollection() {
  return collection(db, "organizations", organizationId, "jobs");
}

export async function getJobs() {
  const snapshot = await getDocs(jobsCollection());

  return snapshot.docs.map((jobDocument) => ({
    ...jobDocument.data(),
    id: jobDocument.id,
  }));
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

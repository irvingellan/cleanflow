import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

function cleanersCollection() {
  return collection(db, "organizations", organizationId, "cleaners");
}

function cleanerDocument(cleanerId) {
  return doc(db, "organizations", organizationId, "cleaners", cleanerId);
}

export async function getCleanerById(cleanerId) {
  const snapshot = await getDoc(cleanerDocument(cleanerId));

  return snapshot.exists()
    ? { ...snapshot.data(), id: snapshot.id }
    : null;
}

export async function getCleaners() {
  const cleanersQuery = query(
    cleanersCollection(),
    where("active", "==", true),
  );
  const snapshot = await getDocs(cleanersQuery);

  return snapshot.docs.map((cleanerDocument) => ({
    ...cleanerDocument.data(),
    id: cleanerDocument.id,
  }));
}

export async function getAllCleaners() {
  const snapshot = await getDocs(cleanersCollection());

  return snapshot.docs.map((cleanerDocumentSnapshot) => ({
    ...cleanerDocumentSnapshot.data(),
    id: cleanerDocumentSnapshot.id,
  }));
}

export async function createCleaner({ name, phone, preferredLanguage, active }) {
  const reference = await addDoc(cleanersCollection(), {
    name,
    phone,
    preferredLanguage,
    active,
    organizationId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: reference.id, name, phone, preferredLanguage, active };
}

export async function updateCleaner(cleanerId, { name, phone, preferredLanguage, active }) {
  await updateDoc(cleanerDocument(cleanerId), {
    name,
    phone,
    preferredLanguage,
    active,
    updatedAt: serverTimestamp(),
  });

  return { id: cleanerId, name, phone, preferredLanguage, active };
}

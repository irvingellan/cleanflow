import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

function clientsCollection() {
  return collection(db, "organizations", organizationId, "clients");
}

export async function getClients() {
  const snapshot = await getDocs(clientsCollection());

  return snapshot.docs.map((clientDocument) => ({
    ...clientDocument.data(),
    id: clientDocument.id,
  }));
}

export async function getActiveClients() {
  const snapshot = await getDocs(
    query(clientsCollection(), where("active", "==", true)),
  );

  return snapshot.docs.map((clientDocument) => ({
    ...clientDocument.data(),
    id: clientDocument.id,
  }));
}

export async function createClient({ name, active }) {
  const reference = await addDoc(clientsCollection(), {
    organizationId,
    name,
    active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: reference.id, name, active, organizationId };
}

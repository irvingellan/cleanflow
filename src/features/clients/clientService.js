import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";
import {
  buildDataProvenanceUpdate,
  withNormalizedDataProvenance,
} from "../../lib/dataProvenance.js";

const organizationId = "cleanflow-demo";

function clientsCollection() {
  return collection(db, "organizations", organizationId, "clients");
}

function clientDocument(clientId) {
  return doc(db, "organizations", organizationId, "clients", clientId);
}

export async function getClients() {
  const snapshot = await getDocs(clientsCollection());

  return snapshot.docs.map((clientDocument) => withNormalizedDataProvenance({
    ...clientDocument.data(),
    id: clientDocument.id,
  }));
}

export async function getActiveClients() {
  const snapshot = await getDocs(
    query(clientsCollection(), where("active", "==", true)),
  );

  return snapshot.docs.map((clientDocument) => withNormalizedDataProvenance({
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
    dataProvenance: "REAL",
  });

  return { id: reference.id, name, active, organizationId, dataProvenance: "REAL" };
}

export async function updateClientDataProvenance(clientId, dataProvenance, actorUid) {
  await updateDoc(
    clientDocument(clientId),
    buildDataProvenanceUpdate(dataProvenance, actorUid, serverTimestamp()),
  );

  return { id: clientId, dataProvenance };
}

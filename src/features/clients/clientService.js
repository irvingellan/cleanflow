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
import { buildArchiveUpdate, buildRestoreUpdate, filterArchivedRecords } from "../../lib/archiveState.js";

const organizationId = "cleanflow-demo";

function clientsCollection() {
  return collection(db, "organizations", organizationId, "clients");
}

function clientDocument(clientId) {
  return doc(db, "organizations", organizationId, "clients", clientId);
}

export async function getClients({ includeArchived = false } = {}) {
  const snapshot = await getDocs(clientsCollection());

  return filterArchivedRecords(snapshot.docs.map((clientDocument) => withNormalizedDataProvenance({
    ...clientDocument.data(),
    id: clientDocument.id,
  })), includeArchived);
}

export async function getActiveClients() {
  const snapshot = await getDocs(
    query(clientsCollection(), where("active", "==", true)),
  );

  return filterArchivedRecords(snapshot.docs.map((clientDocument) => withNormalizedDataProvenance({
    ...clientDocument.data(),
    id: clientDocument.id,
  })));
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

export async function archiveClient(clientId, actorUid) {
  await updateDoc(clientDocument(clientId), buildArchiveUpdate(actorUid, serverTimestamp()));
  return { id: clientId, archivedAt: true };
}

export async function restoreClient(clientId, actorUid) {
  await updateDoc(clientDocument(clientId), buildRestoreUpdate(actorUid, serverTimestamp()));
  return { id: clientId, archivedAt: null };
}

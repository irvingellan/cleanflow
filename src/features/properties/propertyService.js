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

function propertiesCollection() {
  return collection(db, "organizations", organizationId, "properties");
}

function propertyDocument(propertyId) {
  return doc(db, "organizations", organizationId, "properties", propertyId);
}

export async function getProperties({ includeArchived = false } = {}) {
  const snapshot = await getDocs(propertiesCollection());

  return filterArchivedRecords(snapshot.docs.map((propertyDocument) => withNormalizedDataProvenance({
    ...propertyDocument.data(),
    id: propertyDocument.id,
  })), includeArchived);
}

export async function getPropertiesForClient(clientId, { includeArchived = false } = {}) {
  const snapshot = await getDocs(
    query(propertiesCollection(), where("clientId", "==", clientId)),
  );

  return filterArchivedRecords(snapshot.docs.map((propertyDocument) => withNormalizedDataProvenance({
    ...propertyDocument.data(),
    id: propertyDocument.id,
  })), includeArchived);
}

export async function createProperty({
  name,
  clientId,
  clientName,
  defaultClientPrice,
  defaultCleanerPrice,
  active,
}) {
  const property = {
    name,
    clientName,
    active,
    organizationId,
    dataProvenance: "REAL",
  };

  if (clientId) {
    property.clientId = clientId;
  }

  if (defaultClientPrice !== undefined) {
    property.defaultClientPrice = defaultClientPrice;
  }

  if (defaultCleanerPrice !== undefined) {
    property.defaultCleanerPrice = defaultCleanerPrice;
  }

  const reference = await addDoc(propertiesCollection(), property);

  return withNormalizedDataProvenance({ id: reference.id, ...property });
}

export async function linkPropertyToClient(propertyId, client) {
  await updateDoc(propertyDocument(propertyId), {
    clientId: client.id,
    clientName: client.name,
  });

  return {
    id: propertyId,
    clientId: client.id,
    clientName: client.name,
  };
}

export async function updatePropertyDataProvenance(propertyId, dataProvenance, actorUid) {
  await updateDoc(
    propertyDocument(propertyId),
    buildDataProvenanceUpdate(dataProvenance, actorUid, serverTimestamp()),
  );

  return { id: propertyId, dataProvenance };
}

export async function archiveProperty(propertyId, actorUid) {
  await updateDoc(propertyDocument(propertyId), buildArchiveUpdate(actorUid, serverTimestamp()));
  return { id: propertyId, archivedAt: true };
}

export async function restoreProperty(propertyId, actorUid) {
  await updateDoc(propertyDocument(propertyId), buildRestoreUpdate(actorUid, serverTimestamp()));
  return { id: propertyId, archivedAt: null };
}

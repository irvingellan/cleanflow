import {
  addDoc,
  collection,
  deleteField,
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
import { normalizePropertyChecklistSettings } from "../checklists/checklistRunDefinition.js";

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
  address,
  garageParking,
  cleanerInstructions,
  additionalNotes,
  keyCodeInfo,
  accessInstructions,
  checklistSettings,
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

  addOptionalPropertyFields(property, {
    address,
    garageParking,
    cleanerInstructions,
    additionalNotes,
    keyCodeInfo,
    accessInstructions,
  });

  if (checklistSettings) {
    property.checklistSettings = normalizePropertyChecklistSettings(checklistSettings);
  }

  const reference = await addDoc(propertiesCollection(), property);

  return withNormalizedDataProvenance({ id: reference.id, ...property });
}

export async function updatePropertyChecklistSettings(propertyId, checklistSettings) {
  const normalizedSettings = normalizePropertyChecklistSettings(checklistSettings);
  await updateDoc(propertyDocument(propertyId), { checklistSettings: normalizedSettings });
  return { id: propertyId, checklistSettings: normalizedSettings };
}

export async function updateProperty(propertyId, {
  name,
  client,
  defaultClientPrice,
  defaultCleanerPrice,
  address,
  garageParking,
  cleanerInstructions,
  additionalNotes,
  keyCodeInfo,
  accessInstructions,
}) {
  const update = {
    name,
    defaultClientPrice: defaultClientPrice === undefined ? deleteField() : defaultClientPrice,
    defaultCleanerPrice: defaultCleanerPrice === undefined ? deleteField() : defaultCleanerPrice,
    address: address === undefined ? deleteField() : address,
    garageParking: garageParking === undefined ? deleteField() : garageParking,
    cleanerInstructions: cleanerInstructions === undefined ? deleteField() : cleanerInstructions,
    additionalNotes: additionalNotes === undefined ? deleteField() : additionalNotes,
    keyCodeInfo: keyCodeInfo === undefined ? deleteField() : keyCodeInfo,
    accessInstructions: accessInstructions === undefined ? deleteField() : accessInstructions,
  };

  if (client) {
    update.clientId = client.id;
    update.clientName = client.name;
  }

  await updateDoc(propertyDocument(propertyId), update);

  return {
    id: propertyId,
    name,
    ...(client ? { clientId: client.id, clientName: client.name } : {}),
    defaultClientPrice,
    defaultCleanerPrice,
    address,
    garageParking,
    cleanerInstructions,
    additionalNotes,
    keyCodeInfo,
    accessInstructions,
  };
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

function addOptionalPropertyFields(property, fields) {
  for (const [field, value] of Object.entries(fields)) {
    if (value !== undefined) {
      property[field] = value;
    }
  }
}

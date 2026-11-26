import {
  addDoc,
  collection,
  deleteField,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  collection as serverCollection, getDocs as getServerDocs, query as serverQuery, where as serverWhere,
} from "firebase/firestore/lite";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../services/firebase/client.js";
import {
  getServerCollection, getServerRecordsById, serverFirestore, withReadDeadline,
} from "../../services/firebase/serverReads.js";
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

// One-shot server read with a deadline: a full-SDK read on a stalled realtime
// channel (seen on iPhone Safari) could hold the screen for 30 s or more.
export async function getProperties({ includeArchived = false } = {}) {
  const documents = await withReadDeadline(getServerCollection(organizationId, "properties"));

  return filterArchivedRecords(documents.map((propertyDocument) => withNormalizedDataProvenance({
    ...propertyDocument.data(),
    id: propertyDocument.id,
  })), includeArchived);
}

/** One document-ID batch for read-only service reconciliation. */
export async function getPropertySummariesById(ids) {
  const records = await getServerRecordsById(organizationId, "properties", ids);
  return records.map((row) => {
    const { name, clientId } = row.data();
    return { id: row.id, name, clientId };
  });
}

export async function getPropertiesForClient(clientId, { includeArchived = false } = {}) {
  const snapshot = await withReadDeadline(getServerDocs(serverQuery(
    serverCollection(serverFirestore(), "organizations", organizationId, "properties"),
    serverWhere("clientId", "==", clientId),
  )));

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
  serviceRates,
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

  if (serviceRates && Object.keys(serviceRates).length) property.serviceRates = serviceRates;

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

const cleanerAccessFields = ["door", "gate", "lockbox", "parking", "wifi", "alarm", "note"];

/** FB01: the access details a manager deliberately shares with the assigned cleaner. */
export async function updatePropertyCleanerAccess(propertyId, access, actorUid) {
  const cleanerAccess = {
    shared: access?.shared === true,
    ...Object.fromEntries(cleanerAccessFields.map((field) => [
      field, typeof access?.[field] === "string" ? access[field].trim().slice(0, 400) : "",
    ])),
    updatedAt: serverTimestamp(),
    ...(typeof actorUid === "string" && actorUid ? { updatedByUid: actorUid } : {}),
  };
  await updateDoc(propertyDocument(propertyId), { cleanerAccess });
  return { id: propertyId, cleanerAccess: { ...cleanerAccess, updatedAt: null } };
}

export async function listPropertyAccessPhotos(propertyId) {
  const [property] = await withReadDeadline(getServerRecordsById(organizationId, "properties", [propertyId]));
  if (!property) throw new Error("Property is unavailable.");
  const photos = property.data().cleanerAccessPhotos;
  return Array.isArray(photos) ? photos : [];
}

export async function uploadPropertyAccessPhoto(photo) {
  const { data } = await httpsCallable(functions, "uploadPropertyAccessPhoto")(photo);
  return data;
}

export async function removePropertyAccessPhoto(propertyId, photoId) {
  await httpsCallable(functions, "removePropertyAccessPhoto")({ propertyId, photoId });
}

export async function getPropertyAccessPhoto(propertyId, photoId) {
  const { data } = await httpsCallable(functions, "getPropertyAccessPhoto")({ propertyId, photoId });
  return data;
}

export async function updateProperty(propertyId, {
  name,
  client,
  defaultClientPrice,
  defaultCleanerPrice,
  serviceRates,
  changedRateTypes = Object.keys(serviceRates || {}),
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

  // Touch only the service rows the manager edited.
  for (const type of changedRateTypes) {
    update[`serviceRates.${type}`] = serviceRates[type] ?? deleteField();
  }

  if (client) {
    update.clientId = client.id;
    update.clientName = client.name;
  }

  await updateDoc(propertyDocument(propertyId), update);

  return {
    id: propertyId,
    name,
    ...(client ? { clientId: client.id, clientName: client.name } : {}),
    ...(serviceRates ? { serviceRates } : {}),
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

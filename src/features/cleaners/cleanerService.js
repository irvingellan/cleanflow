import {
  addDoc,
  collection,
  documentId,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";
import {
  buildDataProvenanceUpdate,
  withNormalizedDataProvenance,
} from "../../lib/dataProvenance.js";
import { buildArchiveUpdate, buildRestoreUpdate, filterArchivedRecords } from "../../lib/archiveState.js";

const organizationId = "cleanflow-demo";
const cleanerLookupBatchSize = 30;
export const supportedCleanerTeamTypes = ["", "SOLO", "COUPLE", "TEAM"];
export const supportedPaymentMethods = ["", "ZELLE", "VENMO", "CASH", "CHECK", "OTHER"];

function cleanersCollection() {
  return collection(db, "organizations", organizationId, "cleaners");
}

function cleanerDocument(cleanerId) {
  return doc(db, "organizations", organizationId, "cleaners", cleanerId);
}

function assertValidProfileEnums({ teamType, preferredPaymentMethod }) {
  if (!supportedCleanerTeamTypes.includes(teamType)) {
    throw new Error("Invalid cleaner team type.");
  }

  if (!supportedPaymentMethods.includes(preferredPaymentMethod)) {
    throw new Error("Invalid cleaner payment method.");
  }
}

export async function getCleanerNamesById(cleanerIds) {
  const uniqueCleanerIds = [...new Set(cleanerIds.filter(Boolean))];
  const cleanerIdBatches = Array.from(
    { length: Math.ceil(uniqueCleanerIds.length / cleanerLookupBatchSize) },
    (_, index) =>
      uniqueCleanerIds.slice(
        index * cleanerLookupBatchSize,
        (index + 1) * cleanerLookupBatchSize,
      ),
  );
  const snapshots = await Promise.all(
    cleanerIdBatches.map((cleanerIdsBatch) =>
      getDocs(
        query(
          cleanersCollection(),
          where(documentId(), "in", cleanerIdsBatch),
        ),
      ),
    ),
  );

  return Object.fromEntries(
    snapshots.flatMap((snapshot) =>
      snapshot.docs.map((cleanerSnapshot) => [
        cleanerSnapshot.id,
        cleanerSnapshot.data().name,
      ]),
    ),
  );
}

export async function getCleaners() {
  const cleanersQuery = query(
    cleanersCollection(),
    where("active", "==", true),
  );
  const snapshot = await getDocs(cleanersQuery);

  return filterArchivedRecords(snapshot.docs.map((cleanerDocument) => withNormalizedDataProvenance({
    ...cleanerDocument.data(),
    id: cleanerDocument.id,
  })));
}

export async function getAllCleaners({ includeArchived = false } = {}) {
  const snapshot = await getDocs(cleanersCollection());

  return filterArchivedRecords(snapshot.docs.map((cleanerDocumentSnapshot) => withNormalizedDataProvenance({
    ...cleanerDocumentSnapshot.data(),
    id: cleanerDocumentSnapshot.id,
  })), includeArchived);
}

export async function createCleaner({
  name,
  phone,
  preferredLanguage,
  active,
  cityOrRegion,
  teamType,
  internalNotes,
  preferredPaymentMethod,
  paymentContact,
}) {
  assertValidProfileEnums({ teamType, preferredPaymentMethod });

  const reference = await addDoc(cleanersCollection(), {
    name,
    phone,
    preferredLanguage,
    active,
    cityOrRegion,
    teamType,
    internalNotes,
    preferredPaymentMethod,
    paymentContact,
    organizationId,
    dataProvenance: "REAL",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return withNormalizedDataProvenance({
    id: reference.id,
    name,
    phone,
    preferredLanguage,
    active,
    cityOrRegion,
    teamType,
    internalNotes,
    preferredPaymentMethod,
    paymentContact,
    dataProvenance: "REAL",
  });
}

export async function updateCleaner(cleanerId, {
  name,
  phone,
  preferredLanguage,
  active,
  cityOrRegion,
  teamType,
  internalNotes,
  preferredPaymentMethod,
  paymentContact,
}) {
  assertValidProfileEnums({ teamType, preferredPaymentMethod });

  await updateDoc(cleanerDocument(cleanerId), {
    name,
    phone,
    preferredLanguage,
    active,
    cityOrRegion,
    teamType,
    internalNotes,
    preferredPaymentMethod,
    paymentContact,
    updatedAt: serverTimestamp(),
  });

  return {
    id: cleanerId,
    name,
    phone,
    preferredLanguage,
    active,
    cityOrRegion,
    teamType,
    internalNotes,
    preferredPaymentMethod,
    paymentContact,
  };
}

export async function updateCleanerDataProvenance(cleanerId, dataProvenance, actorUid) {
  await updateDoc(
    cleanerDocument(cleanerId),
    buildDataProvenanceUpdate(dataProvenance, actorUid, serverTimestamp()),
  );

  return { id: cleanerId, dataProvenance };
}

export async function archiveCleaner(cleanerId, actorUid) {
  await updateDoc(cleanerDocument(cleanerId), buildArchiveUpdate(actorUid, serverTimestamp()));
  return { id: cleanerId, archivedAt: true };
}

export async function restoreCleaner(cleanerId, actorUid) {
  await updateDoc(cleanerDocument(cleanerId), buildRestoreUpdate(actorUid, serverTimestamp()));
  return { id: cleanerId, archivedAt: null };
}

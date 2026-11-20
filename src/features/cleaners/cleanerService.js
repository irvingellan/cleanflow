import {
  addDoc,
  collection,
  serverTimestamp,
  updateDoc,
  doc,
} from "firebase/firestore";
import {
  collection as serverCollection, getDocs as getServerDocs, query as serverQuery, where as serverWhere,
} from "firebase/firestore/lite";
import { db } from "../../services/firebase/client.js";
import {
  getServerCollection, getServerRecordsById, serverFirestore, withReadDeadline,
} from "../../services/firebase/serverReads.js";
import { currentOrganizationId } from "../../services/organization/currentOrganization.js";
import {
  buildDataProvenanceUpdate,
  withNormalizedDataProvenance,
} from "../../lib/dataProvenance.js";
import { buildArchiveUpdate, buildRestoreUpdate, filterArchivedRecords } from "../../lib/archiveState.js";

import { cleanerLookupBatches } from "./cleanerLookupBatches.js";

export const supportedCleanerTeamTypes = ["", "SOLO", "COUPLE", "TEAM"];
export const supportedPaymentMethods = ["", "ZELLE", "VENMO", "CASH", "CHECK", "OTHER"];

function cleanersCollection() {
  return collection(db, "organizations", currentOrganizationId(), "cleaners");
}

function cleanerDocument(cleanerId) {
  return doc(db, "organizations", currentOrganizationId(), "cleaners", cleanerId);
}

function assertValidProfileEnums({ teamType, preferredPaymentMethod }) {
  if (!supportedCleanerTeamTypes.includes(teamType)) {
    throw new Error("Invalid cleaner team type.");
  }

  if (!supportedPaymentMethods.includes(preferredPaymentMethod)) {
    throw new Error("Invalid cleaner payment method.");
  }
}

export async function getCleanerContactsById(cleanerIds) {
  const cleanerIdBatches = cleanerLookupBatches(cleanerIds);
  // One-shot server reads with a deadline (see getAllCleaners).
  const batches = await withReadDeadline(Promise.all(
    cleanerIdBatches.map((cleanerIdsBatch) => getServerRecordsById(currentOrganizationId(), "cleaners", cleanerIdsBatch)),
  ));

  return Object.fromEntries(
    batches.flatMap((documents) =>
      documents.map((cleanerSnapshot) => [
        cleanerSnapshot.id,
        {
          name: cleanerSnapshot.data().name,
          phone: cleanerSnapshot.data().phone,
          preferredLanguage: cleanerSnapshot.data().preferredLanguage,
        },
      ]),
    ),
  );
}

export async function getCleanerNamesById(cleanerIds) {
  const contacts = await getCleanerContactsById(cleanerIds);
  return Object.fromEntries(
    Object.entries(contacts).map(([cleanerId, contact]) => [cleanerId, contact.name]),
  );
}

export async function getCleaners() {
  // One-shot server read with a deadline (see getAllCleaners).
  const snapshot = await withReadDeadline(getServerDocs(serverQuery(
    serverCollection(serverFirestore(), "organizations", currentOrganizationId(), "cleaners"),
    serverWhere("active", "==", true),
  )));

  return filterArchivedRecords(snapshot.docs.map((cleanerDocument) => withNormalizedDataProvenance({
    ...cleanerDocument.data(),
    id: cleanerDocument.id,
  })));
}

// A one-shot server read with a deadline: the realtime channel can stall and
// leave the Cleaners, Jobs and Payouts screens loading forever.
export async function getAllCleaners({ includeArchived = false } = {}) {
  const documents = await withReadDeadline(getServerCollection(currentOrganizationId(), "cleaners"));

  return filterArchivedRecords(documents.map((cleanerDocumentSnapshot) => withNormalizedDataProvenance({
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
    organizationId: currentOrganizationId(),
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

/** Manager switch for phone alerts; the cleaner still opts in on her own device. */
export async function setCleanerPushAlerts(cleanerId, enabled, actorUid) {
  await updateDoc(cleanerDocument(cleanerId), {
    pushAlertsEnabled: enabled === true,
    pushAlertsEnabledAt: enabled === true ? serverTimestamp() : null,
    pushAlertsUpdatedByUid: actorUid || null,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveCleaner(cleanerId, actorUid) {
  await updateDoc(cleanerDocument(cleanerId), buildArchiveUpdate(actorUid, serverTimestamp()));
  return { id: cleanerId, archivedAt: true };
}

export async function restoreCleaner(cleanerId, actorUid) {
  await updateDoc(cleanerDocument(cleanerId), buildRestoreUpdate(actorUid, serverTimestamp()));
  return { id: cleanerId, archivedAt: null };
}

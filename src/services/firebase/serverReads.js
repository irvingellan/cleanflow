import {
  collection, connectFirestoreEmulator, documentId, getDocs, getFirestore, query, setLogLevel, where,
} from "firebase/firestore/lite";
import { emulatorPorts, firebaseApp, useFirebaseEmulators } from "./client.js";

let instance;

/** Authenticated, one-shot server reads independent of the realtime Watch. */
export function serverFirestore() {
  if (!instance) {
    // SDK debug output can include request paths and query bodies.
    setLogLevel("silent");
    const firestore = getFirestore(firebaseApp);
    if (useFirebaseEmulators) connectFirestoreEmulator(firestore, "127.0.0.1", emulatorPorts.firestore);
    instance = firestore;
  }
  return instance;
}

/** One server read for a batch of document IDs. */
export async function getServerRecordsById(organizationId, collectionName, ids, read = getDocs) {
  if (ids.length === 0) return [];
  if (ids.length > 30) throw new RangeError("At most 30 IDs per context query.");
  const records = collection(serverFirestore(), "organizations", organizationId, collectionName);
  const snapshot = await read(query(records, where(documentId(), "in", ids)));
  return snapshot.docs;
}

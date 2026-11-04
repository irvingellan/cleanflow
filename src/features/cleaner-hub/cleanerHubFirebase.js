import { getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { emulatorPorts, firebaseConfig, useFirebaseEmulators } from "../../services/firebase/client.js";

/**
 * The Cleaner Hub uses its own named Firebase app. Its sign-in is stored apart
 * from the manager session, so a cleaner account and a manager account on the
 * same phone never replace each other, and the manager app never sees it.
 */
export const cleanerHubAppName = "cleanflow-cleaner-hub";
let instance = null;

function localCache() {
  // Last confirmed agenda can be shown, labelled as unconfirmed, while offline.
  // Sign-out reloads the page after clearing this cache.
  try {
    if (typeof indexedDB === "undefined") return memoryLocalCache();
    return persistentLocalCache({ tabManager: persistentMultipleTabManager() });
  } catch {
    return memoryLocalCache();
  }
}

export function cleanerHubFirebase() {
  if (instance) return instance;
  const app = getApps().find((candidate) => candidate.name === cleanerHubAppName)
    || initializeApp(firebaseConfig, cleanerHubAppName);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  const db = initializeFirestore(app, { localCache: localCache() });
  const functions = getFunctions(app, "us-central1");
  if (useFirebaseEmulators) {
    connectAuthEmulator(auth, `http://127.0.0.1:${emulatorPorts.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", emulatorPorts.firestore);
    connectFunctionsEmulator(functions, "127.0.0.1", emulatorPorts.functions);
  }
  instance = { app, auth, db, functions };
  return instance;
}

import { getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { emulatorPorts, firebaseConfig, useFirebaseEmulators } from "../../services/firebase/client.js";

/**
 * The Cleaner Hub uses its own named Firebase app. Its sign-in is stored apart
 * from the manager session, so a cleaner account and a manager account on the
 * same phone never replace each other, and the manager app never sees it.
 */
export const cleanerHubAppName = "cleanflow-cleaner-hub";
let instance = null;

// Memory cache only: the last confirmed agenda stays on screen (labelled as not
// confirmed) while the connection drops, but nothing private is kept on the
// phone after the app closes or the cleaner signs out. The network-only service
// worker cannot open the app offline anyway, so a disk cache would add risk only.
export function cleanerHubFirebase() {
  if (instance) return instance;
  const app = getApps().find((candidate) => candidate.name === cleanerHubAppName)
    || initializeApp(firebaseConfig, cleanerHubAppName);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  // Plain long-polling is the most dependable transport for Safari Home Screen
  // apps and mobile networks; streaming auto-detection can stall silently there.
  const db = initializeFirestore(app, { localCache: memoryLocalCache(), experimentalForceLongPolling: true });
  const functions = getFunctions(app, "us-central1");
  if (useFirebaseEmulators) {
    connectAuthEmulator(auth, `http://127.0.0.1:${emulatorPorts.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", emulatorPorts.firestore);
    connectFunctionsEmulator(functions, "127.0.0.1", emulatorPorts.functions);
  }
  instance = { app, auth, db, functions };
  return instance;
}

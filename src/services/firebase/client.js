import { connectFirestoreEmulator, getFirestore, initializeFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { emulatorPorts, firebaseApp, useFirebaseEmulators } from "./app.js";

export { emulatorPorts, firebaseApp, firebaseConfig, useFirebaseEmulators } from "./app.js";
export { functions } from "./functionsClient.js";

// Local transport comparison only. A Production/Sandbox build always keeps
// the existing SDK defaults, even if the test flag exists in the shell.
const compareLongPolling = useFirebaseEmulators
  && import.meta.env.VITE_CLEANFLOW_EMULATOR_FORCE_LONG_POLLING === "true";
export const db = compareLongPolling
  ? initializeFirestore(firebaseApp, { experimentalForceLongPolling: true })
  : getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

if (useFirebaseEmulators) {
  connectFirestoreEmulator(db, "127.0.0.1", emulatorPorts.firestore);
  connectStorageEmulator(storage, "127.0.0.1", emulatorPorts.storage);
}

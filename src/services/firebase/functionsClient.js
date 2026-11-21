import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { emulatorPorts, firebaseApp, useFirebaseEmulators } from "./app.js";

// Callable Functions only. The public checklist and client report use this
// module so they do not load the Firestore and Storage SDKs.
export const functions = getFunctions(firebaseApp, "us-central1");

if (useFirebaseEmulators) {
  connectFunctionsEmulator(functions, "127.0.0.1", emulatorPorts.functions);
}

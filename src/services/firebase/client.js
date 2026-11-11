import { getApp, getApps, initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { createFirebaseConfig } from "./config.js";
import { assertBuildEnvironment, assertHostingOriginBinding } from "../../environment.js";

export const useFirebaseEmulators =
  ["emulator", "e2e"].includes(import.meta.env.MODE) &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";

const approvedPrivateEmulatorOrigin = typeof __CLEANFLOW_PRIVATE_EMULATOR_ORIGIN__ === "string"
  ? __CLEANFLOW_PRIVATE_EMULATOR_ORIGIN__ : "";
const binding = assertBuildEnvironment(import.meta.env.MODE, import.meta.env, { approvedPrivateEmulatorOrigin });
export const firebaseConfig = createFirebaseConfig({
  ...import.meta.env,
  ...(["test", "emulator", "e2e"].includes(import.meta.env.MODE) ? { VITE_FIREBASE_PROJECT_ID: "demo-cleanflow" } : {}),
});
assertHostingOriginBinding({
  buildMode: import.meta.env.MODE,
  firebaseProjectId: firebaseConfig.projectId,
  privateEmulatorOrigin: import.meta.env.VITE_CLEANFLOW_PRIVATE_EMULATOR_ORIGIN,
  approvedPrivateEmulatorOrigin,
  environment: binding.environment,
  currentOrigin: typeof window === "undefined" ? "" : window.location.origin,
  sandboxProjectId: import.meta.env.VITE_CLEANFLOW_SANDBOX_PROJECT_ID,
});
if (getApps().length && Object.entries(firebaseConfig).some(([key, value]) => getApp().options[key] !== value)) {
  throw new Error("Firebase hot-swap is forbidden; navigate to the dedicated origin.");
}

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

// Local transport comparison only. A Production/Sandbox build always keeps
// the existing SDK defaults, even if the test flag exists in the shell.
const compareLongPolling = useFirebaseEmulators
  && import.meta.env.VITE_CLEANFLOW_EMULATOR_FORCE_LONG_POLLING === "true";
export const db = compareLongPolling
  ? initializeFirestore(firebaseApp, { experimentalForceLongPolling: true })
  : getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, "us-central1");
export const storage = getStorage(firebaseApp);

function emulatorPort(name, fallback) {
  const port = Number(import.meta.env[`VITE_CLEANFLOW_EMULATOR_${name}_PORT`]);
  return Number.isInteger(port) && port > 1024 && port < 65536 ? port : fallback;
}

// Local emulator ports only; isolated suites may move them so they never touch
// another running emulator. Production and Sandbox never read these values.
export const emulatorPorts = Object.freeze({
  auth: emulatorPort("AUTH", 9099),
  firestore: emulatorPort("FIRESTORE", 8080),
  functions: emulatorPort("FUNCTIONS", 5001),
  storage: emulatorPort("STORAGE", 9199),
});

if (useFirebaseEmulators) {
  connectFirestoreEmulator(db, "127.0.0.1", emulatorPorts.firestore);
  connectFunctionsEmulator(functions, "127.0.0.1", emulatorPorts.functions);
  connectStorageEmulator(storage, "127.0.0.1", emulatorPorts.storage);
}

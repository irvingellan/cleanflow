import { getApp, getApps, initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { createFirebaseConfig } from "./config.js";
import { assertBuildEnvironment, assertHostingOriginBinding } from "../../environment.js";

export const useFirebaseEmulators =
  ["emulator", "e2e"].includes(import.meta.env.MODE) &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";

const binding = assertBuildEnvironment(import.meta.env.MODE, import.meta.env);
const firebaseConfig = createFirebaseConfig({
  ...import.meta.env,
  ...(["test", "emulator", "e2e"].includes(import.meta.env.MODE) ? { VITE_FIREBASE_PROJECT_ID: "demo-cleanflow" } : {}),
});
assertHostingOriginBinding({
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

export const db = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, "us-central1");
export const storage = getStorage(firebaseApp);

if (useFirebaseEmulators) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

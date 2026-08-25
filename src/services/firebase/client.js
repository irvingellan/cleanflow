import { getApp, getApps, initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { createFirebaseConfig } from "./config.js";

export const useFirebaseEmulators =
  import.meta.env.MODE === "emulator" &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";

const firebaseConfig = createFirebaseConfig({
  ...import.meta.env,
  ...(useFirebaseEmulators ? { VITE_FIREBASE_PROJECT_ID: "demo-cleanflow" } : {}),
});

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, "us-central1");

if (useFirebaseEmulators) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

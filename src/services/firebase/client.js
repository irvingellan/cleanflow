import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { createFirebaseConfig } from "./config.js";

const firebaseConfig = createFirebaseConfig(import.meta.env);

const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);

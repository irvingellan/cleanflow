import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError } from "firebase-functions/v2/https";

// A client wakes a cold Function ahead of need (see src/services/firebase/functionWarmup.js).
// Checked after authorization, so it only confirms the caller and returns nothing.
export function isWarmupCall(request) {
  return request.data?.warmup === true;
}

// Handlers load lazily, so another named app may already exist (the Functions
// emulator keeps its own). Only the default app decides whether to initialize.
if (!getApps().some((app) => app.name === "[DEFAULT]")) {
  initializeApp();
}

export const db = getFirestore();

export function emulatorPushDisabled() {
  return process.env.FUNCTIONS_EMULATOR === "true" || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
}

export function liveMessaging() {
  if (emulatorPushDisabled()) {
    throw new HttpsError("unavailable", "Push transport is disabled in emulators.");
  }
  return getMessaging();
}

export function organizationReference(organizationId) {
  return db.collection("organizations").doc(organizationId);
}

// Harness-only provider boundary. No Firebase SDK is imported or initialized.
export const db = Object.freeze({ syntheticHarness: true });
export const functions = Object.freeze({ syntheticHarness: true });
export const storage = Object.freeze({ syntheticHarness: true });
export const auth = Object.freeze({ syntheticHarness: true });
export const firebaseApp = Object.freeze({ syntheticHarness: true });
export const useFirebaseEmulators = false;
export const firebaseConfig = Object.freeze({ projectId: "synthetic-harness-no-project" });
export const emulatorPorts = Object.freeze({ auth: 0, firestore: 0, functions: 0, storage: 0 });

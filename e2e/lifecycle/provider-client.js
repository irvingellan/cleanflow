// Harness-only provider boundary. No Firebase SDK is imported or initialized.
export const db = Object.freeze({ syntheticLifecycleHarness: true });
export const functions = Object.freeze({ syntheticLifecycleHarness: true });
export const storage = Object.freeze({ syntheticLifecycleHarness: true });
export const firebaseApp = Object.freeze({ syntheticLifecycleHarness: true });
export const useFirebaseEmulators = false;

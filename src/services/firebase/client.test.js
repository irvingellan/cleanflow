import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  getApps: vi.fn(() => []), getApp: vi.fn(), initializeApp: vi.fn(config => ({ options: config })),
  connectFirestoreEmulator: vi.fn(), connectFunctionsEmulator: vi.fn(), connectStorageEmulator: vi.fn(),
}));
vi.mock("firebase/app", () => sdk);
vi.mock("firebase/firestore", () => ({ getFirestore: () => ({}), connectFirestoreEmulator: sdk.connectFirestoreEmulator }));
vi.mock("firebase/functions", () => ({ getFunctions: () => ({}), connectFunctionsEmulator: sdk.connectFunctionsEmulator }));
vi.mock("firebase/storage", () => ({ getStorage: () => ({}), connectStorageEmulator: sdk.connectStorageEmulator }));

const fixture = {
  MODE: "emulator", VITE_CLEANFLOW_ENV: "emulator", VITE_USE_FIREBASE_EMULATORS: "true",
  VITE_FIREBASE_PROJECT_ID: "demo-cleanflow", VITE_FIREBASE_API_KEY: "synthetic-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-cleanflow.local", VITE_FIREBASE_STORAGE_BUCKET: "demo-cleanflow.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123", VITE_FIREBASE_APP_ID: "1:123:web:fixture",
};
function setEnvironment() {
  vi.resetModules();
  for (const [key, value] of Object.entries(fixture)) vi.stubEnv(key, value);
}
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); sdk.getApps.mockReturnValue([]); });

describe("Firebase client binding", () => {
  it("binds local Firestore, Functions and Storage rather than cloud services", async () => {
    setEnvironment();
    await import("./client.js");
    expect(sdk.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ projectId: "demo-cleanflow", apiKey: "synthetic-key" }));
    expect(sdk.connectFirestoreEmulator).toHaveBeenCalledWith(expect.anything(), "127.0.0.1", 8080);
    expect(sdk.connectFunctionsEmulator).toHaveBeenCalledWith(expect.anything(), "127.0.0.1", 5001);
    expect(sdk.connectStorageEmulator).toHaveBeenCalledWith(expect.anything(), "127.0.0.1", 9199);
  });
  it("lets public pages bind only Functions, with the same checks and no Firestore or Storage", async () => {
    setEnvironment();
    await import("./functionsClient.js");
    expect(sdk.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ projectId: "demo-cleanflow" }));
    expect(sdk.connectFunctionsEmulator).toHaveBeenCalledWith(expect.anything(), "127.0.0.1", 5001);
    expect(sdk.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(sdk.connectStorageEmulator).not.toHaveBeenCalled();
  });
  it("connects the Functions emulator once when both modules load", async () => {
    setEnvironment();
    await import("./functionsClient.js");
    await import("./client.js");
    expect(sdk.connectFunctionsEmulator).toHaveBeenCalledTimes(1);
    expect(sdk.initializeApp).toHaveBeenCalledTimes(1);
  });
  it("applies the production-binding check on the Functions-only path too", async () => {
    setEnvironment();
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "clean-flow-prototipo");
    await expect(import("./functionsClient.js")).rejects.toThrow(/binding/);
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });
  it("rejects an existing differently bound SDK instead of hot-swapping it", async () => {
    setEnvironment();
    sdk.getApps.mockReturnValue([{}]);
    sdk.getApp.mockReturnValue({ options: { projectId: "clean-flow-prototipo" } });
    await expect(import("./client.js")).rejects.toThrow(/hot-swap/);
    expect(sdk.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });
  it("fails before initialization if an emulator build points at production", async () => {
    setEnvironment();
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "clean-flow-prototipo");
    await expect(import("./client.js")).rejects.toThrow(/binding/);
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });
});

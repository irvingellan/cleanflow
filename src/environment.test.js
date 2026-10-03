import { describe, expect, it } from "vitest";
import { assertBuildEnvironment, assertFirebaseEnvironmentBinding, assertHostingOriginBinding, canShowEnvironmentNavigation, environmentNavigationTarget, resolveCleanFlowEnvironment, resolveSandboxOrigin } from "./environment.js";

const projectId = "cleanflow-sandbox-fixture";
const config = {
  VITE_CLEANFLOW_ENV: "sandbox", VITE_CLEANFLOW_SANDBOX_PROJECT_ID: projectId,
  VITE_FIREBASE_PROJECT_ID: projectId, VITE_FIREBASE_API_KEY: "synthetic-key",
  VITE_FIREBASE_AUTH_DOMAIN: projectId + ".firebaseapp.com",
  VITE_FIREBASE_STORAGE_BUCKET: projectId + ".firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123", VITE_FIREBASE_APP_ID: "1:123:web:fixture",
};

describe("environment isolation", () => {
  it("limits the UI navigation allowlist to exact emails and known environments", () => {
    const user = { uid: "synthetic-developer", email: " Developer@Example.test " };
    expect(canShowEnvironmentNavigation(user, "sandbox", " other@example.test, developer@example.test ")).toBe(true);
    expect(canShowEnvironmentNavigation(user, "production", "developer@example.test")).toBe(true);
    for (const emails of ["", "*", "*@example.test", "example.test", "xdeveloper@example.test", null]) {
      expect(canShowEnvironmentNavigation(user, "sandbox", emails)).toBe(false);
    }
    for (const account of [null, {}, { email: user.email }, { uid: user.uid, email: null }, { ...user, isAnonymous: true }]) {
      expect(canShowEnvironmentNavigation(account, "sandbox", "developer@example.test")).toBe(false);
    }
    expect(canShowEnvironmentNavigation(user, "unknown", "developer@example.test")).toBe(false);
    expect(canShowEnvironmentNavigation(user, "emulator", "developer@example.test")).toBe(false);
  });
  it("keeps navigation origins explicit and rejects a cross-project destination", () => {
    expect(environmentNavigationTarget("sandbox")).toEqual({ href: "https://clean-flow-prototipo.web.app", labelKey: "environment.backToProduction" });
    expect(environmentNavigationTarget("production", { sandboxProjectId: projectId })).toEqual({ href: `https://${projectId}.web.app`, labelKey: "environment.openSandbox" });
    expect(environmentNavigationTarget("unknown")).toBeNull();
    expect(() => environmentNavigationTarget("production", { sandboxProjectId: projectId, sandboxOrigin: "https://clean-flow-prototipo.web.app" })).toThrow();
  });
  it("classifies production, Sandbox and automated emulators without runtime switching", () => {
    expect(resolveCleanFlowEnvironment({ firebaseProjectId: "clean-flow-prototipo" })).toBe("production");
    expect(resolveCleanFlowEnvironment({ mode: "sandbox", firebaseProjectId: projectId })).toBe("sandbox");
    expect(resolveCleanFlowEnvironment({ mode: "e2e" })).toBe("emulator");
    expect(resolveCleanFlowEnvironment({ firebaseProjectId: "unrecognized-project" })).toBe("unknown");
    expect(assertBuildEnvironment("sandbox", config)).toEqual({ environment: "sandbox", projectId });
  });
  it("fails closed for production, unknown project and missing config", () => {
    expect(() => assertBuildEnvironment("sandbox", { ...config, VITE_FIREBASE_PROJECT_ID: "clean-flow-prototipo" })).toThrow();
    expect(() => assertBuildEnvironment("sandbox", { ...config, VITE_CLEANFLOW_SANDBOX_PROJECT_ID: "" })).toThrow();
    expect(() => assertBuildEnvironment("sandbox", { ...config, VITE_CLEANFLOW_SANDBOX_PROJECT_ID: "demo-cleanflow", VITE_FIREBASE_PROJECT_ID: "demo-cleanflow" })).toThrow();
    expect(() => assertBuildEnvironment("sandbox", { ...config, VITE_FIREBASE_APP_ID: "" })).toThrow();
    expect(() => assertFirebaseEnvironmentBinding({ environment: "unknown", firebaseProjectId: projectId })).toThrow();
    expect(() => assertBuildEnvironment("emulator", { ...config, VITE_CLEANFLOW_ENV: "", VITE_USE_FIREBASE_EMULATORS: "true", VITE_FIREBASE_PROJECT_ID: "clean-flow-prototipo" })).toThrow();
  });
  it("rejects cross-project Auth/Storage/notifications configuration", () => {
    for (const overrides of [
      { VITE_FIREBASE_AUTH_DOMAIN: "clean-flow-prototipo.firebaseapp.com" },
      { VITE_FIREBASE_STORAGE_BUCKET: "clean-flow-prototipo.appspot.com" },
      { VITE_FIREBASE_APP_ID: "1:456:web:fixture" },
      { VITE_FIREBASE_VAPID_KEY: "synthetic-provider-key" },
      { VITE_ONESIGNAL_APP_ID: "synthetic-provider-id" },
    ]) expect(() => assertBuildEnvironment("sandbox", { ...config, ...overrides })).toThrow();
  });
  it("uses dedicated origins/preview channels and refuses cross-origin builds", () => {
    expect(resolveSandboxOrigin({ sandboxProjectId: projectId })).toBe(`https://${projectId}.web.app`);
    expect(resolveSandboxOrigin()).toBe("");
    expect(() => resolveSandboxOrigin({ sandboxProjectId: "clean-flow-prototipo" })).toThrow();
    for (const currentOrigin of [`https://${projectId}.web.app`, `https://${projectId}--preview-abc.web.app`, "http://localhost:5173"]) {
      expect(() => assertHostingOriginBinding({ environment: "sandbox", sandboxProjectId: projectId, currentOrigin })).not.toThrow();
    }
    for (const currentOrigin of ["https://clean-flow-prototipo.web.app", "https://unknown-project.web.app", `https://${projectId}.web.app.evil.example`]) {
      expect(() => assertHostingOriginBinding({ environment: "sandbox", sandboxProjectId: projectId, currentOrigin })).toThrow();
    }
    expect(() => assertHostingOriginBinding({ environment: "production", currentOrigin: `https://${projectId}.web.app` })).toThrow();
  });
});

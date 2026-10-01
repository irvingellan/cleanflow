import { describe, expect, it } from "vitest";
import {
  assertFirebaseEnvironmentBinding,
  assertHostingOriginBinding,
  productionFirebaseProjectId,
  resolveCleanFlowEnvironment,
  resolveSandboxOrigin,
} from "./environment.js";

describe("CleanFlow environment contract", () => {
  it("classifies emulator/test modes before project binding", () => {
    expect(resolveCleanFlowEnvironment({ mode: "test", firebaseProjectId: productionFirebaseProjectId }))
      .toBe("emulator");
    expect(resolveCleanFlowEnvironment({ mode: "sandbox", firebaseProjectId: "cleanflow-sbx" }))
      .toBe("sandbox");
  });

  it("recognizes the production project without a runtime switch", () => {
    expect(resolveCleanFlowEnvironment({ mode: "production", firebaseProjectId: productionFirebaseProjectId }))
      .toBe("production");
  });

  it("fails closed when production and sandbox Firebase bindings are crossed", () => {
    expect(() => assertFirebaseEnvironmentBinding({
      environment: "production",
      firebaseProjectId: "cleanflow-sbx",
      sandboxProjectId: "cleanflow-sbx",
    })).toThrow(/production firebase project/i);

    expect(() => assertFirebaseEnvironmentBinding({
      environment: "sandbox",
      firebaseProjectId: productionFirebaseProjectId,
      sandboxProjectId: productionFirebaseProjectId,
    })).toThrow(/explicit non-production/i);
  });

  it("accepts only the exact configured sandbox project", () => {
    expect(() => assertFirebaseEnvironmentBinding({
      environment: "sandbox",
      firebaseProjectId: "cleanflow-sbx",
      sandboxProjectId: "cleanflow-sbx",
    })).not.toThrow();
  });

  it("derives a sandbox origin and rejects crossed Hosting origins", () => {
    expect(resolveSandboxOrigin({ sandboxProjectId: "cleanflow-sbx" }))
      .toBe("https://cleanflow-sbx.web.app");

    expect(() => assertHostingOriginBinding({
      environment: "sandbox",
      currentOrigin: "https://clean-flow-prototipo.web.app",
      sandboxProjectId: "cleanflow-sbx",
    })).toThrow(/unexpected hosting origin/i);

    expect(() => assertHostingOriginBinding({
      environment: "production",
      currentOrigin: "https://cleanflow-sbx.web.app",
    })).toThrow(/unexpected hosting origin/i);
  });
});

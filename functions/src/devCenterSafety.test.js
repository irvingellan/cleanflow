import { describe, expect, it } from "vitest";
import {
  assertDevCenterMutationEnvironment,
  devCenterProductionProjectId,
  resolveDevCenterEnvironment,
} from "./devCenterSafety.js";

describe("Dev Center mutation safety", () => {
  it("allows emulator mutations", () => {
    expect(() => assertDevCenterMutationEnvironment({ functionsEmulator: "true" })).not.toThrow();
  });

  it("allows only the exact explicitly allowlisted sandbox project", () => {
    expect(resolveDevCenterEnvironment({
      currentProjectId: "clean-flow-sandbox-test",
      sandboxProjectId: "clean-flow-sandbox-test",
    })).toBe("sandbox");
    expect(() => assertDevCenterMutationEnvironment({
      currentProjectId: "clean-flow-sandbox-test",
      sandboxProjectId: "clean-flow-sandbox-test",
    })).not.toThrow();
  });

  it("refuses production mutations even when a sandbox project is configured", () => {
    expect(resolveDevCenterEnvironment({
      currentProjectId: devCenterProductionProjectId,
      sandboxProjectId: "clean-flow-sandbox-test",
    })).toBe("production");
    expect(() => assertDevCenterMutationEnvironment({
      currentProjectId: devCenterProductionProjectId,
      sandboxProjectId: "clean-flow-sandbox-test",
    })).toThrow(/sandbox/i);
  });

  it("fails closed for an unknown project or a sandbox id that points at production", () => {
    expect(() => assertDevCenterMutationEnvironment({
      currentProjectId: "unexpected-project",
      sandboxProjectId: "clean-flow-sandbox-test",
    })).toThrow(/allowlisted Sandbox/i);

    expect(() => assertDevCenterMutationEnvironment({
      currentProjectId: devCenterProductionProjectId,
      sandboxProjectId: devCenterProductionProjectId,
    })).toThrow(/Sandbox/i);
  });
});

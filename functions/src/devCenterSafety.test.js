import { describe, expect, it } from "vitest";
import { assertDevCenterMutationEnvironment, resolveDevCenterEnvironment, resolveDevCenterProjectId } from "./devCenterSafety.js";

describe("Dev Center mutation safety", () => {
  it("allows emulator mutations", () => {
    expect(assertDevCenterMutationEnvironment({ functionsEmulator: "true", currentProjectId: "demo-cleanflow" })).toBe("emulator");
  });

  it("refuses production mutations", () => {
    expect(() => assertDevCenterMutationEnvironment({})).toThrow(/emulator/i);
  });

  it("allows only the exact explicitly allowlisted separate sandbox", () => {
    expect(assertDevCenterMutationEnvironment({ currentProjectId: "synthetic-sandbox", sandboxProjectId: "synthetic-sandbox" })).toBe("sandbox");
    expect(() => assertDevCenterMutationEnvironment({ currentProjectId: "another-project", sandboxProjectId: "synthetic-sandbox" })).toThrow();
    expect(() => assertDevCenterMutationEnvironment({ currentProjectId: "synthetic-sandbox" })).toThrow();
  });

  it("always rejects production, even with a misconfigured allowlist/emulator flag", () => {
    for (const functionsEmulator of [undefined, "true"]) {
      const options = { currentProjectId: "clean-flow-prototipo", sandboxProjectId: "clean-flow-prototipo", functionsEmulator };
      expect(resolveDevCenterEnvironment(options)).toBe("production");
      expect(() => assertDevCenterMutationEnvironment(options)).toThrow();
    }
  });

  it("unknown/emulator-missing project identities remain fail-closed", () => {
    for (const currentProjectId of [undefined, "", "other-project"]) {
      expect(() => assertDevCenterMutationEnvironment({ functionsEmulator: "true", currentProjectId })).toThrow();
    }
    expect(() => assertDevCenterMutationEnvironment({ currentProjectId: "demo-cleanflow", sandboxProjectId: "demo-cleanflow" })).toThrow();
  });

  it("uses trusted runtime project fallback when Firebase config is absent in tests", () => {
    const options = { projectIdValue: () => { throw new SyntaxError("Config absent"); }, environment: { GCLOUD_PROJECT: "demo-cleanflow" } };
    expect(resolveDevCenterProjectId(options)).toBe("demo-cleanflow");
    expect(resolveDevCenterProjectId()).toBe("");
  });

  it("conflicting runtime identities cannot disguise production or authorize unknown projects", () => {
    expect(resolveDevCenterProjectId({ projectIdValue: () => "synthetic-sandbox", environment: { GCLOUD_PROJECT: "clean-flow-prototipo" } })).toBe("clean-flow-prototipo");
    expect(resolveDevCenterProjectId({ projectIdValue: () => "synthetic-sandbox", environment: { GCLOUD_PROJECT: "other-project" } })).toBe("");
  });
});

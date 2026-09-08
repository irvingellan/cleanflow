import { describe, expect, it } from "vitest";
import { assertDevCenterMutationEnvironment } from "./devCenterSafety.js";

describe("Dev Center mutation safety", () => {
  it("allows emulator mutations", () => {
    expect(() => assertDevCenterMutationEnvironment({ FUNCTIONS_EMULATOR: "true" })).not.toThrow();
  });

  it("refuses production mutations", () => {
    expect(() => assertDevCenterMutationEnvironment({})).toThrow(/emulator/i);
  });
});

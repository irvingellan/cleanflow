import { describe, expect, it } from "vitest";
import { assertLocalDemoSeedEnvironment } from "./seedSafety.js";

describe("demo seed safety", () => {
  it("allows only an explicit local demo emulator", () => {
    expect(assertLocalDemoSeedEnvironment({
      GCLOUD_PROJECT: "demo-cleanflow",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    })).toMatchObject({ projectId: "demo-cleanflow" });
  });

  it.each([
    [{ GCLOUD_PROJECT: "clean-flow-prototipo", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }],
    [{ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }],
    [{ GCLOUD_PROJECT: "demo-cleanflow", FIRESTORE_EMULATOR_HOST: "example.com:8080" }],
  ])("refuses ambiguous or unsafe targets", (environment) => {
    expect(() => assertLocalDemoSeedEnvironment(environment)).toThrow();
  });
});

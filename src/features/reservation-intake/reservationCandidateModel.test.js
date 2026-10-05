import { describe, expect, it } from "vitest";
import { assertShadowTarget, validateObservation } from "./reservationCandidateModel.js";
const observation = { sourceProvider: "GENERIC_ICAL", sourceType: "ICAL", sourceId: "demo-source", observedAt: "2026-10-04T12:00:00Z" };
describe("shadow candidate boundaries", () => {
  it("accepts only the exact Sandbox project and origin", () => {
    expect(() => assertShadowTarget({ projectId: "clean-flow-sandbox-irving", origin: "https://clean-flow-sandbox-irving.web.app" })).not.toThrow();
  });
  it.each(["clean-flow-prototipo", "unknown-project", "demo-cleanflow"])("rejects %s", projectId => {
    expect(() => assertShadowTarget({ projectId, origin: "https://clean-flow-sandbox-irving.web.app" })).toThrow("SHADOW_TARGET_DENIED");
  });
  it("does not require guest identity or guess partial missing data", () => {
    expect(validateObservation(observation)).toEqual(observation);
  });
  it.each(["cookie", "token", "phone", "email", "html", "url", "jobId"])("rejects unapproved %s data", field => {
    expect(() => validateObservation({ ...observation, [field]: "secret" })).toThrow("INVALID_OBSERVATION_SCHEMA");
  });
});

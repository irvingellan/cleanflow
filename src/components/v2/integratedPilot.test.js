import { expect, it } from "vitest";
import { integratedPilotEnabled, resolveManagerExperience } from "./integratedPilot.js";
it("Production activation requires an explicit build choice, never query or presentation permission", () => {
  expect(integratedPilotEnabled({ mode: "production", authorized: true, search: "?experience=v2" })).toBe(false);
  expect(integratedPilotEnabled({ mode: "production", buildExperience: "v2", search: "?experience=current" })).toBe(true);
  expect(integratedPilotEnabled({ mode: "unknown", buildExperience: "v2" })).toBe(false);
});
it("build selection defaults to CURRENT and rejects misspelled activation", () => {
  expect(resolveManagerExperience(undefined)).toBe("current");
  expect(resolveManagerExperience("current")).toBe("current");
  expect(resolveManagerExperience("v2")).toBe("v2");
  expect(() => resolveManagerExperience("V2")).toThrow();
  expect(() => resolveManagerExperience("true")).toThrow();
});
it.each(["production", "unknown", "e2e"])("%s cannot activate the integrated pilot", mode => {
  expect(integratedPilotEnabled({ mode, authorized: true, search: "?experience=v2" })).toBe(false);
});
it("presentation permission cannot be implied by the query", () => {
  expect(integratedPilotEnabled({ mode: "sandbox", authorized: false, search: "?experience=v2" })).toBe(false);
});
it("one explicit Sandbox choice activates all presentations", () => {
  expect(integratedPilotEnabled({ mode: "sandbox", authorized: true, search: "?experience=v2" })).toBe(true);
  expect(integratedPilotEnabled({ mode: "sandbox", authorized: true, search: "?experience=current" })).toBe(false);
  expect(integratedPilotEnabled({ mode: "sandbox", authorized: true, search: "" })).toBe(false);
});

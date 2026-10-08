import { expect, it } from "vitest";
import { integratedPilotEnabled } from "./integratedPilot.js";
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

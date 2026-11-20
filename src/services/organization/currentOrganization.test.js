import { afterEach, describe, expect, it } from "vitest";
import {
  currentOrganizationId,
  defaultOrganizationId,
  isOrganizationId,
  organizationIdFromClaims,
  resetCurrentOrganizationId,
  setCurrentOrganizationId,
} from "./currentOrganization.js";

afterEach(() => { resetCurrentOrganizationId(); });

const invalidValues = [
  undefined, null, "", 0, 42, true, {}, [], ["second-company"],
  "ab", "-leading-dash", "UPPERCASE", "has space", "has/slash", "has.dot", "has_underscore",
  "a".repeat(64),
];

describe("current organization", () => {
  it("starts on the default organization", () => {
    expect(defaultOrganizationId).toBe("cleanflow-demo");
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
  });

  it("is set to a valid organization and reset to the default", () => {
    setCurrentOrganizationId("second-company");
    expect(currentOrganizationId()).toBe("second-company");
    resetCurrentOrganizationId();
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
  });

  it.each(invalidValues)("falls back to the default when set to %j", (value) => {
    setCurrentOrganizationId("second-company");
    setCurrentOrganizationId(value);
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
  });

  it("accepts identifiers of 3 to 63 lowercase letters, digits and dashes", () => {
    expect(isOrganizationId("abc")).toBe(true);
    expect(isOrganizationId("9-company")).toBe(true);
    expect(isOrganizationId("a".repeat(63))).toBe(true);
    for (const value of invalidValues) expect(isOrganizationId(value)).toBe(false);
  });
});

describe("organization from token claims", () => {
  it("uses the default when the account has no claim", () => {
    expect(organizationIdFromClaims(undefined)).toBe(defaultOrganizationId);
    expect(organizationIdFromClaims(null)).toBe(defaultOrganizationId);
    expect(organizationIdFromClaims({})).toBe(defaultOrganizationId);
    expect(organizationIdFromClaims({ role: "MANAGER" })).toBe(defaultOrganizationId);
  });

  it("uses a valid claim", () => {
    expect(organizationIdFromClaims({ organizationId: "second-company" })).toBe("second-company");
  });

  it.each(invalidValues)("uses the default for the invalid claim %j", (value) => {
    expect(organizationIdFromClaims({ organizationId: value })).toBe(defaultOrganizationId);
  });

  it("does not change the current organization by itself", () => {
    organizationIdFromClaims({ organizationId: "second-company" });
    expect(currentOrganizationId()).toBe(defaultOrganizationId);
  });
});

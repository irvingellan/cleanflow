import { describe, expect, it } from "vitest";
import { defaultOrganizationId, organizationIdForRequest } from "./organization.js";

const password = { firebase: { sign_in_provider: "password" } };
const request = (token) => ({ auth: { uid: "synthetic-account", token }, data: {} });

describe("organizationIdForRequest", () => {
  it("uses the default organization when the request has no account", () => {
    expect(defaultOrganizationId).toBe("cleanflow-demo");
    expect(organizationIdForRequest({})).toBe(defaultOrganizationId);
    expect(organizationIdForRequest({ auth: null })).toBe(defaultOrganizationId);
    expect(organizationIdForRequest({ auth: { uid: "synthetic-account" } })).toBe(defaultOrganizationId);
  });

  it("uses the default organization when the account has no claim", () => {
    expect(organizationIdForRequest(request(password))).toBe(defaultOrganizationId);
    expect(organizationIdForRequest(request({ ...password, organizationId: null }))).toBe(defaultOrganizationId);
    expect(organizationIdForRequest(request({ ...password, cleanerHub: {} }))).toBe(defaultOrganizationId);
  });

  it("selects the organization of a manager claim", () => {
    expect(organizationIdForRequest(request({ ...password, organizationId: "second-company" }))).toBe("second-company");
  });

  it("selects the organization of a cleaner claim", () => {
    const cleanerHub = { organizationId: "second-company", cleanerId: "cleaner-1", sessionId: "session-1" };
    expect(organizationIdForRequest(request({ firebase: { sign_in_provider: "custom" }, cleanerHub }))).toBe("second-company");
  });

  it("prefers the manager claim when a token carries both", () => {
    const token = { ...password, organizationId: "second-company", cleanerHub: { organizationId: "third-company" } };
    expect(organizationIdForRequest(request(token))).toBe("second-company");
  });

  it.each([
    42, true, "", "ab", "UPPERCASE", "has space", "has/slash", "../other", "has.dot", "-leading-dash",
    "a".repeat(64), {}, [], ["second-company"],
  ])("refuses the malformed claim %j instead of falling back", (claimed) => {
    for (const token of [{ ...password, organizationId: claimed }, { ...password, cleanerHub: { organizationId: claimed } }]) {
      expect(() => organizationIdForRequest(request(token))).toThrowError(
        expect.objectContaining({ code: "permission-denied", message: "Organization access is required." }),
      );
    }
  });

  it("never takes the organization from the request data", () => {
    const forged = { auth: { uid: "synthetic-account", token: password }, data: { organizationId: "second-company" } };
    expect(organizationIdForRequest(forged)).toBe(defaultOrganizationId);
  });
});

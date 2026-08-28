import { describe, expect, it } from "vitest";
import {
  developerUidsFromSecret,
  isAuthorizedDeveloper,
  requireAuthorizedDeveloper,
} from "./devCenterAuthorization.js";

const developerUid = "8RfIeVDCLqS8VyN9mcuWP7KCERc2";
const allowedUids = developerUidsFromSecret(`${developerUid}, second-developer-uid`);

describe("Dev Center UID authorization", () => {
  it("allows a configured authenticated UID", () => {
    const request = { auth: { uid: developerUid } };

    expect(isAuthorizedDeveloper(request, allowedUids)).toBe(true);
    expect(() => requireAuthorizedDeveloper(request, allowedUids)).not.toThrow();
  });

  it("denies an authenticated UID that is not configured", () => {
    expect(() => requireAuthorizedDeveloper({ auth: { uid: "other-uid" } }, allowedUids))
      .toThrow(expect.objectContaining({ code: "permission-denied" }));
  });

  it("denies a request with no authenticated user", () => {
    expect(() => requireAuthorizedDeveloper({}, allowedUids))
      .toThrow(expect.objectContaining({ code: "unauthenticated" }));
  });
});

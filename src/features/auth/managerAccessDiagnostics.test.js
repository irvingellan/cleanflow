import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordManagerAccessDiagnostic } from "./managerAccessDiagnostics.js";
import { managerPageClientMetadata } from "../telemetry/managerPageLoadService.js";

vi.mock("../telemetry/managerPageLoadService.js", () => ({ managerPageClientMetadata: vi.fn() }));

const storageKey = "cleanflow.manager-access.diagnostics";
const sessionId = "00112233-4455-6677-8899-aabbccddeeff";

function events() {
  return JSON.parse(sessionStorage.getItem(storageKey) || "[]");
}

describe("session-local manager access diagnostics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    managerPageClientMetadata.mockReturnValue({
      sessionId, browser: "safari", platform: "ios", deviceClass: "mobile",
      standalone: true, appVersion: "v0.9.3", deviceId: "private-device-id",
      uid: "private-user-id", email: "private@example.invalid", token: "private-token",
      membershipId: "private-membership-id", jobId: "private-job-id",
      connection: { effectiveType: "4g" }, viewport: { width: 390, height: 844 },
    });
  });

  it("records only allowed coarse fields without sharing or persisting private identifiers", () => {
    recordManagerAccessDiagnostic("verification_timeout", {
      attempt: 2, durationMs: 6500.3, reason: "timeout",
      uid: "unexpected-user", error: "raw error with secret", token: "unexpected-token",
    });

    expect(events()).toEqual([{
      stage: "verification_timeout", attempt: 2, durationMs: 6500,
      sessionId, browser: "safari", platform: "ios", deviceClass: "mobile",
      standalone: true, appVersion: "v0.9.3", reason: "timeout",
    }]);
    expect(managerPageClientMetadata.mock.calls[0][0]).not.toHaveProperty("localStorage");
    expect(sessionStorage.getItem(storageKey)).not.toMatch(/private|unexpected|secret|email|uid|deviceId|jobId|token|error/);
  });

  it("keeps only the latest 30 attempts and strips unknown fields from retained entries", () => {
    sessionStorage.setItem(storageKey, JSON.stringify([{
      stage: "auth_resolved", attempt: 0, uid: "sensitive", token: "sensitive",
      sessionId, browser: "safari", platform: "ios", deviceClass: "mobile",
    }]));
    for (let attempt = 1; attempt <= 35; attempt += 1) {
      recordManagerAccessDiagnostic("access_verification_started", { attempt });
    }
    expect(events()).toHaveLength(30);
    expect(events()[0].attempt).toBe(6);
    expect(events().at(-1).attempt).toBe(35);
    expect(sessionStorage.getItem(storageKey)).not.toMatch(/sensitive|uid|token/);
  });

  it("filters unknown stages/reasons and invalid metadata instead of retaining raw strings", () => {
    recordManagerAccessDiagnostic("arbitrary-secret-stage");
    expect(events()).toEqual([]);
    managerPageClientMetadata.mockReturnValue({
      sessionId: "someone@example.invalid", browser: "private browser details",
      platform: "private platform", appVersion: "private-build", deviceClass: "mobile",
    });
    recordManagerAccessDiagnostic("listener_error", { reason: "raw secret error", attempt: -1, durationMs: Infinity });
    expect(events()).toEqual([{
      stage: "listener_error", attempt: 0, durationMs: 0, reason: "unknown",
      browser: "other", platform: "other", deviceClass: "mobile", standalone: false,
    }]);
  });

  it("can recover a malformed local ring without affecting the gate", () => {
    sessionStorage.setItem(storageKey, "invalid JSON");
    expect(() => recordManagerAccessDiagnostic("auth_resolved")).not.toThrow();
    expect(events()).toHaveLength(1);
  });

  it("absorbs unavailable storage and metadata failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    expect(() => recordManagerAccessDiagnostic("verification_error", { reason: "unavailable" })).not.toThrow();
    managerPageClientMetadata.mockImplementation(() => { throw new Error("metadata unavailable"); });
    expect(() => recordManagerAccessDiagnostic("auth_resolved")).not.toThrow();
  });
});

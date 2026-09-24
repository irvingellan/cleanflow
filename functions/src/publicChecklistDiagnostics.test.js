import { describe, expect, it } from "vitest";
import {
  coarseChecklistClient,
  normalizePublicChecklistLoadDiagnostic,
} from "./publicChecklistDiagnostics.js";

const validEvent = {
  sessionId: "a".repeat(36),
  routeOpened: true,
  totalReadyMs: 1250,
  result: "error",
  capabilityResolutionMs: 40,
  capabilityResult: "active",
  draftLoadMs: 15,
  draftResult: "loaded",
  errorStage: "render",
  errorCode: "checklist_unavailable",
  deviceClass: "mobile",
};

describe("public checklist load diagnostic allowlist", () => {
  it("stores only aggregate timing and coarse request client metadata", () => {
    const event = normalizePublicChecklistLoadDiagnostic({
      ...validEvent,
    }, "Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1");

    expect(event).toEqual({
      event: "public_checklist_load",
      sessionId: "a".repeat(36),
      routeOpened: true,
      totalReadyMs: 1250,
      result: "error",
      capabilityResolutionMs: 40,
      capabilityResult: "active",
      draftLoadMs: 15,
      draftResult: "loaded",
      errorStage: "render",
      errorCode: "checklist_unavailable",
      browser: "safari",
      platform: "ios",
      deviceClass: "mobile",
    });
    expect(JSON.stringify(event)).not.toContain("answers");
    expect(JSON.stringify(event)).not.toContain("propertyName");
  });

  it("rejects unexpected fields so tokens and checklist data are never logged", () => {
    expect(normalizePublicChecklistLoadDiagnostic({ ...validEvent, rawToken: "must-never-be-logged" })).toBeNull();
    expect(normalizePublicChecklistLoadDiagnostic({ ...validEvent, answers: { item: "DONE" } })).toBeNull();
  });

  it("rejects malformed session identifiers and clamps malformed timings to null", () => {
    expect(normalizePublicChecklistLoadDiagnostic({ ...validEvent, sessionId: "token-value" })).toBeNull();
    expect(normalizePublicChecklistLoadDiagnostic({ ...validEvent, totalReadyMs: Number.MAX_SAFE_INTEGER }, "Chrome/120.0 Linux"))
      .toMatchObject({ totalReadyMs: null, browser: "chrome", platform: "linux", deviceClass: "mobile" });
  });

  it("classifies user agents without returning their raw content", () => {
    expect(coarseChecklistClient("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/130.0 Safari/537.36"))
      .toEqual({ browser: "chrome", platform: "macos", deviceClass: "desktop" });
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  buildPublicChecklistLoadDiagnostic,
  getPublicChecklistSessionId,
  publicChecklistClientClass,
  recordPublicChecklistLoadDiagnostic,
} from "./publicChecklistLoadDiagnostics.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("public checklist load diagnostics", () => {
  it("keeps one random session identifier in session storage without using the capability token", () => {
    const storage = memoryStorage();
    const environment = { crypto: { getRandomValues: (bytes) => bytes.fill(7) } };
    const first = getPublicChecklistSessionId({ storage, environment });
    const second = getPublicChecklistSessionId({ storage, environment });
    expect(first).toBe("07".repeat(18));
    expect(second).toBe(first);
    expect(first).not.toContain("raw-checklist-token");
  });

  it("classifies only coarse browser and platform values", () => {
    expect(publicChecklistClientClass({ userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1" }))
      .toEqual({ browser: "safari", platform: "ios", deviceClass: "mobile" });
  });

  it("sends a bounded diagnostic record without checklist data or bearer token and ignores failure", () => {
    const event = buildPublicChecklistLoadDiagnostic({
      sessionId: "a".repeat(36), totalReadyMs: 1250, result: "success",
      capabilityResolutionMs: 50, capabilityResult: "active", draftLoadMs: 20, draftResult: "loaded",
      client: { browser: "safari", platform: "ios", deviceClass: "mobile" },
    });
    const fetcher = vi.fn().mockRejectedValue(new Error("network"));
    recordPublicChecklistLoadDiagnostic(event, fetcher);
    const [path, request] = fetcher.mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(path).toBe("/api/public-checklist");
    expect(request.keepalive).toBe(true);
    expect(payload).toEqual({ action: "LOAD_DIAGNOSTIC", diagnostic: event });
    expect(JSON.stringify(payload)).not.toContain("opaque-capability");
    expect(JSON.stringify(payload)).not.toContain("checklistAnswers");
    expect(JSON.stringify(payload)).not.toContain("propertyName");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPublicChecklistPhotoUploadServerEvent,
  coarseChecklistClient,
  normalizePublicChecklistLoadDiagnostic,
  normalizePublicChecklistPhotoUploadDiagnostic,
  publicChecklistPhotoFileType,
  publicChecklistPhotoSizeBucket,
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

const validPhotoEvent = {
  sessionId: "a".repeat(36),
  requestId: "b".repeat(36),
  result: "error",
  durationMs: 2300,
  fileType: "jpeg",
  sizeBucket: "1_to_3mb",
  stage: "storage-write",
  errorCode: "storage_write_failed",
  deviceClass: "mobile",
};

describe("public checklist photo diagnostic allowlist", () => {
  it("accepts only bounded photo categories and coarse browser metadata", () => {
    expect(normalizePublicChecklistPhotoUploadDiagnostic(
      validPhotoEvent,
      "Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1",
    )).toEqual({
      event: "public_checklist_photo_upload",
      source: "client",
      sessionId: "a".repeat(36),
      requestId: "b".repeat(36),
      result: "error",
      durationMs: 2300,
      fileType: "jpeg",
      sizeBucket: "1_to_3mb",
      stage: "storage-write",
      errorCode: "storage_write_failed",
      browser: "safari",
      platform: "ios",
      deviceClass: "mobile",
    });
  });

  it.each([
    ["token", { rawToken: "never-log" }],
    ["filename", { filename: "private-photo.jpg" }],
    ["bytes", { bytes: "image bytes" }],
    ["property data", { propertyName: "private property" }],
    ["storage path", { storagePath: "private/path" }],
    ["preferred language", { preferredLanguage: "es" }],
  ])("rejects an unexpected %s field", (_label, extra) => {
    expect(normalizePublicChecklistPhotoUploadDiagnostic({ ...validPhotoEvent, ...extra })).toBeNull();
  });

  it("requires random correlation IDs and a known result", () => {
    expect(normalizePublicChecklistPhotoUploadDiagnostic({ ...validPhotoEvent, requestId: "bearer-token" })).toBeNull();
    expect(normalizePublicChecklistPhotoUploadDiagnostic({ ...validPhotoEvent, sessionId: "" })).toBeNull();
    expect(normalizePublicChecklistPhotoUploadDiagnostic({ ...validPhotoEvent, result: "pending" })).toBeNull();
  });

  it("normalizes unrecognized event categories without persisting raw values", () => {
    const event = normalizePublicChecklistPhotoUploadDiagnostic({
      ...validPhotoEvent,
      fileType: "image/jpeg",
      sizeBucket: 524288,
      stage: "firestore/organizations/private",
      errorCode: "permission denied for private path",
      durationMs: Number.MAX_SAFE_INTEGER,
    });
    expect(event).toMatchObject({ fileType: "unknown", sizeBucket: "unknown", stage: "unknown", errorCode: null, durationMs: null });
    expect(JSON.stringify(event)).not.toContain("private");
  });

  it.each([
    ["image/jpeg", "jpeg"], ["image/png", "png"], ["image/webp", "webp"],
    ["image/heic", "heic"], ["image/heif", "heif"], ["image/gif", "other"], [undefined, "unknown"],
  ])("coarsens MIME %s to %s", (contentType, expected) => {
    expect(publicChecklistPhotoFileType(contentType)).toBe(expected);
  });

  it.each([
    [0, "up_to_1mb"], [1024 * 1024, "up_to_1mb"], [1024 * 1024 + 1, "1_to_3mb"],
    [3 * 1024 * 1024, "1_to_3mb"], [3 * 1024 * 1024 + 1, "3_to_5mb"],
    [5 * 1024 * 1024, "3_to_5mb"], [5 * 1024 * 1024 + 1, "over_5mb"], [undefined, "unknown"],
  ])("buckets file size %s without preserving exact size", (size, expected) => {
    expect(publicChecklistPhotoSizeBucket(size)).toBe(expected);
  });

  it("builds a server event with only safe correlation and outcome fields", () => {
    const event = buildPublicChecklistPhotoUploadServerEvent({
      ...validPhotoEvent,
      result: "success",
      stage: "server-confirmed",
      errorCode: null,
    }, "Mozilla/5.0 (Linux; Android 14) Chrome/130.0");
    expect(event).toMatchObject({
      event: "public_checklist_photo_upload",
      source: "server",
      sessionId: "a".repeat(36),
      requestId: "b".repeat(36),
      result: "success",
      stage: "server-confirmed",
      browser: "chrome",
      platform: "android",
      deviceClass: "mobile",
    });
    expect(JSON.stringify(event)).not.toContain("token");
    expect(JSON.stringify(event)).not.toContain("storagePath");
  });
});

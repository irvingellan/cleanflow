import { describe, expect, it, vi } from "vitest";
import {
  buildPublicChecklistPhotoUploadDiagnostic,
  publicChecklistPhotoFileType,
  publicChecklistPhotoSizeBucket,
  recordPublicChecklistPhotoUploadDiagnostic,
} from "./publicChecklistLoadDiagnostics.js";

describe("public checklist photo diagnostics", () => {
  it("records only coarse type, size bucket, stage, result, and correlation metadata", () => {
    const event = buildPublicChecklistPhotoUploadDiagnostic({
      sessionId: "a".repeat(36),
      requestId: "b".repeat(36),
      result: "error",
      durationMs: 123.5,
      fileType: publicChecklistPhotoFileType("image/heic"),
      sizeBucket: publicChecklistPhotoSizeBucket(2 * 1024 * 1024),
      stage: "preflight",
      errorCode: "unsupported_type",
      client: { browser: "safari", platform: "ios", deviceClass: "mobile" },
    });
    expect(event).toEqual({
      sessionId: "a".repeat(36),
      requestId: "b".repeat(36),
      result: "error",
      durationMs: 124,
      fileType: "heic",
      sizeBucket: "1_to_3mb",
      stage: "preflight",
      errorCode: "unsupported_type",
      deviceClass: "mobile",
    });
  });

  it("sends a token-free fire-and-forget diagnostic and ignores transport failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
    const event = buildPublicChecklistPhotoUploadDiagnostic({
      sessionId: "a".repeat(36), requestId: "b".repeat(36), result: "error", durationMs: 9,
      fileType: "jpeg", sizeBucket: "up_to_1mb", stage: "request", errorCode: "network",
      client: { browser: "chrome", platform: "android", deviceClass: "mobile" },
    });

    expect(recordPublicChecklistPhotoUploadDiagnostic(event, fetcher)).toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/public-checklist", expect.objectContaining({
      method: "POST", credentials: "omit", keepalive: true,
    }));
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.action).toBe("PHOTO_UPLOAD_DIAGNOSTIC");
    expect(payload.diagnostic).toEqual(event);
    expect(JSON.stringify(payload)).not.toContain("capability-token");
    await Promise.resolve();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPublicChecklist,
  maximumChecklistEvidenceSizeBytes,
  publicChecklistRequestTimeoutMilliseconds,
  readyPublicChecklistForReview,
  savePublicChecklistDraft,
  uploadPublicChecklistEvidence,
  validateChecklistEvidenceFile,
} from "./checklistCapabilityService.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("public checklist requests", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts a %s file within the upload limit", (type) => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo", { type });
    expect(() => validateChecklistEvidenceFile(file)).not.toThrow();
  });

  it.each(["image/heic", "image/heif", ""])("rejects unsupported or missing file MIME %j", (type) => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo", { type });
    expect(() => validateChecklistEvidenceFile(file)).toThrowError(expect.objectContaining({
      code: "checklist_photo_invalid_type",
    }));
  });

  it("rejects oversized files before sending a request", () => {
    const file = new File([new Uint8Array(maximumChecklistEvidenceSizeBytes + 1)], "large.jpg", { type: "image/jpeg" });
    expect(() => validateChecklistEvidenceFile(file)).toThrowError(expect.objectContaining({
      code: "checklist_photo_too_large",
    }));
  });

  it("lets the cleaner retry the identical image after network and server failures", async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Network is unavailable"))
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "checklist_photo_unavailable" }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ evidence: [{ requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 3 }] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const request = { token: "opaque-token", requirementId: "living-belongings", file };

    await expect(uploadPublicChecklistEvidence(request)).rejects.toThrow("Network is unavailable");
    await expect(uploadPublicChecklistEvidence(request)).rejects.toMatchObject({ code: "checklist_photo_unavailable" });
    await expect(uploadPublicChecklistEvidence(request)).resolves.toMatchObject({
      evidence: [{ requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 3 }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ method: "PUT", credentials: "omit", body: file });
      expect(init.headers).toMatchObject({ "Content-Type": "image/jpeg", "X-CleanFlow-Checklist-Item": "living-belongings" });
    }
  });

  it("bounds a photo upload request that does not settle", async () => {
    vi.useFakeTimers();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" });
    const fetchMock = vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = uploadPublicChecklistEvidence({ token: "opaque-token", requirementId: "living-belongings", file });
    const timeoutExpectation = expect(request).rejects.toMatchObject({ code: "checklist_request_timeout", stage: "request" });
    await vi.advanceTimersByTimeAsync(publicChecklistRequestTimeoutMilliseconds);
    await timeoutExpectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds a non-settling public read instead of leaving the cleaner loading indefinitely", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = getPublicChecklist("opaque-token");
    const timeoutExpectation = expect(request).rejects.toMatchObject({ code: "checklist_request_timeout", stage: "request" });
    await vi.advanceTimersByTimeAsync(publicChecklistRequestTimeoutMilliseconds);

    await timeoutExpectation;
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("token=opaque-token"), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("keeps the request deadline active while reading a response body", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => new Promise(() => {}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = getPublicChecklist("opaque-token");
    const timeoutExpectation = expect(request).rejects.toMatchObject({ code: "checklist_request_timeout", stage: "response-parse" });
    await vi.advanceTimersByTimeAsync(publicChecklistRequestTimeoutMilliseconds);
    await timeoutExpectation;
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("token=opaque-token"), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("classifies an unreadable successful response as a response parsing error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("bad JSON"); } }));
    await expect(getPublicChecklist("opaque-token")).rejects.toMatchObject({
      code: "checklist_response_invalid",
      stage: "response-parse",
    });
  });

  it("uses the same deadline for a draft mutation without changing its caller-supplied mutation ID", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = savePublicChecklistDraft({
      token: "opaque-token",
      mutationId: "same-mutation-after-timeout",
      baseRevision: 1,
      changes: { generalNotes: "Keep this edit" },
    });
    const timeoutExpectation = expect(request).rejects.toMatchObject({ code: "checklist_request_timeout" });
    await vi.advanceTimersByTimeAsync(publicChecklistRequestTimeoutMilliseconds);

    await timeoutExpectation;
    expect(fetchMock).toHaveBeenCalledWith("/api/public-checklist", expect.objectContaining({
      body: expect.stringContaining("same-mutation-after-timeout"),
    }));
  });

  it("uses the same bounded public boundary for an idempotent review handoff", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = readyPublicChecklistForReview({
      token: "opaque-token", submissionId: "review-submission-0001", baseRevision: 3,
    });
    const timeoutExpectation = expect(request).rejects.toMatchObject({ code: "checklist_request_timeout" });
    await vi.advanceTimersByTimeAsync(publicChecklistRequestTimeoutMilliseconds);

    await timeoutExpectation;
    expect(fetchMock).toHaveBeenCalledWith("/api/public-checklist", expect.objectContaining({
      body: expect.stringContaining("READY_FOR_REVIEW"),
    }));
  });

  it("preserves actionable 422 requirements instead of treating them as link failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: "checklist_requirements_missing",
        requirements: { missingChecklistCount: 2, missingInventoryCount: 1, missingPhotoCount: 1 },
      }),
    }));
    await expect(readyPublicChecklistForReview({
      token: "opaque-token", submissionId: "review-submission-0001", baseRevision: 2,
    })).rejects.toMatchObject({
      code: "checklist_requirements_missing",
      status: 422,
      requirements: { missingChecklistCount: 2, missingInventoryCount: 1, missingPhotoCount: 1 },
    });
  });

  it("keeps conflicts and uncertain server failures distinct from invalid capabilities", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => { throw new Error("not JSON"); } })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => { throw new Error("not JSON"); } });
    vi.stubGlobal("fetch", fetchMock);
    const request = { token: "opaque-token", submissionId: "review-submission-0001", baseRevision: 2 };
    await expect(readyPublicChecklistForReview(request)).rejects.toMatchObject({ code: "checklist_conflict", status: 409 });
    await expect(readyPublicChecklistForReview(request)).rejects.toMatchObject({ code: "checklist_request_failed", status: 503 });
  });

  it("keeps confirmed invalid capabilities distinct from unreadable validation responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 410, json: async () => { throw new Error("not JSON"); } })
      .mockResolvedValueOnce({ ok: false, status: 422, json: async () => { throw new Error("not JSON"); } });
    vi.stubGlobal("fetch", fetchMock);
    const request = { token: "opaque-token", submissionId: "review-submission-0001", baseRevision: 2 };
    await expect(readyPublicChecklistForReview(request)).rejects.toMatchObject({ code: "checklist_unavailable", status: 410 });
    await expect(readyPublicChecklistForReview(request)).rejects.toMatchObject({ code: "checklist_response_invalid", status: 422 });
  });
});

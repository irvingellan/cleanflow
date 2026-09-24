import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPublicChecklist,
  publicChecklistRequestTimeoutMilliseconds,
  readyPublicChecklistForReview,
  savePublicChecklistDraft,
} from "./checklistCapabilityService.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("public checklist requests", () => {
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
});

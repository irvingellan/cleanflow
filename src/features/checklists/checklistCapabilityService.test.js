import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPublicChecklist,
  publicChecklistRequestTimeoutMilliseconds,
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
    const timeoutExpectation = expect(request).rejects.toMatchObject({ code: "checklist_request_timeout" });
    await vi.advanceTimersByTimeAsync(publicChecklistRequestTimeoutMilliseconds);

    await timeoutExpectation;
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("token=opaque-token"), expect.objectContaining({ signal: expect.any(AbortSignal) }));
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
});

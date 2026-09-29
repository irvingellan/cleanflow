import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clientReportRequestTimeoutMilliseconds,
  getPublicClientReport,
} from "./clientReportService.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("public client report request classification", () => {
  it.each([404, 410])("treats HTTP %s as a permanent unavailable link", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));

    await expect(getPublicClientReport("synthetic-token")).rejects.toMatchObject({
      code: "client_report_unavailable",
      retryable: false,
      status,
    });
  });

  it("treats a server failure as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(getPublicClientReport("synthetic-token")).rejects.toMatchObject({
      retryable: true,
      status: 503,
    });
  });

  it("treats a network failure and an invalid response as retryable", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error("Invalid JSON"); } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicClientReport("synthetic-token")).rejects.toMatchObject({ retryable: true });
    await expect(getPublicClientReport("synthetic-token")).rejects.toMatchObject({
      code: "client_report_response_invalid",
      retryable: true,
    });
  });

  it("treats a request timeout as retryable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));

    const request = getPublicClientReport("synthetic-token");
    const expectation = expect(request).rejects.toMatchObject({
      code: "client_report_timeout",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(clientReportRequestTimeoutMilliseconds);
    await expectation;
  });

  it("keeps the timeout active while reading the report response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => new Promise(() => {}),
    }));

    const request = getPublicClientReport("synthetic-token");
    const expectation = expect(request).rejects.toMatchObject({
      code: "client_report_timeout",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(clientReportRequestTimeoutMilliseconds);
    await expectation;
  });
});

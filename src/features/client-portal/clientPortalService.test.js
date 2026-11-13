import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicClientPortal } from "./clientPortalService.js";

vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => vi.fn()) }));
vi.mock("../../services/firebase/client.js", () => ({ functions: {} }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("portal reads across network suspension", () => {
  it("expires even when fetch never settles and ignores abort", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const read = getPublicClientPortal("fixture");
    const rejected = expect(read).rejects.toMatchObject({ retryable: true });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires a body that never finishes parsing", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) })));
    const rejected = expect(getPublicClientPortal("fixture")).rejects.toMatchObject({ retryable: true });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a late response when a suspended timer has not fired", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    let resolve;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((done) => { resolve = done; })));
    const read = getPublicClientPortal("fixture");
    vi.setSystemTime(now + 16_000);
    resolve({ ok: true, json: async () => ({ portal: { clientName: "Expired response" } }) });
    await expect(read).rejects.toMatchObject({ code: "client_report_timeout" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels promptly on unmount even if transport ignores abort", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const controller = new AbortController();
    const read = getPublicClientPortal("fixture", { signal: controller.signal });
    controller.abort();
    await expect(read).rejects.toMatchObject({ code: "client_report_cancelled" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps unavailable links permanent and requests uncached private responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 410 })));
    await expect(getPublicClientPortal("fixture")).rejects.toMatchObject({ retryable: false, status: 410 });
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
    }));
  });
});

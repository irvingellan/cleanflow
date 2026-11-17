import { describe, expect, it, vi } from "vitest";
import { guardEntryLoad } from "./entryLoadRecovery.js";

function target(shell = { renderFailed: vi.fn() }) {
  const events = new EventTarget();
  return Object.assign(events, shell ? { __cleanflowStartup: shell } : {});
}

describe("guardEntryLoad", () => {
  it("returns the loaded entry and stops listening for preload errors", async () => {
    const page = target();
    const entry = { default: () => null };
    await expect(guardEntryLoad(() => Promise.resolve(entry), page)).resolves.toBe(entry);
    page.dispatchEvent(new Event("vite:preloadError"));
    expect(page.__cleanflowStartup.renderFailed).not.toHaveBeenCalled();
  });

  it("hands a failed chunk to the startup shell once and keeps the entry pending", async () => {
    const page = target();
    let reject;
    const guarded = guardEntryLoad(() => new Promise((_, fail) => { reject = fail; }), page);
    const settled = vi.fn();
    guarded.then(settled, settled);
    page.dispatchEvent(new Event("vite:preloadError"));
    expect(page.__cleanflowStartup.renderFailed).toHaveBeenCalledTimes(1);
    reject(new TypeError("Failed to fetch dynamically imported module"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(page.__cleanflowStartup.renderFailed).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
  });

  it("reports a rejected import that raised no preload event", async () => {
    const page = target();
    guardEntryLoad(() => Promise.reject(new Error("missing chunk")), page);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(page.__cleanflowStartup.renderFailed).toHaveBeenCalledTimes(1);
  });

  it("rejects when no startup shell exists so the failure is not silent", async () => {
    const error = new Error("missing chunk");
    await expect(guardEntryLoad(() => Promise.reject(error), target(null))).rejects.toBe(error);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createSnapshotReader, publicFailure } from "./platformOwnerTools.js";

describe("developer snapshots", () => {
  it("coalesces concurrent reads, isolates keys, expires at one minute and supports explicit refresh", async () => {
    let time = Date.UTC(2026, 0, 1);
    const read = createSnapshotReader(() => time);
    const load = vi.fn(async () => ({ count: 1 }));
    const results = await Promise.all([read("overview", false, load), read("overview", true, load)]);
    expect(results[0]).toEqual(results[1]);
    expect(load).toHaveBeenCalledTimes(1);
    time += 59_999;
    expect(await read("overview", false, load)).toBe(results[0]);
    await read("org:demo", false, load);
    time++;
    await read("overview", false, load);
    await read("overview", true, load);
    expect(load).toHaveBeenCalledTimes(4);
  });
  it("allows recovery after a rejected read", async () => {
    const read = createSnapshotReader();
    await expect(read("overview", false, () => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    await expect(read("overview", false, async () => ({ ok: true }))).resolves.toHaveProperty("ok", true);
  });
});

it("projects only recognized event dimensions, without messages or identifying text", () => {
  const event = { page: "job-detail", operation: "issues", deviceClass: "mobile", appVersion: "v2.3.4",
    message: "fixture-private", errorCode: "fixture-private", createdAt: new Date(0) };
  expect(publicFailure(event, "operation")).toEqual({ kind: "operation", page: "job-detail", operation: "issues",
    deviceClass: "mobile", at: new Date(0).toISOString(), appVersion: "v2.3.4" });
  expect(publicFailure({ ...event, page: "fixture-private", deviceClass: "fixture-private", appVersion: "fixture-private" }, "page"))
    .toMatchObject({ page: null, operation: null, deviceClass: null, appVersion: null });
});

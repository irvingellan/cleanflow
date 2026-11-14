import { describe, expect, it, vi } from "vitest";
import { warmFunctions, warmIntervalMs } from "./functionWarmup.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

describe("warmFunctions", () => {
  it("wakes each function at most once per interval", async () => {
    const storage = memoryStorage();
    const run = vi.fn().mockResolvedValue({});
    expect(warmFunctions([["a", run], ["b", run]], { now: 1_000, storage })).toEqual(["a", "b"]);
    expect(warmFunctions([["a", run], ["b", run]], { now: 1_000 + warmIntervalMs - 1, storage })).toEqual([]);
    expect(warmFunctions([["a", run]], { now: 1_000 + warmIntervalMs, storage })).toEqual(["a"]);
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("ignores failures and missing storage", async () => {
    const failing = vi.fn(() => { throw new Error("offline"); });
    const rejecting = vi.fn().mockRejectedValue(new Error("cold"));
    expect(warmFunctions([["x", failing], ["y", rejecting]], { now: 5, storage: null })).toEqual(["x", "y"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failing).toHaveBeenCalled();
    expect(rejecting).toHaveBeenCalled();
  });
});

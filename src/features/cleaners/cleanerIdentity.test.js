import { describe, expect, it } from "vitest";
import { currentCleanerName } from "./cleanerIdentity.js";

describe("currentCleanerName", () => {
  it("prefers the current Cleaner name resolved by canonical ID", () => {
    expect(
      currentCleanerName("cleaner-1", "Legacy snapshot", { "cleaner-1": "Carla Perez" }, "Not provided"),
    ).toBe("Carla Perez");
  });

  it("falls back to the immutable snapshot when the Cleaner cannot be resolved", () => {
    expect(
      currentCleanerName("missing-cleaner", "Carla", {}, "Not provided"),
    ).toBe("Carla");
  });

  it("uses the caller fallback safely when legacy data has no ID or snapshot", () => {
    expect(currentCleanerName(undefined, undefined, {}, "Not provided")).toBe(
      "Not provided",
    );
  });
});

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// index.js only declares Functions. Everything a handler needs loads lazily,
// so a cold instance pays only for the Function it serves.
const allowedLocalModules = ["./runtime/params.js", "./runtime/lazy.js", "./managerReminders.js"];
const sourceOf = (file) => readFile(join(process.cwd(), "functions/src", file), "utf8");

describe("Functions index imports", () => {
  it("statically imports only firebase-functions and constants-only modules", async () => {
    const source = await sourceOf("index.js");
    const specifiers = [...source.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gm)].map(([, specifier]) => specifier);

    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier.startsWith("firebase-functions") || allowedLocalModules.includes(specifier), specifier).toBe(true);
    }
    for (const specifier of allowedLocalModules) {
      const moduleSource = await sourceOf(specifier);
      expect(moduleSource, specifier).not.toContain("firebase-admin");
    }
  });
});

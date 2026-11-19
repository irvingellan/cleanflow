import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { messages } from "./translations.js";

function fingerprint(language) {
  const entries = Object.entries(messages[language]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { keys: entries.length, sha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex") };
}

describe("message catalog", () => {
  it("keeps every key and text of every language", () => {
    expect({ en: fingerprint("en"), pt: fingerprint("pt"), es: fingerprint("es") }).toMatchInlineSnapshot(`
      {
        "en": {
          "keys": 1748,
          "sha256": "1f20f91146dc554e7d885d65b91a8a90f31ae207bbf750813378e9c04bddf67b",
        },
        "es": {
          "keys": 1748,
          "sha256": "2253faba6929d5e12fa3f81215189b4e7965547ed7d4c6e7dda88c3818fe7f57",
        },
        "pt": {
          "keys": 1748,
          "sha256": "00b1db95c1d94b89b8f92df429475c19825bfab8fe42b2d5b3dd0419d5afed01",
        },
      }
    `);
  });
});

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
          "keys": 1753,
          "sha256": "ea5158122525e8054879a6f53f1e82d6bcb6dfd8aee2d6ea5d0cbda5cdedfcab",
        },
        "es": {
          "keys": 1753,
          "sha256": "56bcbd9b57373ff6464ae7667ae10a7e6d839d070f4e943bce9eef6c459af8ac",
        },
        "pt": {
          "keys": 1753,
          "sha256": "4cede3651c11d4d1bfd64e63175b1b15cf57d9f451220dbc9c1e686db29cb531",
        },
      }
    `);
  });
});

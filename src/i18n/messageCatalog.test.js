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
          "keys": 1761,
          "sha256": "514af0be4c3d28e351105cd17d915edf3ed8b506a9d7d64f62910777c3cbcf33",
        },
        "es": {
          "keys": 1761,
          "sha256": "1494c3003212df9fe8e18707416ea0704d0fff31437195761968a4b1fcf0d6a7",
        },
        "pt": {
          "keys": 1761,
          "sha256": "a77caca360d5ea93408b4062fff3330c81937ef869ff5b445e33e987cea9c3b0",
        },
      }
    `);
  });
});

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
          "keys": 1749,
          "sha256": "66f821abd0740893e73d4cfc311a450a43417ea21fa4454737479893703d21d7",
        },
        "es": {
          "keys": 1749,
          "sha256": "e5e1e4d9fa1250addd74e3eac31b0cdf3a063d43984bc16ca39abddb3e1a235c",
        },
        "pt": {
          "keys": 1749,
          "sha256": "8e6ba79043a9d85c316137cf5485edd0f7eca0eba3a04547f76f7f7e35cf62cc",
        },
      }
    `);
  });
});

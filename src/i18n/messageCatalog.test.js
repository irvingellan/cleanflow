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
          "keys": 1686,
          "sha256": "41ce15f0cc825e961f3209eba88fb44b11c084575183c7374ad71bdcc82a281f",
        },
        "es": {
          "keys": 1686,
          "sha256": "e4da9e95f4170785290612106e2ef575687a7da2e23c40a1f4255b1ed38424e0",
        },
        "pt": {
          "keys": 1686,
          "sha256": "087ed43c027e5ecf466a95fd9ce08da1d32b35745304443090c7126429742372",
        },
      }
    `);
  });
});

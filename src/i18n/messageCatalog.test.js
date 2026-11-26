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
          "keys": 1775,
          "sha256": "8902f04bb306c3a759013ee867d058e0e918c2a536941eded98dcc697986d492",
        },
        "es": {
          "keys": 1775,
          "sha256": "76e819d90524c48a6bca0b4ff129b8e01b4f56c9b9eca3e9776ffe0f57b964c6",
        },
        "pt": {
          "keys": 1775,
          "sha256": "af04a4da9c057097ab513d8833d0def3398e57d3dca473961c928bf60f110750",
        },
      }
    `);
  });
});

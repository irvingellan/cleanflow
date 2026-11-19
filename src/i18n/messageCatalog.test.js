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
          "keys": 1743,
          "sha256": "fe3f0b544e8e0251d80154fd3385fe40ee8195106aa362274a11e4d369763f23",
        },
        "es": {
          "keys": 1743,
          "sha256": "374ff71055cc0c72286f029b2fb509461a1f9be5affb911594a6e61dd1bfcb37",
        },
        "pt": {
          "keys": 1743,
          "sha256": "4c245c74c93b0d8d1fc5fe20217f8d798ae0481f6d92509706c2afe91b860bdd",
        },
      }
    `);
  });
});

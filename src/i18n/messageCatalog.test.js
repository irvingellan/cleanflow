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
          "keys": 1742,
          "sha256": "c13da1e22c8e180fb913b3e5fbce8e8158c4133bc14899257534bae003cc904f",
        },
        "es": {
          "keys": 1742,
          "sha256": "fd9e27af7d4050c2c2a0675a12305895ff3b4f7d484325c4bd5ea6cf333d18b1",
        },
        "pt": {
          "keys": 1742,
          "sha256": "a493c9083166ace13cdb017c8ee5bbdef1d00fdbe376e1734984c99747daa493",
        },
      }
    `);
  });
});

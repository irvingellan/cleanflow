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
          "sha256": "b10d76b106a316a7657dc5d39f63c8365b543eae2531b6f0f22d4321fa70666e",
        },
        "es": {
          "keys": 1753,
          "sha256": "51c6f1328b5b0fd0f130bd6518f845da1401f1dffb078f5c086e6ef290b5d83c",
        },
        "pt": {
          "keys": 1753,
          "sha256": "bc68f05478be6ccf10113e1de3ac1555ee76a0cdb61fb96b39cbbfa04dbcac8e",
        },
      }
    `);
  });
});

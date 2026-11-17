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
          "keys": 1682,
          "sha256": "11b838205165d08b1748506b6bb80fb3507ef5eeae6ec02643e4da982f11d2fb",
        },
        "es": {
          "keys": 1682,
          "sha256": "75d72888d8747a0e4d07328123992270a68d5c583d00e7d7e7e7e7bd46a9c1ac",
        },
        "pt": {
          "keys": 1682,
          "sha256": "8d327079515777f80aa140df8d19f63f488a7e19ea8ca04b3f1972334e8fc3c3",
        },
      }
    `);
  });
});

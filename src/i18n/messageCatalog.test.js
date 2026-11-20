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
          "keys": 1750,
          "sha256": "48a1c00c857ee623a918aa6e5b29472e0558aa8e109d999e19755db6db8a3c45",
        },
        "es": {
          "keys": 1750,
          "sha256": "b701d60b9230d5d736717a315ba6607bdf64c3c19b52a758331bad0df362bbbd",
        },
        "pt": {
          "keys": 1750,
          "sha256": "3fa542636d6e68639c21168e9328978380f95cc7c3d4c6bc25a5d1f1f4e202c0",
        },
      }
    `);
  });
});

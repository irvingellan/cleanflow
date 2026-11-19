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
          "keys": 1794,
          "sha256": "6ad1dc5b1c87767f3a0035c4ff607d8112c8bf7f97e82a2a47ee7efea47b15d9",
        },
        "es": {
          "keys": 1794,
          "sha256": "dbee22af8bdf55f9c4eb6e1c01095d1c077de7280076510f12bcc7aa1fec469a",
        },
        "pt": {
          "keys": 1794,
          "sha256": "5d2a10e8e1b2f837bc517f608ca186fd80ece5763522598383f07cce593b58a3",
        },
      }
    `);
  });
});

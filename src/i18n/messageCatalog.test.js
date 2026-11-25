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
          "keys": 1767,
          "sha256": "7a347cf52b61af5199a0787f36ca74ae9d84de78784b6980cb444ea2b3e3eaa8",
        },
        "es": {
          "keys": 1767,
          "sha256": "619f83bc82d7787664bd1f14e2ad6f8095b7b602642a5af142cf08f746469361",
        },
        "pt": {
          "keys": 1767,
          "sha256": "b83998efd3e06668d0246850e62fe7b3483677747141848d37e2670667574cae",
        },
      }
    `);
  });
});

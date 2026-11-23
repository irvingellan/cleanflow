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
          "keys": 1754,
          "sha256": "9794319870370d0d291260426af9fb92d07d70a19cd3d6835b6d147a221dfae9",
        },
        "es": {
          "keys": 1754,
          "sha256": "469ca7e0f019d396ad4ce57e5af6834dc4ece78ec75575516de9c4d0cd3a3be1",
        },
        "pt": {
          "keys": 1754,
          "sha256": "23af9eb0aaa74443259bb62e5fe04e9c823ccfadb3110afe7538395187741560",
        },
      }
    `);
  });
});

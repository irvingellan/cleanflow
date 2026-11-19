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
          "keys": 1749,
          "sha256": "14458269e8baaf07d22ce12528888195ea1c2ffc77437369b9cae045f4b716ca",
        },
        "es": {
          "keys": 1749,
          "sha256": "f8859ef10b0bd516a492645d01f69fa3cf47bb852493a722d14a1984f95335f4",
        },
        "pt": {
          "keys": 1749,
          "sha256": "c47b1c139594a3abf09a350dbc989d7c92c36440ac77154bf21237fd4e33bee5",
        },
      }
    `);
  });
});

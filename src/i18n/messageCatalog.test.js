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
          "keys": 1761,
          "sha256": "91fc9de6a844bde24f160534c26b5f47e2c9b560d6e40468db1e32fdc90be006",
        },
        "es": {
          "keys": 1761,
          "sha256": "03263db41485379789d9598da861bcc3b0614ada86cebd9b742ad4c94f911980",
        },
        "pt": {
          "keys": 1761,
          "sha256": "f24c745fb6eff852ef16fd0a566aedcaed60e746a12f6da6a4330e4c73866770",
        },
      }
    `);
  });
});

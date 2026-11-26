import { describe, expect, it } from "vitest";
import { messages } from "./translations.js";

// Checks catalog completeness without a hash, so two PRs that add strings
// do not conflict: every language has the same keys and no empty text.
const languages = ["en", "pt", "es"];

describe("message catalog", () => {
  it("has the same keys in every language", () => {
    const [reference, ...others] = languages.map((language) => Object.keys(messages[language]).sort());
    for (const keys of others) expect(keys).toEqual(reference);
    expect(reference.length).toBeGreaterThan(1000);
  });

  it("has no empty text", () => {
    for (const language of languages) {
      const empty = Object.entries(messages[language])
        .filter(([, text]) => typeof text !== "string" || !text.trim())
        .map(([key]) => key);
      expect(empty, language).toEqual([]);
    }
  });
});

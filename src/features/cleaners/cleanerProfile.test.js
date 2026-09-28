import { describe, expect, it } from "vitest";
import {
  cleanerToForm,
  createEmptyCleanerForm,
  normalizeCleanerPreferredLanguage,
} from "./cleanerProfile.js";

describe("Cleaner profile normalization", () => {
  it("requires an explicit language choice instead of copying the manager UI language", () => {
    expect(createEmptyCleanerForm()).toEqual({
      name: "",
      phone: "",
      preferredLanguage: "",
      active: true,
      cityOrRegion: "",
      teamType: "",
      internalNotes: "",
      preferredPaymentMethod: "",
      paymentContact: "",
    });
  });

  it("normalizes missing legacy profile fields without retaining stale form data", () => {
    expect(cleanerToForm({ id: "legacy-cleaner", name: "Ingrid" })).toEqual({
      name: "Ingrid",
      phone: "",
      preferredLanguage: "",
      active: true,
      cityOrRegion: "",
      teamType: "",
      internalNotes: "",
      preferredPaymentMethod: "",
      paymentContact: "",
    });
  });

  it.each([
    ["en", "en"],
    ["pt", "pt"],
    ["es", "es"],
    [undefined, "en"],
    ["fr", "en"],
  ])("uses a deterministic English compatibility fallback for %s", (value, expected) => {
    expect(normalizeCleanerPreferredLanguage(value)).toBe(expected);
  });
});

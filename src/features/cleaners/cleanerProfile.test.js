import { describe, expect, it } from "vitest";
import { cleanerToForm, createEmptyCleanerForm } from "./cleanerProfile.js";

describe("Cleaner profile normalization", () => {
  it("creates a clean new Cleaner form using the manager language when supported", () => {
    expect(createEmptyCleanerForm("pt")).toEqual({
      name: "",
      phone: "",
      preferredLanguage: "pt",
      active: true,
      cityOrRegion: "",
      teamType: "",
      internalNotes: "",
      preferredPaymentMethod: "",
      paymentContact: "",
    });
  });

  it("normalizes missing legacy profile fields without retaining stale form data", () => {
    expect(cleanerToForm({ id: "legacy-cleaner", name: "Ingrid" }, "es")).toEqual({
      name: "Ingrid",
      phone: "",
      preferredLanguage: "es",
      active: true,
      cityOrRegion: "",
      teamType: "",
      internalNotes: "",
      preferredPaymentMethod: "",
      paymentContact: "",
    });
  });
});

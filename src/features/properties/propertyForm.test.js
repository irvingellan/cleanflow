import { describe, expect, it } from "vitest";
import { createEmptyPropertyForm, optionalPrice, optionalText } from "./propertyForm.js";

describe("Property form helpers", () => {
  it("creates a clean form when no Client is preselected", () => {
    expect(createEmptyPropertyForm()).toEqual({
      name: "",
      clientId: "",
      clientName: "",
      address: "",
      defaultClientPrice: "",
      defaultCleanerPrice: "",
      garageParking: "",
      cleanerInstructions: "",
      additionalNotes: "",
      keyCodeInfo: "",
      accessInstructions: "",
      active: true,
    });
  });

  it("uses the preselected Client name without changing other defaults", () => {
    expect(createEmptyPropertyForm({ id: "client-1", name: "Carl" })).toEqual({
      name: "",
      clientId: "client-1",
      clientName: "Carl",
      address: "",
      defaultClientPrice: "",
      defaultCleanerPrice: "",
      garageParking: "",
      cleanerInstructions: "",
      additionalNotes: "",
      keyCodeInfo: "",
      accessInstructions: "",
      active: true,
    });
  });

  it("keeps optional prices blank, valid, or invalid as distinct values", () => {
    expect(optionalPrice("")).toBeUndefined();
    expect(optionalPrice("0")).toBe(0);
    expect(optionalPrice("350.50")).toBe(350.5);
    expect(optionalPrice("-1")).toBeNull();
  });

  it("keeps optional operational text absent when left blank", () => {
    expect(optionalText("   ")).toBeUndefined();
    expect(optionalText(" Garage behind building ")).toBe("Garage behind building");
  });
});

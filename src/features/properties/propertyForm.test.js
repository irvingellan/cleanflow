import { describe, expect, it } from "vitest";
import { createEmptyPropertyForm, optionalPrice } from "./propertyForm.js";

describe("Property form helpers", () => {
  it("creates a clean form when no Client is preselected", () => {
    expect(createEmptyPropertyForm()).toEqual({
      name: "",
      clientName: "",
      defaultClientPrice: "",
      defaultCleanerPrice: "",
      active: true,
    });
  });

  it("uses the preselected Client name without changing other defaults", () => {
    expect(createEmptyPropertyForm({ id: "client-1", name: "Carl" })).toEqual({
      name: "",
      clientName: "Carl",
      defaultClientPrice: "",
      defaultCleanerPrice: "",
      active: true,
    });
  });

  it("keeps optional prices blank, valid, or invalid as distinct values", () => {
    expect(optionalPrice("")).toBeUndefined();
    expect(optionalPrice("0")).toBe(0);
    expect(optionalPrice("350.50")).toBe(350.5);
    expect(optionalPrice("-1")).toBeNull();
  });
});

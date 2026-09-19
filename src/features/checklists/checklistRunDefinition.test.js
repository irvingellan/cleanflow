import { describe, expect, it } from "vitest";
import { checklistSections, inventoryItems } from "./checklistDefinition.js";
import {
  buildChecklistRunSnapshot,
  projectChecklistRunForCleaner,
  resolveChecklistDefinition,
} from "./checklistRunDefinition.js";

const defaultItemCount = checklistSections.flatMap((section) => section.items).length;

describe("property-aware checklist definitions", () => {
  it("uses the complete validated global checklist when a Property has no settings", () => {
    const definition = resolveChecklistDefinition({ id: "property-1", name: "Example Property" });

    expect(definition.definitionVersion).toBe(1);
    expect(definition.sections.flatMap((section) => section.items)).toHaveLength(defaultItemCount);
    expect(definition.inventoryItems).toEqual(inventoryItems);
    expect(definition.requiredPhotoTypes).toEqual([]);
    expect(definition.cleanerInstructions).toBe("");
  });

  it("deterministically merges Property additions and allowed item overrides", () => {
    const definition = resolveChecklistDefinition({
      checklistSettings: {
        additionalChecklistItems: [
          {
            id: "kitchen-wine-glasses",
            sectionId: "kitchen",
            label: "Inspect wine glasses",
            requiresPhoto: true,
          },
        ],
        inventoryItems: [
          { id: "toilet-paper", label: "Bath tissue" },
          { id: "toilet-paper", label: "Guest bath tissue" },
          { id: "coffee-filters", label: "Coffee filters" },
        ],
        requiredPhotoTypes: [
          { id: "balcony", label: "Balcony photo", maximum: 2 },
        ],
        cleanerInstructions: "Please check the balcony before leaving.",
      },
    });

    const kitchen = definition.sections.find((section) => section.id === "kitchen");
    expect(kitchen.items).toContainEqual({
      id: "kitchen-wine-glasses",
      label: "Inspect wine glasses",
      requiresPhoto: true,
    });
    expect(definition.inventoryItems.find((item) => item.id === "toilet-paper")).toMatchObject({
      label: "Guest bath tissue",
    });
    expect(definition.inventoryItems.find((item) => item.id === "coffee-filters")).toEqual({
      id: "coffee-filters",
      label: "Coffee filters",
    });
    expect(definition.requiredPhotoTypes).toEqual([
      { id: "balcony", label: "Balcony photo", maximum: 2 },
    ]);
    expect(definition.cleanerInstructions).toBe("Please check the balcony before leaving.");
  });

  it("freezes an allowlisted Property configuration into a Run snapshot", () => {
    const property = {
      id: "property-1",
      name: "Example Property",
      accessCode: "must-not-leak",
      privateNotes: "manager-only",
      checklistSettings: {
        inventoryItems: [{ id: "coffee-filters", label: "Coffee filters" }],
        cleanerInstructions: "Lock the balcony door.",
      },
    };
    const snapshot = buildChecklistRunSnapshot({ job: { propertyId: "property-1" }, property });

    property.checklistSettings.cleanerInstructions = "Changed after Run creation.";
    property.checklistSettings.inventoryItems[0].label = "Changed item";

    expect(snapshot.propertyChecklistSettingsSnapshot.cleanerInstructions).toBe("Lock the balcony door.");
    expect(snapshot.resolvedDefinition.cleanerInstructions).toBe("Lock the balcony door.");
    expect(snapshot.resolvedDefinition.inventoryItems.find((item) => item.id === "coffee-filters")).toEqual({
      id: "coffee-filters",
      label: "Coffee filters",
    });
  });

  it("projects only the resolved cleaner-facing snapshot, never raw Property fields", () => {
    const snapshot = buildChecklistRunSnapshot({
      job: { propertyId: "property-1", propertyName: "Example Property" },
      property: {
        id: "property-1",
        name: "Example Property",
        accessCode: "must-not-leak",
        clientPrice: 300,
        privateNotes: "manager-only",
        checklistSettings: { cleanerInstructions: "Use the supplied cleaning products." },
      },
    });

    const projection = projectChecklistRunForCleaner(snapshot);

    expect(projection).toMatchObject({
      propertyName: "Example Property",
      cleanerInstructions: "Use the supplied cleaning products.",
    });
    expect(JSON.stringify(projection)).not.toContain("must-not-leak");
    expect(JSON.stringify(projection)).not.toContain("manager-only");
    expect(JSON.stringify(projection)).not.toContain("300");
  });
});

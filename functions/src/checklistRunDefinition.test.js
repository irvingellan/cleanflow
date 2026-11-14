import { describe, expect, it } from "vitest";
import { buildChecklistRunSnapshot, projectChecklistRunForCleaner, resolveChecklistDefinition } from "./checklistRunDefinition.js";

describe("cleaner checklist Property projection", () => {
  it("does not project abandoned Run content as an editable Draft", () => {
    const snapshot = buildChecklistRunSnapshot({
      job: { scheduledDate: "2026-09-29" },
      property: { name: "Example Property", checklistSettings: { cleanerInstructions: "Private instructions" } },
    });

    expect(projectChecklistRunForCleaner({ ...snapshot, status: "ABANDONED" }))
      .toEqual({ status: "ABANDONED" });
  });

  it("does not expose manager-only access fields", () => {
    const snapshot = buildChecklistRunSnapshot({
      job: { propertyId: "property-1", propertyName: "Example Property" },
      property: {
        id: "property-1",
        name: "Example Property",
        keyCodeInfo: "manager-only key details",
        accessInstructions: "manager-only entry instructions",
        checklistSettings: { cleanerInstructions: "Clean the patio." },
      },
    });

    const projection = projectChecklistRunForCleaner(snapshot, {
      assignedCleanerName: "Ana Example",
      assignedCleanerPreferredLanguage: "pt",
    });
    const serializedProjection = JSON.stringify(projection);

    expect(serializedProjection).not.toContain("keyCodeInfo");
    expect(serializedProjection).not.toContain("accessInstructions");
    expect(serializedProjection).not.toContain("manager-only");
    expect(projection.cleanerInstructions).toBe("Clean the patio.");
    expect(projection.assignedCleanerName).toBe("Ana Example");
    expect(projection.preferredLanguage).toBe("pt");
    expect(serializedProjection).not.toContain("email");
    expect(serializedProjection).not.toContain("Cleaner Run Raw Record");
  });

  it("bounds the public cleaner display name and omits blank values", () => {
    const snapshot = buildChecklistRunSnapshot({ job: {}, property: {} });
    expect(projectChecklistRunForCleaner(snapshot, { assignedCleanerName: ` ${"A".repeat(140)} ` }).assignedCleanerName)
      .toHaveLength(120);
    expect(projectChecklistRunForCleaner(snapshot, { assignedCleanerName: "   " }).assignedCleanerName).toBeNull();
  });

  it.each([["en"], ["pt"], ["es"]])("projects only the supported preferred language %s", (language) => {
    const snapshot = buildChecklistRunSnapshot({ job: {}, property: {} });
    const projection = projectChecklistRunForCleaner(snapshot, {
      assignedCleanerPreferredLanguage: language,
    });
    expect(projection.preferredLanguage).toBe(language);
    expect(Object.keys(projection)).not.toContain("cleanerPhone");
    expect(Object.keys(projection)).not.toContain("cleanerEmail");
  });

  it.each([[undefined], ["fr"], ["pt-BR"]])("omits missing or unsupported preferred language %s", (language) => {
    const snapshot = buildChecklistRunSnapshot({ job: {}, property: {} });
    expect(projectChecklistRunForCleaner(snapshot, {
      assignedCleanerPreferredLanguage: language,
    }).preferredLanguage).toBeNull();
  });
});

describe("FB07 property checklist edits", () => {
  const items = (definition, sectionId) => definition.sections.find((section) => section.id === sectionId).items;

  it("renames, hides, reorders and makes standard items optional for future Runs", () => {
    const definition = resolveChecklistDefinition({ checklistSettings: {
      itemOverrides: [
        { id: "bed-towels", label: "Toalhas dobradas na cama", order: 0 },
        { id: "bed-stains", hidden: true },
        { id: "bed-remake", canBeNotApplicable: true, order: 1 },
        { id: "unknown-item", label: "ignored" },
      ],
      additionalChecklistItems: [{ id: "bed-pillows", sectionId: "bedrooms", label: "Travesseiros extras", order: 2 }],
      inventoryItems: [{ id: "tea", hidden: true }, { id: "k-cups", label: "Cápsulas de café" }],
    } });
    const bedrooms = items(definition, "bedrooms");
    expect(bedrooms.map((item) => item.id)).toEqual(["bed-towels", "bed-remake", "bed-pillows"]);
    expect(bedrooms[0]).toEqual({ id: "bed-towels", label: "Toalhas dobradas na cama" });
    expect(bedrooms[1]).toMatchObject({ id: "bed-remake", canBeNotApplicable: true });
    expect(bedrooms.some((item) => "position" in item || "order" in item)).toBe(false);
    expect(definition.inventoryItems.some((item) => item.id === "tea")).toBe(false);
    expect(definition.inventoryItems.find((item) => item.id === "k-cups").label).toBe("Cápsulas de café");
  });

  it("keeps the required photo item and the standard order when nothing is edited", () => {
    const untouched = resolveChecklistDefinition({});
    const edited = resolveChecklistDefinition({ checklistSettings: { itemOverrides: [
      { id: "living-belongings", hidden: true, canBeNotApplicable: true, label: "Fotografe embaixo das camas" },
    ] } });
    const belongings = items(edited, "living-general").find((item) => item.id === "living-belongings");
    expect(belongings).toMatchObject({ requiresPhoto: true, label: "Fotografe embaixo das camas" });
    expect(belongings.canBeNotApplicable).toBeUndefined();
    expect(items(untouched, "kitchen").map((item) => item.id))
      .toEqual(["kitchen-surfaces", "kitchen-appliances", "kitchen-supplies", "kitchen-dishwasher", "kitchen-inventory"]);
  });

  it("freezes the edits in the Run snapshot so a later template change never rewrites it", () => {
    const property = { id: "p", name: "House", checklistSettings: { itemOverrides: [{ id: "bed-stains", hidden: true }] } };
    const snapshot = buildChecklistRunSnapshot({ job: { scheduledDate: "2026-11-10" }, property });
    property.checklistSettings.itemOverrides = [];
    expect(items(snapshot.resolvedDefinition, "bedrooms").some((item) => item.id === "bed-stains")).toBe(false);
    expect(snapshot.propertyChecklistSettingsSnapshot.itemOverrides).toEqual([{ id: "bed-stains", hidden: true }]);
  });

  it("FB06: lists the Property's photos to take for the cleaner", () => {
    const snapshot = buildChecklistRunSnapshot({ job: {}, property: { checklistSettings: {
      requiredPhotoTypes: [{ id: "under-beds", label: "Embaixo das camas" }, { id: "fridge", label: "Geladeira aberta" }],
    } } });
    expect(projectChecklistRunForCleaner({ status: "DRAFT", ...snapshot }).photoRequirements)
      .toEqual([{ id: "under-beds", label: "Embaixo das camas" }, { id: "fridge", label: "Geladeira aberta" }]);
  });

  it("uses the new stock defaults only in new Run snapshots and keeps matching Property overrides", () => {
    const oldInventory = [
      { id: "dish-soap", labelKey: "checklistPreview.dishSoap" },
      { id: "k-cups", labelKey: "checklistPreview.kCups" },
      { id: "tissues", labelKey: "checklistPreview.tissues" },
    ];
    const legacyRun = { definitionVersion: 1, resolvedDefinition: { definitionVersion: 1, inventoryItems: oldInventory } };
    const updatedProperty = { checklistSettings: { inventoryItems: [
      { id: "dish-soap", label: "Special dish detergent" },
      { id: "tea", hidden: true },
      { id: "extra", label: "Extra stock" },
    ] } };
    const newRun = buildChecklistRunSnapshot({ job: {}, property: updatedProperty });

    expect(newRun.definitionVersion).toBe(2);
    expect(resolveChecklistDefinition({}).inventoryItems.map(({ id }) => id)).toEqual([
      "hand-soap", "dish-soap", "dishwasher-pods", "dryer-sheets", "laundry-pods", "coffee", "tea",
      "paper-towels", "toilet-paper", "sponges", "large-trash-bags", "small-trash-bags", "shampoo", "conditioner", "body-wash",
    ]);
    expect(projectChecklistRunForCleaner(newRun).definitionVersion).toBe(2);
    expect(projectChecklistRunForCleaner(newRun).inventoryItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "dish-soap", label: "Special dish detergent" }),
      { id: "extra", label: "Extra stock" },
    ]));
    expect(projectChecklistRunForCleaner(newRun).inventoryItems.map(({ id }) => id)).not.toContain("tea");
    expect(projectChecklistRunForCleaner(legacyRun)).toMatchObject({ definitionVersion: 1, inventoryItems: oldInventory });
    expect(projectChecklistRunForCleaner({ resolvedDefinition: { inventoryItems: oldInventory } }))
      .toMatchObject({ definitionVersion: null, inventoryItems: oldInventory });
  });
});

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

describe("service types in Checklist Runs", () => {
  const property = { checklistSettings: {
    itemOverrides: [{ id: "living-belongings", label: "Under beds and furniture" }],
    additionalChecklistItems: [{ id: "custom-window", sectionId: "living-general", label: "Check window latches" }],
    inventoryItems: [{ id: "tea", hidden: true }],
    requiredPhotoTypes: [{ id: "balcony", label: "Balcony photo" }],
  } };

  it.each([
    [undefined, "STANDARD", undefined, 0],
    ["STANDARD", "STANDARD", undefined, 0],
    ["UNKNOWN", "STANDARD", undefined, 0],
    ["DEEP_CLEANING", "DEEP_CLEANING", "service-type-deep-cleaning", 4],
    ["MOVE_IN_OUT", "MOVE_IN_OUT", "service-type-move-in-out", 3],
    ["POST_CONSTRUCTION", "POST_CONSTRUCTION", "service-type-post-construction", 5],
  ])("resolves %s from the Property and appends the selected template", (input, type, sectionId, itemCount) => {
    const propertyDefinition = resolveChecklistDefinition(property);
    const snapshot = buildChecklistRunSnapshot({ job: { serviceType: input }, property });
    const { sections, ...details } = snapshot.resolvedDefinition;

    expect(snapshot.jobSnapshot.serviceType).toBe(type);
    expect({ ...details, sections: sections.slice(0, propertyDefinition.sections.length) }).toEqual(propertyDefinition);
    const extras = sections.slice(propertyDefinition.sections.length);
    if (sectionId) {
      expect(extras).toHaveLength(1);
      expect(extras[0]).toMatchObject({ id: sectionId, title: expect.any(String) });
      expect(extras[0].items).toHaveLength(itemCount);
      expect(extras[0].items.every((item) => item.label && item.labelKey && !item.requiresPhoto)).toBe(true);
    } else {
      expect(extras).toEqual([]);
    }
  });

  it("preserves existing Property items when their IDs collide with a type template", () => {
    const id = "service-type-post-construction-fine-dust";
    const source = { checklistSettings: { additionalChecklistItems: [
      { id, sectionId: "bedrooms", label: "Existing Property item" },
      { id: `${id}-2`, sectionId: "bedrooms", label: "Another Property item" },
    ] } };
    const { resolvedDefinition } = buildChecklistRunSnapshot({ job: { serviceType: "POST_CONSTRUCTION" }, property: source });
    const items = resolvedDefinition.sections.flatMap((section) => section.items);
    expect(items).toEqual(expect.arrayContaining([
      { id, label: "Existing Property item" },
      { id: `${id}-2`, label: "Another Property item" },
      expect.objectContaining({ id: `${id}-3`, labelKey: "serviceTypeChecklist.post-construction.fine-dust" }),
    ]));
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it("projects the stored type and definition after the Job changes, and leaves legacy sections intact", () => {
    const job = { serviceType: "POST_CONSTRUCTION" };
    const frozenRun = buildChecklistRunSnapshot({ job, property });
    job.serviceType = "MOVE_IN_OUT";
    const nextRun = buildChecklistRunSnapshot({ job, property });

    expect(projectChecklistRunForCleaner(frozenRun)).toMatchObject({
      serviceType: "POST_CONSTRUCTION", sections: frozenRun.resolvedDefinition.sections,
    });
    expect(frozenRun.resolvedDefinition.sections.at(-1).id).toBe("service-type-post-construction");
    expect(nextRun.resolvedDefinition.sections.at(-1).id).toBe("service-type-move-in-out");

    const sections = [{ id: "legacy", items: [{ id: "original-task", label: "Original task" }] }];
    expect(projectChecklistRunForCleaner({ definitionVersion: 1, resolvedDefinition: { sections } }))
      .toMatchObject({ serviceType: "STANDARD", definitionVersion: 1, sections });
  });
});

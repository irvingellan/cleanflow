import {
  checklistSections,
  inventoryItems,
  photoPlaceholderGroups,
} from "../checklists/checklistDefinition.js";

export { checklistSections, inventoryItems, photoPlaceholderGroups };

export const demoCleaningDetails = {
  cleaner: "Alex Rivera",
  property: "Cedar Grove Apartment",
  date: "2026-09-24",
};

export function createInitialChecklistState() {
  return Object.fromEntries(
    checklistSections.flatMap((section) =>
      section.items.map((item) => [item.id, { completed: false, notApplicable: false }]),
    ),
  );
}

export function createInitialInventoryState() {
  return Object.fromEntries(inventoryItems.map((item) => [item.id, "HIGH"]));
}

export function summarizeChecklist(checklistState, inventoryState) {
  const items = checklistSections.flatMap((section) => section.items);
  const notApplicableCount = items.filter((item) => checklistState[item.id]?.notApplicable).length;
  const completedCount = items.filter((item) => checklistState[item.id]?.completed).length;
  const applicableCount = items.length - notApplicableCount;
  const restockItemIds = inventoryItems
    .filter((item) => inventoryState[item.id] === "NEEDS_RESTOCK")
    .map((item) => item.id);

  return {
    completedCount,
    applicableCount,
    notApplicableCount,
    restockItemIds,
    photoRequiredCount: items.filter((item) => item.requiresPhoto).length,
    completedPhotoRequiredCount: items.filter(
      (item) => item.requiresPhoto && checklistState[item.id]?.completed,
    ).length,
  };
}

export const demoCleaningDetails = {
  cleaner: "Alex Rivera",
  property: "Cedar Grove Apartment",
  date: "2026-09-24",
};

export const checklistSections = [
  {
    id: "bedrooms",
    titleKey: "checklistPreview.bedrooms",
    items: [
      { id: "bed-remake", labelKey: "checklistPreview.bedRemake" },
      { id: "bed-stains", labelKey: "checklistPreview.bedStains" },
      { id: "bed-towels", labelKey: "checklistPreview.bedTowels" },
    ],
  },
  {
    id: "bathrooms",
    titleKey: "checklistPreview.bathrooms",
    items: [
      { id: "bathroom-sanitize", labelKey: "checklistPreview.bathroomSanitize" },
      { id: "bathroom-toilet-paper", labelKey: "checklistPreview.bathroomToiletPaper" },
      { id: "bathroom-toiletries", labelKey: "checklistPreview.bathroomToiletries" },
    ],
  },
  {
    id: "kitchen",
    titleKey: "checklistPreview.kitchen",
    items: [
      { id: "kitchen-surfaces", labelKey: "checklistPreview.kitchenSurfaces" },
      { id: "kitchen-appliances", labelKey: "checklistPreview.kitchenAppliances" },
      { id: "kitchen-supplies", labelKey: "checklistPreview.kitchenSupplies" },
      { id: "kitchen-dishwasher", labelKey: "checklistPreview.kitchenDishwasher" },
      { id: "kitchen-inventory", labelKey: "checklistPreview.kitchenInventory" },
    ],
  },
  {
    id: "living-general",
    titleKey: "checklistPreview.livingGeneral",
    items: [
      { id: "living-furniture", labelKey: "checklistPreview.livingFurniture" },
      { id: "living-tvs", labelKey: "checklistPreview.livingTvs" },
      { id: "living-remotes", labelKey: "checklistPreview.livingRemotes" },
      { id: "living-ac", labelKey: "checklistPreview.livingAc" },
      { id: "living-smells", labelKey: "checklistPreview.livingSmells" },
      {
        id: "living-belongings",
        labelKey: "checklistPreview.livingBelongings",
        requiresPhoto: true,
      },
      { id: "living-cigarette-butts", labelKey: "checklistPreview.livingCigaretteButts" },
      { id: "living-trash", labelKey: "checklistPreview.livingTrash" },
    ],
  },
  {
    id: "outdoor",
    titleKey: "checklistPreview.outdoor",
    items: [
      { id: "outdoor-inspect", labelKey: "checklistPreview.outdoorInspect" },
      { id: "outdoor-cigarette-butts", labelKey: "checklistPreview.outdoorCigaretteButts" },
      { id: "outdoor-pool", labelKey: "checklistPreview.outdoorPool", canBeNotApplicable: true },
      { id: "outdoor-grill", labelKey: "checklistPreview.outdoorGrill", canBeNotApplicable: true },
    ],
  },
  {
    id: "security-final",
    titleKey: "checklistPreview.securityFinal",
    items: [
      { id: "security-lock", labelKey: "checklistPreview.securityLock" },
      { id: "security-entry-lock", labelKey: "checklistPreview.securityEntryLock" },
      { id: "security-ac", labelKey: "checklistPreview.securityAc" },
      { id: "security-photos", labelKey: "checklistPreview.securityPhotos" },
      { id: "security-maintenance", labelKey: "checklistPreview.securityMaintenance" },
    ],
  },
];

export const inventoryItems = [
  { id: "hand-soap", labelKey: "checklistPreview.handSoap" },
  { id: "dish-soap", labelKey: "checklistPreview.dishSoap" },
  { id: "dishwasher-pods", labelKey: "checklistPreview.dishwasherPods" },
  { id: "dryer-sheets", labelKey: "checklistPreview.dryerSheets" },
  { id: "laundry-pods", labelKey: "checklistPreview.laundryPods" },
  { id: "k-cups", labelKey: "checklistPreview.kCups" },
  { id: "tea", labelKey: "checklistPreview.tea" },
  { id: "paper-towels", labelKey: "checklistPreview.paperTowels" },
  { id: "toilet-paper", labelKey: "checklistPreview.toiletPaper" },
  { id: "sponges", labelKey: "checklistPreview.sponges" },
  { id: "large-trash-bags", labelKey: "checklistPreview.largeTrashBags" },
  { id: "small-trash-bags", labelKey: "checklistPreview.smallTrashBags" },
  { id: "tissues", labelKey: "checklistPreview.tissues" },
];

export const photoPlaceholderGroups = [
  { id: "cleaning", titleKey: "checklistPreview.cleaningPhotos", maximum: 4 },
  { id: "damage", titleKey: "checklistPreview.damagePhotos", maximum: 3 },
];

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

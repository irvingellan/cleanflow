function section(id, title, items) {
  return {
    id: `service-type-${id}`,
    titleKey: `serviceTypeChecklist.${id}`,
    title,
    items: items.map(([key, label]) => ({
      id: `service-type-${id}-${key}`,
      labelKey: `serviceTypeChecklist.${id}.${key}`,
      label,
      canBeNotApplicable: true,
    })),
  };
}

// The literal English labels let older checklist clients render frozen Runs.
// Each template has the same section shape as a resolved Property checklist.
const templates = {
  STANDARD: [],
  // A touch-up uses the Property checklist only.
  AIRBNB_TOUCH_UP: [],
  DEEP_CLEANING: [section("deep-cleaning", "Deep cleaning", [
    ["buildup", "Remove built-up grease and grime"],
    ["bathroom", "Scrub bathroom grout and remove limescale"],
    ["baseboards", "Clean baseboards and high-touch surfaces"],
    ["behind-appliances", "Clean behind and under accessible appliances and furniture"],
  ])],
  MOVE_IN_OUT: [section("move-in-out", "Move-in / move-out", [
    ["cabinets", "Clean inside cabinets and drawers"],
    ["appliances", "Clean inside appliances"],
    ["baseboards-walls", "Clean baseboards and check walls"],
  ])],
  POST_CONSTRUCTION: [section("post-construction", "Post-construction cleaning", [
    ["fine-dust", "Remove fine dust from surfaces and corners"],
    ["paint-adhesives", "Check for and remove paint and adhesive residue"],
    ["windows-tracks", "Clean windows and tracks"],
    ["drains", "Check and clean drains"],
    ["filters-vents", "Check accessible filters and vents"],
  ])],
};

export function appendServiceTypeChecklistSections(propertySections, serviceType) {
  const extraSections = templates[serviceType];
  if (!extraSections.length) return propertySections;

  const takenIds = new Set(propertySections.flatMap(({ items }) => items.map(({ id }) => id)));
  return [...propertySections, ...extraSections.map((extraSection) => ({
    ...extraSection,
    items: extraSection.items.map((item) => {
      // Older Property settings can contain arbitrary custom IDs. Preserve
      // both items if one already uses an ID from the template.
      let id = item.id;
      for (let number = 2; takenIds.has(id); number += 1) id = `${item.id}-${number}`;
      takenIds.add(id);
      return { ...item, id };
    }),
  }))];
}

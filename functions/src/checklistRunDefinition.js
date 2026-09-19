import { globalChecklistDefinition } from "./checklistDefinition.js";

const allowedItemKeys = ["id", "label", "requiresPhoto", "canBeNotApplicable"];
const allowedInventoryKeys = ["id", "label"];
const allowedPhotoTypeKeys = ["id", "label", "maximum"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickAllowed(source, keys) {
  return Object.fromEntries(keys.flatMap((key) => {
    const value = source?.[key];
    if (key === "id" || key === "label") {
      const normalized = nonEmptyString(value);
      return normalized ? [[key, normalized]] : [];
    }
    if (key === "maximum") {
      return Number.isInteger(value) && value > 0 ? [[key, value]] : [];
    }
    return typeof value === "boolean" ? [[key, value]] : [];
  }));
}

function uniqueById(items) {
  return items.filter((item, index) =>
    items.findLastIndex((candidate) => candidate.id === item.id) === index,
  );
}

function normalizeAdditionalItems(items, sectionIds) {
  if (!Array.isArray(items)) return [];

  return uniqueById(items.flatMap((item) => {
    const sectionId = nonEmptyString(item?.sectionId);
    const normalized = pickAllowed(item, allowedItemKeys);
    return sectionId && sectionIds.has(sectionId) && normalized.id && normalized.label
      ? [{ ...normalized, sectionId }]
      : [];
  }));
}

function normalizeNamedItems(items, allowedKeys) {
  if (!Array.isArray(items)) return [];

  return uniqueById(items.flatMap((item) => {
    const normalized = pickAllowed(item, allowedKeys);
    return normalized.id && normalized.label ? [normalized] : [];
  }));
}

function lastValueById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function mergeItems(defaultItems, configuredItems) {
  const configuredById = lastValueById(configuredItems);
  const defaultIds = new Set(defaultItems.map((item) => item.id));

  return [
    ...defaultItems.map((item) => ({ ...item, ...(configuredById.get(item.id) || {}) })),
    ...configuredItems.filter((item) => !defaultIds.has(item.id)),
  ];
}

/**
 * Only explicitly cleaner-facing configuration is read from a Property. This
 * keeps access details and other manager-only Property fields out of Runs and
 * any future public Cleaner projection.
 */
export function normalizePropertyChecklistSettings(settings) {
  const sectionIds = new Set(globalChecklistDefinition.sections.map((section) => section.id));

  return {
    additionalChecklistItems: normalizeAdditionalItems(settings?.additionalChecklistItems, sectionIds),
    inventoryItems: normalizeNamedItems(settings?.inventoryItems, allowedInventoryKeys),
    requiredPhotoTypes: normalizeNamedItems(settings?.requiredPhotoTypes, allowedPhotoTypeKeys),
    cleanerInstructions: nonEmptyString(settings?.cleanerInstructions) || "",
  };
}

export function resolveChecklistDefinition(property) {
  const settings = normalizePropertyChecklistSettings(property?.checklistSettings);
  const defaultItemIds = new Set(
    globalChecklistDefinition.sections.flatMap((section) => section.items.map((item) => item.id)),
  );

  const sections = globalChecklistDefinition.sections.map((section) => ({
    ...clone(section),
    items: [
      ...clone(section.items),
      ...settings.additionalChecklistItems
        .filter((item) => item.sectionId === section.id && !defaultItemIds.has(item.id))
        .map(({ sectionId, ...item }) => item),
    ],
  }));

  return {
    definitionVersion: globalChecklistDefinition.definitionVersion,
    sections,
    inventoryItems: mergeItems(globalChecklistDefinition.inventoryItems, settings.inventoryItems),
    requiredPhotoTypes: mergeItems(globalChecklistDefinition.requiredPhotoTypes, settings.requiredPhotoTypes),
    cleanerInstructions: settings.cleanerInstructions,
  };
}

export function buildChecklistRunSnapshot({ job, property }) {
  const propertyChecklistSettingsSnapshot = normalizePropertyChecklistSettings(
    property?.checklistSettings,
  );
  const resolvedDefinition = resolveChecklistDefinition(property);

  return {
    definitionVersion: resolvedDefinition.definitionVersion,
    propertySnapshot: {
      propertyId: property?.id || job?.propertyId || null,
      propertyName: property?.name || job?.propertyName || null,
    },
    propertyChecklistSettingsSnapshot: clone(propertyChecklistSettingsSnapshot),
    resolvedDefinition: clone(resolvedDefinition),
  };
}

export function projectChecklistRunForCleaner(checklistRun) {
  const snapshot = checklistRun?.resolvedDefinition || {};

  return {
    definitionVersion: checklistRun?.definitionVersion || null,
    propertyName: checklistRun?.propertySnapshot?.propertyName || null,
    sections: clone(snapshot.sections || []),
    inventoryItems: clone(snapshot.inventoryItems || []),
    requiredPhotoTypes: clone(snapshot.requiredPhotoTypes || []),
    cleanerInstructions: snapshot.cleanerInstructions || "",
  };
}

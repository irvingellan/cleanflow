import { globalChecklistDefinition } from "./checklistDefinition.js";
import { pilotChecklistPhotoRequirementId } from "./checklistEvidenceDefinition.js";

const allowedItemKeys = ["id", "label", "requiresPhoto", "canBeNotApplicable", "order"];
const allowedInventoryKeys = ["id", "label", "hidden"];
// FB07: manager edits of the standard items, per Property, for future Runs only.
const allowedOverrideKeys = ["id", "label", "hidden", "canBeNotApplicable", "order"];
const allowedPhotoTypeKeys = ["id", "label", "maximum"];
const supportedCleanerLanguages = new Set(["en", "pt", "es"]);

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
    if (key === "order") {
      return Number.isInteger(value) && value >= 0 && value <= 999 ? [[key, value]] : [];
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

/** Named items, plus a standard inventory item hidden without a new label (FB07). */
function normalizeInventoryItems(items) {
  if (!Array.isArray(items)) return [];
  const standardIds = new Set(globalChecklistDefinition.inventoryItems.map((item) => item.id));
  return uniqueById(items.flatMap((item) => {
    const normalized = pickAllowed(item, allowedInventoryKeys);
    if (!normalized.id) return [];
    if (normalized.label) return [normalized];
    return standardIds.has(normalized.id) && normalized.hidden === true ? [{ id: normalized.id, hidden: true }] : [];
  }));
}

function normalizeItemOverrides(items) {
  if (!Array.isArray(items)) return [];
  const defaultIds = new Set(globalChecklistDefinition.sections.flatMap((section) => section.items.map((item) => item.id)));
  return uniqueById(items.flatMap((item) => {
    const normalized = pickAllowed(item, allowedOverrideKeys);
    if (!normalized.id || !defaultIds.has(normalized.id) || Object.keys(normalized).length < 2) return [];
    // The required photo item keeps its evidence contract: rename only.
    if (normalized.id === pilotChecklistPhotoRequirementId) {
      delete normalized.hidden;
      delete normalized.canBeNotApplicable;
    }
    return Object.keys(normalized).length > 1 ? [normalized] : [];
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
    itemOverrides: normalizeItemOverrides(settings?.itemOverrides),
    inventoryItems: normalizeInventoryItems(settings?.inventoryItems),
    requiredPhotoTypes: normalizeNamedItems(settings?.requiredPhotoTypes, allowedPhotoTypeKeys),
    cleanerInstructions: nonEmptyString(settings?.cleanerInstructions) || "",
  };
}

export function resolveChecklistDefinition(property) {
  const settings = normalizePropertyChecklistSettings(property?.checklistSettings);
  const defaultItemIds = new Set(
    globalChecklistDefinition.sections.flatMap((section) => section.items.map((item) => item.id)),
  );

  const overrides = new Map(settings.itemOverrides.map((override) => [override.id, override]));
  const sections = globalChecklistDefinition.sections.map((section) => {
    const standard = clone(section.items).flatMap((item, index) => {
      const override = overrides.get(item.id);
      if (override?.hidden === true) return [];
      const next = { ...item, position: override?.order ?? index };
      if (override?.label) {
        next.label = override.label;
        delete next.labelKey;
      }
      if (typeof override?.canBeNotApplicable === "boolean") next.canBeNotApplicable = override.canBeNotApplicable;
      return [next];
    });
    const additional = settings.additionalChecklistItems
      .filter((item) => item.sectionId === section.id && !defaultItemIds.has(item.id))
      .map(({ sectionId, ...item }, index) => ({ ...item, position: item.order ?? 100 + index }));
    return {
      ...clone(section),
      items: [...standard, ...additional]
        .map((item, index) => ({ item, index }))
        .sort((a, b) => a.item.position - b.item.position || a.index - b.index)
        .map(({ item: { position, order, ...item } }) => item),
    };
  });

  return {
    definitionVersion: globalChecklistDefinition.definitionVersion,
    sections,
    inventoryItems: mergeItems(globalChecklistDefinition.inventoryItems, settings.inventoryItems)
      .filter((item) => item.hidden !== true).map(({ hidden, ...item }) => item),
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
    jobSnapshot: {
      scheduledDate: typeof job?.scheduledDate === "string" ? job.scheduledDate : null,
      scheduledStart: typeof job?.scheduledStart === "string" ? job.scheduledStart : null,
    },
    propertyChecklistSettingsSnapshot: clone(propertyChecklistSettingsSnapshot),
    resolvedDefinition: clone(resolvedDefinition),
  };
}

export function projectChecklistRunForCleaner(checklistRun, {
  assignedCleanerName = null,
  assignedCleanerPreferredLanguage = null,
} = {}) {
  // A terminal Run must never be presented as an editable Draft, even if this
  // projection is called outside the usual capability-state guard.
  if (checklistRun?.status === "ABANDONED") return { status: "ABANDONED" };

  const snapshot = checklistRun?.resolvedDefinition || {};
  const readyForReviewAt = checklistRun?.readyForReviewAt?.toDate?.()?.toISOString() || null;
  const safeAssignedCleanerName = typeof assignedCleanerName === "string"
    ? assignedCleanerName.trim().slice(0, 120) || null
    : null;

  return {
    status: checklistRun?.status === "READY_FOR_REVIEW" ? "READY_FOR_REVIEW" : "DRAFT",
    readyForReviewAt,
    definitionVersion: checklistRun?.definitionVersion || null,
    ...(checklistRun?.evidencePolicy?.version === 2 ? { evidencePolicy: {
      version: 2, maxPhotos: checklistRun.evidencePolicy.maxPhotos, maxTotalBytes: checklistRun.evidencePolicy.maxTotalBytes,
    } } : {}),
    propertyName: checklistRun?.propertySnapshot?.propertyName || null,
    scheduledDate: checklistRun?.jobSnapshot?.scheduledDate || null,
    scheduledStart: checklistRun?.jobSnapshot?.scheduledStart || null,
    assignedCleanerName: safeAssignedCleanerName,
    preferredLanguage: supportedCleanerLanguages.has(assignedCleanerPreferredLanguage)
      ? assignedCleanerPreferredLanguage
      : null,
    sections: clone(snapshot.sections || []),
    inventoryItems: clone(snapshot.inventoryItems || []),
    requiredPhotoTypes: clone(snapshot.requiredPhotoTypes || []),
    // FB06: what to photograph at this Property, as frozen in this Run.
    photoRequirements: (snapshot.requiredPhotoTypes || [])
      .filter((type) => typeof type?.id === "string" && typeof type?.label === "string")
      .map(({ id, label }) => ({ id, label })),
    cleanerInstructions: snapshot.cleanerInstructions || "",
  };
}

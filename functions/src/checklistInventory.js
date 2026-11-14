export const checklistInventoryQuantityMax = 99;

const legacyLevels = Object.freeze(["LOW", "MEDIUM", "HIGH", "NEEDS_RESTOCK"]);
const currentLevels = Object.freeze(["HIGH", "MEDIUM", "LOW", "EMPTY"]);

export function checklistRunDefinitionVersion(run) {
  const version = run?.resolvedDefinition?.definitionVersion ?? run?.definitionVersion;
  return Number.isInteger(version) ? version : null;
}

export function checklistInventoryLevels(definitionVersion) {
  return definitionVersion === 2 ? currentLevels : legacyLevels;
}

export function supportsChecklistInventoryQuantity(definitionVersion, answer) {
  return definitionVersion === 2 && (answer === "LOW" || answer === "EMPTY");
}

export function validChecklistInventoryQuantity(quantity) {
  return Number.isInteger(quantity) && quantity >= 0 && quantity <= checklistInventoryQuantityMax;
}

export function checklistInventoryNeedsRestock(answer) {
  return answer === "LOW" || answer === "EMPTY" || answer === "NEEDS_RESTOCK";
}

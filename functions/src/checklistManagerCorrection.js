import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  checklistInventoryLevels,
  checklistRunDefinitionVersion,
  supportsChecklistInventoryQuantity,
  validChecklistInventoryQuantity,
} from "./checklistInventory.js";

/**
 * A manager can correct an answer a cleaner got wrong (for example a supply
 * marked as missing). The cleaner's saved draft is never rewritten: the
 * correction is a separate layer on the Run, with who made it and when, and it
 * can be undone. Manager views and the client report read the corrected value.
 */
const checklistAnswers = new Set(["DONE", "NOT_APPLICABLE"]);
const itemIdPattern = /^[A-Za-z0-9_-]{1,80}$/;

function definitionItem(run, kind, itemId) {
  const definition = run?.resolvedDefinition || {};
  if (kind === "inventory") return (definition.inventoryItems || []).find((item) => item?.id === itemId) || null;
  for (const section of definition.sections || []) {
    const found = (section?.items || []).find((item) => item?.id === itemId);
    if (found) return found;
  }
  return null;
}

function allowedAnswer(run, kind, item, answer) {
  if (kind === "inventory") return checklistInventoryLevels(checklistRunDefinitionVersion(run)).includes(answer);
  return checklistAnswers.has(answer) && (answer !== "NOT_APPLICABLE" || item.canBeNotApplicable === true);
}

function invalidCorrection() {
  return new HttpsError("invalid-argument", "Checklist correction request is invalid.");
}

function inventoryCorrectionInput(run, kind, value) {
  if (kind !== "inventory" || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).some((key) => key !== "level" && key !== "quantity")
    || !supportsChecklistInventoryQuantity(checklistRunDefinitionVersion(run), value.level)
    || !validChecklistInventoryQuantity(value.quantity)) throw invalidCorrection();
  return { answer: value.level, quantity: value.quantity };
}

/** The manager's correction for one item, or null when there is none or it is not valid for the Run. */
export function managerCorrection(run, kind, itemId) {
  const correction = run?.managerCorrections?.[kind]?.[itemId];
  const item = correction ? definitionItem(run, kind, itemId) : null;
  return item && allowedAnswer(run, kind, item, correction.answer) ? correction : null;
}

/** Answers as the manager left them: the cleaner's answers with corrections on top. */
export function applyManagerCorrections(run, answers = {}) {
  const checklistAnswers = { ...answers.checklistAnswers };
  const inventoryAnswers = { ...answers.inventoryAnswers };
  const inventoryQuantities = { ...answers.inventoryQuantities };
  const definitionVersion = checklistRunDefinitionVersion(run);
  for (const itemId of Object.keys(run?.managerCorrections?.checklist || {})) {
    const correction = managerCorrection(run, "checklist", itemId);
    if (correction) checklistAnswers[itemId] = correction.answer;
  }
  for (const itemId of Object.keys(run?.managerCorrections?.inventory || {})) {
    const correction = managerCorrection(run, "inventory", itemId);
    if (!correction) continue;
    inventoryAnswers[itemId] = correction.answer;
    if (supportsChecklistInventoryQuantity(definitionVersion, correction.answer)
      && validChecklistInventoryQuantity(correction.quantity)) {
      inventoryQuantities[itemId] = correction.quantity;
    } else {
      delete inventoryQuantities[itemId];
    }
  }
  return {
    checklistAnswers,
    inventoryAnswers,
    ...(definitionVersion === 2 ? { inventoryQuantities } : {}),
  };
}

export async function correctChecklistAnswerForManager(database, { organizationId, jobId, kind, itemId, answer, actorUid }) {
  if ((kind !== "checklist" && kind !== "inventory") || typeof itemId !== "string" || !itemIdPattern.test(itemId)
    || typeof actorUid !== "string" || !actorUid
    || (answer !== null && typeof answer !== "string" && typeof answer !== "object")) {
    throw invalidCorrection();
  }
  const runRef = database.doc(`organizations/${organizationId}/jobs/${jobId}/checklistRuns/initial`);
  return database.runTransaction(async (transaction) => {
    const run = (await transaction.get(runRef)).data();
    const item = run ? definitionItem(run, kind, itemId) : null;
    if (!item) throw new HttpsError("not-found", "Checklist item not found.");
    // While the cleaner is still filling the checklist, her answers are hers to change.
    if (run.status !== "READY_FOR_REVIEW") {
      throw new HttpsError("failed-precondition", "A checklist sent for review is required.");
    }
    const field = new FieldPath("managerCorrections", kind, itemId);
    if (answer === null) {
      transaction.update(runRef, field, FieldValue.delete());
      return { kind, itemId, corrected: false };
    }
    const corrected = typeof answer === "object" ? inventoryCorrectionInput(run, kind, answer) : { answer };
    if (!allowedAnswer(run, kind, item, corrected.answer)) throw invalidCorrection();
    transaction.update(runRef, field, { ...corrected, byUid: actorUid, at: FieldValue.serverTimestamp() });
    return { kind, itemId, corrected: true, ...corrected };
  });
}

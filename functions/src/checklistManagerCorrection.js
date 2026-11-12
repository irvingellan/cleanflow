import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * A manager can correct an answer a cleaner got wrong (for example a supply
 * marked as missing). The cleaner's saved draft is never rewritten: the
 * correction is a separate layer on the Run, with who made it and when, and it
 * can be undone. Manager views and the client report read the corrected value.
 */
const answersByKind = {
  checklist: new Set(["DONE", "NOT_APPLICABLE"]),
  inventory: new Set(["LOW", "MEDIUM", "HIGH", "NEEDS_RESTOCK"]),
};
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

function allowedAnswer(kind, item, answer) {
  if (!answersByKind[kind]?.has(answer)) return false;
  return !(kind === "checklist" && answer === "NOT_APPLICABLE" && item?.canBeNotApplicable !== true);
}

/** The manager's correction for one item, or null when there is none or it is not valid for the Run. */
export function managerCorrection(run, kind, itemId) {
  const correction = run?.managerCorrections?.[kind]?.[itemId];
  const item = correction ? definitionItem(run, kind, itemId) : null;
  return item && allowedAnswer(kind, item, correction.answer) ? correction : null;
}

/** Answers as the manager left them: the cleaner's answers with corrections on top. */
export function applyManagerCorrections(run, answers = {}) {
  const corrected = (kind, saved = {}) => {
    const result = { ...saved };
    for (const itemId of Object.keys(run?.managerCorrections?.[kind] || {})) {
      const correction = managerCorrection(run, kind, itemId);
      if (correction) result[itemId] = correction.answer;
    }
    return result;
  };
  return {
    checklistAnswers: corrected("checklist", answers.checklistAnswers),
    inventoryAnswers: corrected("inventory", answers.inventoryAnswers),
  };
}

export async function correctChecklistAnswerForManager(database, { organizationId, jobId, kind, itemId, answer, actorUid }) {
  if (!Object.hasOwn(answersByKind, kind) || typeof itemId !== "string" || !itemIdPattern.test(itemId)
    || typeof actorUid !== "string" || !actorUid || (answer !== null && typeof answer !== "string")) {
    throw new HttpsError("invalid-argument", "Checklist correction request is invalid.");
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
    if (!allowedAnswer(kind, item, answer)) throw new HttpsError("invalid-argument", "Checklist correction request is invalid.");
    transaction.update(runRef, field, { answer, byUid: actorUid, at: FieldValue.serverTimestamp() });
    return { kind, itemId, corrected: true, answer };
  });
}

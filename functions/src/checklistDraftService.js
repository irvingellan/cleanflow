import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export const currentChecklistDraftId = "current";
export const checklistDraftNoteLimit = 2000;
export const checklistDraftRequestLimit = 32_000;

const mutationIdPattern = /^[A-Za-z0-9_-]{16,128}$/;
const safeKeyPattern = /^(?!__proto__$|prototype$|constructor$)[A-Za-z0-9_-]{1,128}$/;
const checklistAnswerValues = new Set(["UNANSWERED", "DONE", "NOT_APPLICABLE"]);
const inventoryAnswerValues = new Set(["UNANSWERED", "LOW", "MEDIUM", "HIGH", "NEEDS_RESTOCK"]);

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function fail(message) {
  throw new HttpsError("invalid-argument", message);
}

function frozenItems(run) {
  return (run?.resolvedDefinition?.sections || []).flatMap((section) => section?.items || [])
    .filter((item) => typeof item?.id === "string" && safeKeyPattern.test(item.id));
}

function frozenInventory(run) {
  return (run?.resolvedDefinition?.inventoryItems || [])
    .filter((item) => typeof item?.id === "string" && safeKeyPattern.test(item.id));
}

export function virtualChecklistDraft(run) {
  return {
    revision: 0,
    checklistAnswers: Object.fromEntries(frozenItems(run).map((item) => [item.id, "UNANSWERED"])),
    inventoryAnswers: Object.fromEntries(frozenInventory(run).map((item) => [item.id, "UNANSWERED"])),
    issueNotes: "",
    generalNotes: "",
    updatedAt: null,
  };
}

export function normalizedChecklistDraft(run, draft) {
  const defaults = virtualChecklistDraft(run);
  if (!draft) return defaults;
  const revision = Number.isInteger(draft.revision) && draft.revision >= 0 ? draft.revision : 0;
  const checklistAnswers = { ...defaults.checklistAnswers };
  const inventoryAnswers = { ...defaults.inventoryAnswers };
  const checklistItemsById = new Map(frozenItems(run).map((item) => [item.id, item]));
  for (const [id, value] of Object.entries(draft.checklistAnswers || {})) {
    if (Object.hasOwn(checklistAnswers, id) && checklistAnswerValues.has(value)
      && (value !== "NOT_APPLICABLE" || checklistItemsById.get(id)?.canBeNotApplicable === true)) {
      checklistAnswers[id] = value;
    }
  }
  for (const [id, value] of Object.entries(draft.inventoryAnswers || {})) {
    if (Object.hasOwn(inventoryAnswers, id) && inventoryAnswerValues.has(value)) inventoryAnswers[id] = value;
  }
  return {
    revision,
    checklistAnswers,
    inventoryAnswers,
    issueNotes: typeof draft.issueNotes === "string" ? draft.issueNotes : "",
    generalNotes: typeof draft.generalNotes === "string" ? draft.generalNotes : "",
    updatedAt: draft.updatedAt || null,
  };
}

function validatePatchMap(value, allowedItems, allowedValues, canUseNotApplicable) {
  if (!plainObject(value)) fail("Draft answers must be an object.");
  if (Object.keys(value).length === 0) fail("Draft answers cannot be empty.");
  const itemById = new Map(allowedItems.map((item) => [item.id, item]));
  return Object.fromEntries(Object.entries(value).map(([id, answer]) => {
    if (!safeKeyPattern.test(id) || !itemById.has(id) || !allowedValues.has(answer)) {
      fail("Draft answer is invalid.");
    }
    if (answer === "NOT_APPLICABLE" && !canUseNotApplicable(itemById.get(id))) {
      fail("This checklist item cannot be marked not applicable.");
    }
    return [id, answer];
  }));
}

/** Validates only frozen Run IDs and values; caller-controlled fields never select domain context. */
export function normalizeChecklistDraftMutation(run, request) {
  if (!mutationIdPattern.test(request?.mutationId || "")) fail("Draft mutation ID is invalid.");
  if (!Number.isInteger(request?.baseRevision) || request.baseRevision < 0) fail("Draft revision is invalid.");
  if (!plainObject(request?.changes)) fail("Draft changes are invalid.");
  if (JSON.stringify(request).length > checklistDraftRequestLimit) fail("Draft request is too large.");
  const allowedChangeKeys = new Set(["checklistAnswers", "inventoryAnswers", "issueNotes", "generalNotes"]);
  const keys = Object.keys(request.changes);
  if (!keys.length || keys.some((key) => !allowedChangeKeys.has(key))) fail("Draft changes are invalid.");
  const mutation = { mutationId: request.mutationId, baseRevision: request.baseRevision, changes: {} };
  if (Object.hasOwn(request.changes, "checklistAnswers")) {
    mutation.changes.checklistAnswers = validatePatchMap(
      request.changes.checklistAnswers, frozenItems(run), checklistAnswerValues,
      (item) => item.canBeNotApplicable === true,
    );
  }
  if (Object.hasOwn(request.changes, "inventoryAnswers")) {
    mutation.changes.inventoryAnswers = validatePatchMap(
      request.changes.inventoryAnswers, frozenInventory(run), inventoryAnswerValues, () => false,
    );
  }
  for (const field of ["issueNotes", "generalNotes"]) {
    if (Object.hasOwn(request.changes, field)) {
      if (typeof request.changes[field] !== "string" || request.changes[field].length > checklistDraftNoteLimit) {
        fail("Draft note is invalid.");
      }
      mutation.changes[field] = request.changes[field];
    }
  }
  return mutation;
}

export function checklistDraftMutationHash(mutation) {
  return createHash("sha256").update(JSON.stringify(stable(mutation))).digest("hex");
}

/**
 * The review handoff only accepts an exact, already-saved draft revision. This
 * is deliberately smaller than a second submission payload: draft content has
 * already crossed the frozen-definition validation boundary during autosave.
 */
export function normalizeChecklistReadyForReviewRequest(request) {
  if (!mutationIdPattern.test(request?.submissionId || "")) fail("Checklist review submission ID is invalid.");
  if (!Number.isInteger(request?.baseRevision) || request.baseRevision < 0) {
    fail("Checklist review revision is invalid.");
  }
  return { submissionId: request.submissionId, baseRevision: request.baseRevision };
}

export function checklistReadyForReviewRequestHash(request) {
  return createHash("sha256").update(JSON.stringify(stable(request))).digest("hex");
}

/** Validates the persisted sparse draft again before it becomes read-only. */
export function assertChecklistDraftReadyForReview(run, draft) {
  const current = normalizedChecklistDraft(run, draft);
  if (!draft) return current;
  if (!Number.isInteger(draft.revision) || draft.revision < 0) fail("Checklist draft is invalid.");
  if (!plainObject(draft.checklistAnswers) || !plainObject(draft.inventoryAnswers)) {
    fail("Checklist draft is invalid.");
  }
  const checklistItemsById = new Map(frozenItems(run).map((item) => [item.id, item]));
  for (const [id, answer] of Object.entries(draft.checklistAnswers)) {
    if (!checklistItemsById.has(id) || !checklistAnswerValues.has(answer)
      || (answer === "NOT_APPLICABLE" && checklistItemsById.get(id).canBeNotApplicable !== true)) {
      fail("Checklist draft is invalid.");
    }
  }
  const inventoryItemsById = new Map(frozenInventory(run).map((item) => [item.id, item]));
  for (const [id, answer] of Object.entries(draft.inventoryAnswers)) {
    if (!inventoryItemsById.has(id) || !inventoryAnswerValues.has(answer)) fail("Checklist draft is invalid.");
  }
  for (const field of ["issueNotes", "generalNotes"]) {
    if (typeof draft[field] !== "string" || draft[field].length > checklistDraftNoteLimit) {
      fail("Checklist draft is invalid.");
    }
  }
  return current;
}

export function applyChecklistDraftMutation(run, draft, mutation) {
  const current = normalizedChecklistDraft(run, draft);
  return {
    revision: current.revision + 1,
    checklistAnswers: { ...current.checklistAnswers, ...(mutation.changes.checklistAnswers || {}) },
    inventoryAnswers: { ...current.inventoryAnswers, ...(mutation.changes.inventoryAnswers || {}) },
    issueNotes: Object.hasOwn(mutation.changes, "issueNotes") ? mutation.changes.issueNotes : current.issueNotes,
    generalNotes: Object.hasOwn(mutation.changes, "generalNotes") ? mutation.changes.generalNotes : current.generalNotes,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export function checklistDraftProgress(draft) {
  const checklist = Object.values(draft.checklistAnswers || {});
  const inventory = Object.values(draft.inventoryAnswers || {});
  return {
    checklist: {
      total: checklist.length,
      done: checklist.filter((value) => value === "DONE").length,
      notApplicable: checklist.filter((value) => value === "NOT_APPLICABLE").length,
      unanswered: checklist.filter((value) => value === "UNANSWERED").length,
    },
    inventory: {
      total: inventory.length,
      answered: inventory.filter((value) => value !== "UNANSWERED").length,
      needsRestock: inventory.filter((value) => value === "NEEDS_RESTOCK").length,
    },
  };
}

export function projectChecklistDraftForRead(run, draft) {
  const normalized = normalizedChecklistDraft(run, draft);
  const { updatedAt, ...safeDraft } = normalized;
  return {
    ...safeDraft,
    lastSavedAt: updatedAt?.toDate?.()?.toISOString() || null,
    progress: checklistDraftProgress(normalized),
  };
}

import { describe, expect, it } from "vitest";
import {
  applyChecklistDraftMutation,
  assertChecklistDraftReadyForReview,
  checklistDraftReviewRequirements,
  checklistDraftMutationHash,
  checklistReadyForReviewRequestHash,
  normalizeChecklistDraftMutation,
  normalizeChecklistReadyForReviewRequest,
  projectChecklistDraftForRead,
  virtualChecklistDraft,
} from "./checklistDraftService.js";

const run = {
  resolvedDefinition: {
    sections: [{ items: [
      { id: "normal" }, { id: "optional", canBeNotApplicable: true },
    ] }],
    inventoryItems: [{ id: "soap" }],
  },
};
const newRun = { ...run, resolvedDefinition: { ...run.resolvedDefinition, definitionVersion: 2 } };

function mutation(changes, target = run, baseRevision = 0) {
  return normalizeChecklistDraftMutation(target, {
    mutationId: "mutation-identifier-1", baseRevision, changes,
  });
}

describe("Checklist draft definition boundary", () => {
  it("provides virtual revision-zero defaults without requiring a persisted document", () => {
    expect(virtualChecklistDraft(run)).toMatchObject({
      revision: 0,
      checklistAnswers: { normal: "UNANSWERED", optional: "UNANSWERED" },
      inventoryAnswers: { soap: "UNANSWERED" },
      issueNotes: "", generalNotes: "",
    });
  });

  it("allows only frozen IDs and allowed N/A while preserving omitted fields", () => {
    const next = applyChecklistDraftMutation(run, null, mutation({
      checklistAnswers: { normal: "DONE", optional: "NOT_APPLICABLE" },
      issueNotes: "Needs a check",
    }));
    expect(next).toMatchObject({ revision: 1, checklistAnswers: { normal: "DONE", optional: "NOT_APPLICABLE" } });
    const later = applyChecklistDraftMutation(run, next, {
      ...mutation({ inventoryAnswers: { soap: "NEEDS_RESTOCK" } }), baseRevision: 1,
    });
    expect(later.checklistAnswers.normal).toBe("DONE");
    expect(later.issueNotes).toBe("Needs a check");
    expect(later.inventoryAnswers.soap).toBe("NEEDS_RESTOCK");
  });

  it("keeps intentional empty notes as an explicit clear", () => {
    const withNotes = applyChecklistDraftMutation(run, null, mutation({
      issueNotes: "A note to clear",
      generalNotes: "Another note",
    }));
    const cleared = applyChecklistDraftMutation(run, withNotes, {
      ...mutation({ issueNotes: "" }), baseRevision: 1,
    });
    expect(cleared.issueNotes).toBe("");
    expect(cleared.generalNotes).toBe("Another note");
  });

  it("rejects unknown IDs, forbidden N/A, unsafe fields, and oversized notes", () => {
    for (const changes of [
      { checklistAnswers: { unknown: "DONE" } },
      { checklistAnswers: { normal: "NOT_APPLICABLE" } },
      { inventoryAnswers: { __proto__: "LOW" } },
      { generalNotes: "x".repeat(2001) },
      { extra: "no" },
    ]) expect(() => mutation(changes)).toThrow();
  });

  it("derives manager-safe progress from persisted or virtual answers", () => {
    const draft = applyChecklistDraftMutation(run, null, mutation({ checklistAnswers: { normal: "DONE" } }));
    expect(projectChecklistDraftForRead(run, draft).progress).toEqual({
      checklist: { total: 2, done: 1, notApplicable: 0, unanswered: 1 },
      inventory: { total: 1, answered: 0, needsRestock: 0 },
    });
  });

  it("does not surface malformed persisted N/A state for a required frozen item", () => {
    const projected = projectChecklistDraftForRead(run, {
      revision: 4,
      checklistAnswers: { normal: "NOT_APPLICABLE", optional: "NOT_APPLICABLE" },
    });
    expect(projected.checklistAnswers).toEqual({ normal: "UNANSWERED", optional: "NOT_APPLICABLE" });
    expect(projected.updatedAt).toBeUndefined();
  });

  it("validates a frozen persisted draft before review and hashes an exact idempotency request", () => {
    const draft = applyChecklistDraftMutation(run, null, mutation({
      checklistAnswers: { normal: "DONE", optional: "NOT_APPLICABLE" },
      inventoryAnswers: { soap: "LOW" },
      issueNotes: "A saved note",
    }));
    expect(assertChecklistDraftReadyForReview(run, draft)).toMatchObject({ revision: 1 });
    const request = normalizeChecklistReadyForReviewRequest({
      submissionId: "review-submission-0001", baseRevision: 1,
    });
    expect(checklistReadyForReviewRequestHash(request)).toMatch(/^[a-f0-9]{64}$/);
    expect(() => assertChecklistDraftReadyForReview(run, {
      ...draft, checklistAnswers: { ...draft.checklistAnswers, unknown: "DONE" },
    })).toThrow();
    expect(() => normalizeChecklistReadyForReviewRequest({
      submissionId: "short", baseRevision: 1,
    })).toThrow();
  });

  it("requires every frozen checklist and inventory answer while allowing configured N/A", () => {
    const incomplete = checklistDraftReviewRequirements(run, applyChecklistDraftMutation(run, null, mutation({
      checklistAnswers: { normal: "DONE", optional: "NOT_APPLICABLE" },
      inventoryAnswers: { soap: "UNANSWERED" },
    })));
    expect(incomplete).toMatchObject({ missingChecklistCount: 0, missingInventoryCount: 1 });

    const complete = checklistDraftReviewRequirements(run, applyChecklistDraftMutation(run, null, mutation({
      checklistAnswers: { normal: "DONE", optional: "NOT_APPLICABLE" },
      inventoryAnswers: { soap: "LOW" },
    })));
    expect(complete).toMatchObject({ missingChecklistCount: 0, missingInventoryCount: 0 });
  });

  it("keeps the exact legacy mutation and draft shape while rejecting new stock fields", () => {
    const request = mutation({ inventoryAnswers: { soap: "NEEDS_RESTOCK" } });
    expect(request.changes).toEqual({ inventoryAnswers: { soap: "NEEDS_RESTOCK" } });
    expect(checklistDraftMutationHash(request))
      .toBe("f9c8ccd4bd483040690cb0099c0cb6c491ed17535709769d2ad8637fe02381a4");
    expect(projectChecklistDraftForRead(run, applyChecklistDraftMutation(run, null, request)))
      .not.toHaveProperty("inventoryQuantities");
    expect(() => mutation({ inventoryAnswers: { soap: "EMPTY" } })).toThrow("Draft answer is invalid");
    expect(() => mutation({ inventoryQuantities: { soap: 1 } })).toThrow("Draft changes are invalid");
    expect(() => mutation({ inventoryAnswers: { soap: "NEEDS_RESTOCK" } }, newRun)).toThrow("Draft answer is invalid");
  });

  it("accepts empty as complete, with an optional quantity saved and clearable independently", () => {
    const empty = applyChecklistDraftMutation(newRun, null, mutation({ inventoryAnswers: { soap: "EMPTY" } }, newRun));
    expect(checklistDraftReviewRequirements(newRun, empty).missingInventoryCount).toBe(0);
    const withQuantity = applyChecklistDraftMutation(newRun, empty, mutation({ inventoryQuantities: { soap: 0 } }, newRun, 1));
    expect(projectChecklistDraftForRead(newRun, withQuantity)).toMatchObject({
      inventoryAnswers: { soap: "EMPTY" },
      inventoryQuantities: { soap: 0 },
      progress: { inventory: { answered: 1, needsRestock: 1 } },
    });
    const cleared = applyChecklistDraftMutation(newRun, withQuantity, mutation({ inventoryQuantities: { soap: null } }, newRun, 2));
    expect(assertChecklistDraftReadyForReview(newRun, cleared).inventoryQuantities).toEqual({});
    const high = applyChecklistDraftMutation(newRun, withQuantity, mutation({ inventoryAnswers: { soap: "HIGH" } }, newRun, 2));
    expect(assertChecklistDraftReadyForReview(newRun, high).inventoryQuantities).toEqual({});
  });

  it("validates quantity shape, IDs, bounds and the effective level without mutating the latest revision", () => {
    for (const quantities of [[], { missing: 2 }, { soap: -1 }, { soap: 100 }, { soap: 1.5 }, { soap: "2" }]) {
      expect(() => mutation({ inventoryQuantities: quantities }, newRun)).toThrow("Inventory quantit");
    }
    const high = mutation({ inventoryAnswers: { soap: "HIGH" }, inventoryQuantities: { soap: 1 } }, newRun);
    expect(() => applyChecklistDraftMutation(newRun, null, high)).toThrow("Inventory quantity requires a low or empty level");
    const low = mutation({ inventoryAnswers: { soap: "LOW" }, inventoryQuantities: { soap: 99 } }, newRun);
    const saved = applyChecklistDraftMutation(newRun, null, low);
    expect(assertChecklistDraftReadyForReview(newRun, saved).inventoryQuantities).toEqual({ soap: 99 });
    const badSaved = { ...saved, inventoryQuantities: { soap: 100, missing: 1 } };
    expect(projectChecklistDraftForRead(newRun, badSaved).inventoryQuantities).toEqual({});
    expect(() => assertChecklistDraftReadyForReview(newRun, badSaved)).toThrow("Checklist draft is invalid");
  });
});

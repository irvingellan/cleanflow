import { describe, expect, it } from "vitest";
import {
  applyChecklistDraftMutation,
  assertChecklistDraftReadyForReview,
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

function mutation(changes) {
  return normalizeChecklistDraftMutation(run, {
    mutationId: "mutation-identifier-1", baseRevision: 0, changes,
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
});

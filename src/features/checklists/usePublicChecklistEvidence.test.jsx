import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getPublicChecklist: vi.fn(), savePublicChecklistDraft: vi.fn(), readyPublicChecklistForReview: vi.fn() }));
vi.mock("./checklistCapabilityService.js", () => api);
import { usePublicChecklistDraft } from "./usePublicChecklistDraft.js";
const draft = { revision: 0, checklistAnswers: {}, inventoryAnswers: {}, issueNotes: "", generalNotes: "" };
const initial = { status: "DRAFT", evidencePolicy: { version: 2, maxPhotos: 20 }, evidenceRevision: 0, evidence: [] };
const saved = [{ evidenceId: "safe-id", requirementId: "living-belongings" }];
beforeEach(() => { window.localStorage.clear(); vi.clearAllMocks(); api.getPublicChecklist.mockResolvedValue({ checklist: initial, draft }); });
describe("evidence-only editor merging", () => {
  it("rejects an earlier generation even when the token changes A to B to A", async () => {
    let oldResolve; let requests = 0;
    api.getPublicChecklist.mockImplementation((token) => token === "token-a" && ++requests === 1 ? new Promise((resolve) => { oldResolve = resolve; })
      : Promise.resolve({ checklist: { ...initial, propertyName: "Current synthetic property" }, draft: { ...draft, generalNotes: "Current notes" } }));
    const { result, rerender } = renderHook(({ token }) => usePublicChecklistDraft(token), { initialProps: { token: "token-a" } });
    rerender({ token: "token-b" });
    await waitFor(() => expect(result.current.draft?.generalNotes).toBe("Current notes"));
    rerender({ token: "token-a" });
    await waitFor(() => expect(result.current.saveState).toBe("SAVED"));
    await act(async () => oldResolve({ checklist: { ...initial, propertyName: "Old generation" }, draft: { ...draft, generalNotes: "Old generation" } }));
    expect(result.current.checklist.propertyName).toBe("Current synthetic property");
    expect(result.current.draft.generalNotes).toBe("Current notes");
  });
  it("does not combine an old token GET draft with the new token projection", async () => {
    let oldResolve; api.getPublicChecklist.mockImplementation((token) => token === "old-token" ? new Promise((resolve) => { oldResolve = resolve; })
      : Promise.resolve({ checklist: { ...initial, propertyName: "New synthetic property" }, draft: { ...draft, generalNotes: "New notes" } }));
    const { result, rerender } = renderHook(({ token }) => usePublicChecklistDraft(token), { initialProps: { token: "old-token" } });
    rerender({ token: "new-token" });
    await waitFor(() => expect(result.current.checklist?.propertyName).toBe("New synthetic property"));
    await act(async () => oldResolve({ checklist: { ...initial, propertyName: "Old synthetic property" }, draft: { ...draft, generalNotes: "Old notes" } }));
    expect(result.current.checklist.propertyName).toBe("New synthetic property");
    expect(result.current.draft.generalNotes).toBe("New notes");
  });
  it("preserves pending answer edits and newest evidence across old refresh and successful handoff", async () => {
    let finishSave; api.savePublicChecklistDraft.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    const { result } = renderHook(() => usePublicChecklistDraft("synthetic-token"));
    await waitFor(() => expect(result.current.saveState).toBe("SAVED"));
    act(() => result.current.queueChanges({ checklistAnswers: { bed: "DONE" } }));
    act(() => result.current.updateEvidence({ evidenceRevision: 3, evidence: saved }));
    act(() => result.current.updateEvidence({ evidenceRevision: 2, evidence: [] }));
    expect(result.current.draft.checklistAnswers.bed).toBe("DONE");
    expect(result.current.saveState).toBe("SAVING");
    expect(result.current.checklist.evidence).toEqual(saved);
    await act(async () => finishSave({ draft: { ...draft, revision: 1, checklistAnswers: { bed: "DONE" } } }));
    api.readyPublicChecklistForReview.mockResolvedValue({ checklist: { status: "READY_FOR_REVIEW" }, draft: { ...draft, revision: 1, checklistAnswers: { bed: "DONE" } } });
    await act(async () => result.current.submitForManagerReview());
    expect(result.current.checklist.evidenceRevision).toBe(3);
    expect(result.current.checklist.evidencePolicy.version).toBe(2);
    expect(result.current.checklist.evidence).toEqual(saved);
  });
  it("old GET cannot restore a required photo removed by a newer evidence revision", async () => {
    api.getPublicChecklist.mockResolvedValue({ checklist: { ...initial, evidenceRevision: 5, evidence: saved }, draft });
    const { result } = renderHook(() => usePublicChecklistDraft("synthetic-token"));
    await waitFor(() => expect(result.current.saveState).toBe("SAVED"));
    act(() => result.current.updateEvidence({ evidenceRevision: 6, evidence: [] }));
    await act(async () => result.current.retryLoad());
    expect(result.current.checklist.evidence).toEqual([]);
    expect(result.current.checklist.evidenceRevision).toBe(6);
  });
});

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { checklistDraftRecoveryStoragePrefix } from "./checklistDraftRecovery.js";

const mocks = vi.hoisted(() => ({
  getPublicChecklist: vi.fn(),
  readyPublicChecklistForReview: vi.fn(),
  savePublicChecklistDraft: vi.fn(),
  uploadPublicChecklistEvidence: vi.fn(),
  recordPublicChecklistLoadDiagnostic: vi.fn(),
}));
const {
  getPublicChecklist, readyPublicChecklistForReview, savePublicChecklistDraft, uploadPublicChecklistEvidence,
} = mocks;

vi.mock("./checklistCapabilityService.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getPublicChecklist: mocks.getPublicChecklist,
  readyPublicChecklistForReview: mocks.readyPublicChecklistForReview,
  savePublicChecklistDraft: mocks.savePublicChecklistDraft,
  uploadPublicChecklistEvidence: mocks.uploadPublicChecklistEvidence,
}));

vi.mock("./publicChecklistLoadDiagnostics.js", async (importOriginal) => ({
  ...(await importOriginal()),
  recordPublicChecklistLoadDiagnostic: mocks.recordPublicChecklistLoadDiagnostic,
}));

const { PublicChecklistPage } = await import("./PublicChecklistPage.jsx");
let acknowledgedDraft;

const frozenChecklist = {
  propertyName: "Example Property",
  scheduledDate: "2026-09-22",
  scheduledStart: "10:00",
  cleanerInstructions: "Use the frozen instructions.",
  sections: [{
    id: "bedroom",
    title: "Bedrooms",
    items: [
      { id: "bed", label: "Make the bed" },
      { id: "living-belongings", label: "Check under beds and furniture", requiresPhoto: true },
      { id: "pool", label: "Check the pool", canBeNotApplicable: true },
    ],
  }],
  inventoryItems: [{ id: "soap", label: "Hand soap" }],
  requiredPhotoTypes: [{ id: "final", label: "Final room" }],
};

function createDraft(overrides = {}) {
  return {
    revision: 0,
    checklistAnswers: { bed: "UNANSWERED", pool: "UNANSWERED", "living-belongings": "UNANSWERED" },
    inventoryAnswers: { soap: "UNANSWERED" },
    issueNotes: "",
    generalNotes: "",
    progress: {
      checklist: { total: 3, done: 0, unanswered: 3 },
      inventory: { total: 1, answered: 0, needsRestock: 0 },
    },
    ...overrides,
  };
}

function renderPage(token = "opaque-capability-token") {
  return render(<TranslationProvider><PublicChecklistPage token={token} /></TranslationProvider>);
}

function itemFieldset(label) {
  return screen.getByText(label).closest("fieldset");
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  window.localStorage.clear();
  acknowledgedDraft = createDraft();
  getPublicChecklist.mockReset();
  readyPublicChecklistForReview.mockReset();
  savePublicChecklistDraft.mockReset();
  uploadPublicChecklistEvidence.mockReset();
  mocks.recordPublicChecklistLoadDiagnostic.mockReset();
  getPublicChecklist.mockResolvedValue({ checklist: frozenChecklist, draft: createDraft() });
  savePublicChecklistDraft.mockImplementation(async ({ baseRevision, changes }) => {
    const revision = baseRevision + 1;
    acknowledgedDraft = createDraft({
      ...acknowledgedDraft,
      revision,
      checklistAnswers: { ...acknowledgedDraft.checklistAnswers, ...(changes.checklistAnswers || {}) },
      inventoryAnswers: { ...acknowledgedDraft.inventoryAnswers, ...(changes.inventoryAnswers || {}) },
      issueNotes: Object.hasOwn(changes, "issueNotes") ? changes.issueNotes : acknowledgedDraft.issueNotes,
      generalNotes: Object.hasOwn(changes, "generalNotes") ? changes.generalNotes : acknowledgedDraft.generalNotes,
    });
    return { revision, draft: acknowledgedDraft };
  });
  readyPublicChecklistForReview.mockImplementation(async ({ baseRevision }) => ({
    duplicate: false,
    checklist: { ...frozenChecklist, status: "READY_FOR_REVIEW", readyForReviewAt: "2026-09-22T18:00:00.000Z" },
    draft: createDraft({ revision: baseRevision }),
  }));
  uploadPublicChecklistEvidence.mockResolvedValue({ evidence: [{ requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 3 }] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PublicChecklistPage", () => {
  it("records one token-free load diagnostic after the checklist is ready", async () => {
    renderPage("secret-capability-token");
    expect(await screen.findByRole("heading", { name: "Cleaning checklist" })).toBeVisible();
    await waitFor(() => expect(mocks.recordPublicChecklistLoadDiagnostic).toHaveBeenCalledTimes(1));
    const event = mocks.recordPublicChecklistLoadDiagnostic.mock.calls[0][0];
    expect(event).toMatchObject({ routeOpened: true, result: "success", draftResult: "loaded" });
    expect(JSON.stringify(event)).not.toContain("secret-capability-token");
    expect(JSON.stringify(event)).not.toContain("checklistAnswers");
  });

  it("records a bounded error result when public loading fails", async () => {
    getPublicChecklist.mockRejectedValue({ code: "checklist_request_timeout" });
    renderPage();
    expect(await screen.findByText("Could not load the checklist right now. The link has not been confirmed invalid. Check your connection and try again.")).toBeVisible();
    await waitFor(() => expect(mocks.recordPublicChecklistLoadDiagnostic).toHaveBeenCalledTimes(1));
    expect(mocks.recordPublicChecklistLoadDiagnostic.mock.calls[0][0]).toMatchObject({
      routeOpened: true, result: "error", errorStage: "request", errorCode: "checklist_request_timeout",
    });
  });

  it("loads a virtual draft from the frozen projection and only offers N/A where allowed", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Cleaning checklist" })).toBeVisible();
    expect(within(itemFieldset("Make the bed")).queryByLabelText("Not applicable")).not.toBeInTheDocument();
    expect(within(itemFieldset("Check the pool")).getByLabelText("Not applicable")).toBeVisible();
    expect(screen.getByLabelText("Hand soap")).toHaveValue("UNANSWERED");
    expect(screen.getByText("Use the frozen instructions.")).toBeVisible();
    expect(savePublicChecklistDraft).not.toHaveBeenCalled();
    expect(screen.queryByText("Answer this item before sending for review.")).not.toBeInTheDocument();
    expect(screen.queryByText("Required photo is not saved yet.")).not.toBeInTheDocument();
  });

  it("shows localized assigned cleaner context without claiming who holds the link", async () => {
    getPublicChecklist.mockResolvedValue({ checklist: { ...frozenChecklist, assignedCleanerName: "Ana Example" }, draft: createDraft() });
    renderPage();

    expect(await screen.findByText("Assigned cleaner: Ana Example")).toBeVisible();
    expect(screen.queryByText("You are Ana Example")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "pt" } });
    expect(screen.getByText("Cleaner responsável: Ana Example")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Idioma"), { target: { value: "es" } });
    expect(screen.getByText("Cleaner responsable: Ana Example")).toBeVisible();
  });

  it("shows one mobile-safe required-photo control", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });
    expect(screen.getByText("Photo required")).toBeVisible();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose photo" })).toBeVisible();
    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveAttribute("capture", "environment");
    expect(inputs[1]).not.toHaveAttribute("capture");

  });

  it("does not advertise a future property photo requirement that this pilot slice cannot save", async () => {
    getPublicChecklist.mockResolvedValue({
      checklist: {
        ...frozenChecklist,
        sections: [{
          ...frozenChecklist.sections[0],
          items: [
            ...frozenChecklist.sections[0].items,
            { id: "property-photo", label: "Property-specific photo", requiresPhoto: true },
          ],
        }],
      },
      draft: createDraft(),
    });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });
    expect(within(itemFieldset("Property-specific photo")).queryByText("Photo required")).not.toBeInTheDocument();
  });

  it("keeps the saved photo read-only after handoff", async () => {
    getPublicChecklist.mockResolvedValue({
      checklist: { ...frozenChecklist, status: "READY_FOR_REVIEW", evidence: [{ requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 3 }] },
      draft: createDraft(),
    });
    renderPage();
    await screen.findAllByText("Ready for manager review");
    expect(screen.queryByRole("button", { name: "Take photo" })).not.toBeInTheDocument();
  });

  it("uploads the selected image only through the capability request", async () => {
    const createObjectUrl = vi.fn(() => "blob:photo");
    vi.stubGlobal("URL", { ...URL, createObjectURL: createObjectUrl, revokeObjectURL: vi.fn() });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "under-bed.jpg", { type: "image/jpeg" });
    const [cameraInput] = document.querySelectorAll('input[type="file"]');
    fireEvent.change(cameraInput, { target: { files: [file] } });
    await waitFor(() => expect(uploadPublicChecklistEvidence).toHaveBeenCalledWith({
      token: "opaque-capability-token", requirementId: "living-belongings", file,
    }));
    expect(await screen.findByText("Photo saved")).toBeVisible();
  });

  it("keeps a failed selected file for an explicit retry", async () => {
    uploadPublicChecklistEvidence
      .mockRejectedValueOnce({ code: "checklist_photo_unavailable" })
      .mockResolvedValueOnce({ evidence: [{ requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 3 }] });
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "under-bed.jpg", { type: "image/jpeg" });
    const [cameraInput] = document.querySelectorAll('input[type="file"]');
    fireEvent.change(cameraInput, { target: { files: [file] } });
    expect(await screen.findByText("Photo could not be saved. Try again.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry photo" }));
    await waitFor(() => expect(uploadPublicChecklistEvidence).toHaveBeenCalledTimes(2));
    expect(uploadPublicChecklistEvidence.mock.calls[1][0].file).toBe(file);
  });

  it("optimistically saves checklist and inventory choices through the capability API", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    await waitFor(() => expect(savePublicChecklistDraft).toHaveBeenCalledWith(expect.objectContaining({
      baseRevision: 0,
      changes: { checklistAnswers: { bed: "DONE" } },
    })));
    expect(within(itemFieldset("Make the bed")).getByLabelText("Done")).toBeChecked();

    fireEvent.change(screen.getByLabelText("Hand soap"), { target: { value: "NEEDS_RESTOCK" } });
    await waitFor(() => expect(savePublicChecklistDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      baseRevision: 1,
      changes: { inventoryAnswers: { soap: "NEEDS_RESTOCK" } },
    })));
  });

  it("debounces and persists a cleared note", async () => {
    getPublicChecklist.mockResolvedValue({ checklist: frozenChecklist, draft: createDraft({ issueNotes: "Old note" }) });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Damage, missing items, or maintenance issues"), { target: { value: "" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
      await vi.runAllTimersAsync();
    });
    expect(savePublicChecklistDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      baseRevision: 0,
      changes: { issueNotes: "" },
    }));
  });

  it("retries the exact pending mutation after an uncertain response without creating a second edit", async () => {
    savePublicChecklistDraft
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValueOnce({ duplicate: true, draft: createDraft({ revision: 1, checklistAnswers: { bed: "DONE", pool: "UNANSWERED" } }) });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    expect(await screen.findByText("Changes could not be saved yet")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(savePublicChecklistDraft).toHaveBeenCalledTimes(2));
    const [first, second] = savePublicChecklistDraft.mock.calls;
    expect(second[0].mutationId).toBe(first[0].mutationId);
    expect(second[0].baseRevision).toBe(0);
    expect(screen.getByText("Saved")).toBeVisible();
  });

  it("keeps the exact mutation for a timed-out save before an explicit retry", async () => {
    savePublicChecklistDraft
      .mockRejectedValueOnce({ code: "checklist_request_timeout" })
      .mockResolvedValueOnce({
        duplicate: true,
        revision: 1,
        draft: createDraft({ revision: 1, checklistAnswers: { bed: "DONE", pool: "UNANSWERED" } }),
      });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    expect(await screen.findByText("Changes could not be saved yet")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(savePublicChecklistDraft).toHaveBeenCalledTimes(2));
    expect(savePublicChecklistDraft.mock.calls[1][0].mutationId)
      .toBe(savePublicChecklistDraft.mock.calls[0][0].mutationId);
  });

  it("shows a conflict without silently overwriting local or server state", async () => {
    savePublicChecklistDraft.mockRejectedValueOnce({ code: "checklist_conflict", status: 409 });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    expect(await screen.findByText("Conflict — review changes")).toBeVisible();
    expect(screen.getByText("Your local changes are still on this phone. Choose which version to keep.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Keep and reapply my changes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload saved version" })).toBeVisible();
    expect(within(itemFieldset("Make the bed")).getByLabelText("Done")).toBeChecked();
    expect(savePublicChecklistDraft).toHaveBeenCalledTimes(1);
  });

  it("does not replay queued local edits when the acknowledged response contains a newer server revision", async () => {
    const firstSave = deferred();
    savePublicChecklistDraft.mockReturnValueOnce(firstSave.promise);
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    fireEvent.change(screen.getByLabelText("Hand soap"), { target: { value: "LOW" } });
    expect(savePublicChecklistDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.resolve({
        duplicate: true,
        revision: 1,
        draft: createDraft({ revision: 2, checklistAnswers: { bed: "DONE", pool: "UNANSWERED" } }),
      });
    });

    expect(await screen.findByText("Conflict — review changes")).toBeVisible();
    expect(savePublicChecklistDraft).toHaveBeenCalledTimes(1);
  });

  it("lets the cleaner explicitly reload or reapply preserved changes after a conflict", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    savePublicChecklistDraft.mockRejectedValueOnce({ code: "checklist_conflict", status: 409 });
    getPublicChecklist.mockResolvedValueOnce({
      checklist: frozenChecklist,
      draft: createDraft({ revision: 1, checklistAnswers: { bed: "UNANSWERED", pool: "UNANSWERED" } }),
    });
    savePublicChecklistDraft.mockResolvedValueOnce({
      duplicate: false,
      revision: 2,
      draft: createDraft({ revision: 2, checklistAnswers: { bed: "DONE", pool: "UNANSWERED" } }),
    });

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    await screen.findByText("Conflict — review changes");
    fireEvent.click(screen.getByRole("button", { name: "Keep and reapply my changes" }));

    await waitFor(() => expect(savePublicChecklistDraft).toHaveBeenCalledTimes(2));
    expect(savePublicChecklistDraft.mock.calls[1][0]).toMatchObject({
      baseRevision: 1,
      changes: { checklistAnswers: { bed: "DONE" } },
    });
    expect(screen.getByText("Saved")).toBeVisible();

    savePublicChecklistDraft.mockRejectedValueOnce({ code: "checklist_conflict", status: 409 });
    getPublicChecklist.mockResolvedValueOnce({
      checklist: frozenChecklist,
      draft: createDraft({ revision: 3, checklistAnswers: { bed: "UNANSWERED", pool: "UNANSWERED" } }),
    });
    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Not answered"));
    await screen.findByText("Conflict — review changes");
    fireEvent.click(screen.getByRole("button", { name: "Reload saved version" }));
    await waitFor(() => expect(within(itemFieldset("Make the bed")).getByLabelText("Not answered")).toBeChecked());
  });

  it("warns when local recovery cannot be saved while an online save remains pending", async () => {
    const pendingSave = deferred();
    savePublicChecklistDraft.mockReturnValueOnce(pendingSave.promise);
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(key, value) {
      if (String(key).startsWith(checklistDraftRecoveryStoragePrefix)) throw new Error("storage unavailable");
      return originalSetItem.call(this, key, value);
    });
    vi.stubGlobal("crypto", {
      subtle: { digest: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer) },
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    expect(await screen.findByText("Local recovery is unavailable. Unsaved edits may be lost if this page closes.")).toBeVisible();
    expect(savePublicChecklistDraft).toHaveBeenCalledTimes(1);
  });

  it("settles as unavailable when an otherwise valid link is revoked after load", async () => {
    savePublicChecklistDraft.mockRejectedValueOnce({ code: "checklist_unavailable", status: 410 });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    expect(await screen.findByText("Link unavailable")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save now" })).not.toBeInTheDocument();
  });

  it("does not keep retrying when a capability is revoked after an uncertain save", async () => {
    savePublicChecklistDraft
      .mockRejectedValueOnce({ code: "checklist_request_timeout" })
      .mockRejectedValueOnce({ code: "checklist_unavailable", status: 410 });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    await screen.findByText("Changes could not be saved yet");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Link unavailable")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(savePublicChecklistDraft).toHaveBeenCalledTimes(2);
  });

  it("reconciles a pending local edit only after the same capability resolves", async () => {
    vi.stubGlobal("crypto", {
      subtle: { digest: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer) },
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
    window.localStorage.setItem(`${checklistDraftRecoveryStoragePrefix}AQID`, JSON.stringify({
      pendingMutation: {
        mutationId: "recovery-mutation-1",
        baseRevision: 0,
        changes: { generalNotes: "Recovered safely" },
      },
      queuedChanges: {},
      updatedAt: Date.now(),
    }));
    savePublicChecklistDraft.mockResolvedValueOnce({
      duplicate: true,
      draft: createDraft({ revision: 1, generalNotes: "Recovered safely" }),
    });
    renderPage();

    await waitFor(() => expect(savePublicChecklistDraft).toHaveBeenCalledWith(expect.objectContaining({
      mutationId: "recovery-mutation-1",
      changes: { generalNotes: "Recovered safely" },
    })));
    expect(screen.getByLabelText("Other notes")).toHaveValue("Recovered safely");
  });

  it("renders saving controls in Portuguese and Spanish", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "pt" } });
    fireEvent.change(screen.getByLabelText("Danos, itens faltando ou problemas de manutenção"), { target: { value: "nota" } });
    expect(screen.getByRole("button", { name: "Salvar agora" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Idioma"), { target: { value: "es" } });
    expect(screen.getByRole("button", { name: "Guardar ahora" })).toBeVisible();
  });

  it("localizes the cleaner review action in English, Portuguese, and Spanish", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });
    expect(screen.getByRole("button", { name: "Send checklist for review" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "pt" } });
    expect(screen.getByRole("button", { name: "Enviar checklist para revisão" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Idioma"), { target: { value: "es" } });
    expect(screen.getByRole("button", { name: "Enviar el checklist para revisión" })).toBeVisible();
  });

  it("sends the saved frozen draft for manager review and makes the cleaner view read-only", async () => {
    getPublicChecklist.mockResolvedValue({
      checklist: { ...frozenChecklist, assignedCleanerName: "Assigned Cleaner Example" },
      draft: createDraft(),
    });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(screen.getByRole("button", { name: "Send checklist for review" }));
    expect(screen.getByText("Saved answers and notes will become read-only. This does not mark the job completed. Your manager will review the saved checklist.")).toBeVisible();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send checklist for review" }));

    await waitFor(() => expect(readyPublicChecklistForReview).toHaveBeenCalledWith(expect.objectContaining({
      token: "opaque-capability-token", baseRevision: 0,
    })));
    expect(await screen.findByText("This checklist is read-only. Your manager can now review the saved checklist.")).toBeVisible();
    expect(screen.getByText("Assigned cleaner: Assigned Cleaner Example")).toBeVisible();
    expect(within(itemFieldset("Make the bed")).getByLabelText("Done")).toBeDisabled();
    expect(screen.getByLabelText("Hand soap")).toBeDisabled();
    expect(screen.getByLabelText("Other notes")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Send checklist for review" })).not.toBeInTheDocument();
  });

  it("reuses the exact review submission after a lost response", async () => {
    readyPublicChecklistForReview
      .mockRejectedValueOnce({ code: "checklist_request_timeout" })
      .mockResolvedValueOnce({
        duplicate: true,
        checklist: { ...frozenChecklist, status: "READY_FOR_REVIEW" },
        draft: createDraft(),
      });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(screen.getByRole("button", { name: "Send checklist for review" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send checklist for review" }));
    expect(await screen.findByText("Could not send for review. Try again.")).toBeVisible();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send checklist for review" }));

    await waitFor(() => expect(readyPublicChecklistForReview).toHaveBeenCalledTimes(2));
    expect(readyPublicChecklistForReview.mock.calls[1][0].submissionId)
      .toBe(readyPublicChecklistForReview.mock.calls[0][0].submissionId);
    expect(await screen.findByText("This checklist is read-only. Your manager can now review the saved checklist.")).toBeVisible();
  });

  it("shows actionable missing-requirement feedback without disabling the valid cleaner link", async () => {
    readyPublicChecklistForReview.mockRejectedValueOnce({
      code: "checklist_requirements_missing",
      status: 422,
      requirements: { missingChecklistCount: 3, missingInventoryCount: 1, missingPhotoCount: 1 },
    });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(screen.getByRole("button", { name: "Send checklist for review" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send checklist for review" }));

    const missingText = "Still needed — checklist answers: 3; inventory items: 1; required photos: 1.";
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(missingText)).toBeVisible();
    expect(screen.queryByText("This checklist link is no longer available.")).not.toBeInTheDocument();
    expect(within(itemFieldset("Make the bed")).getByLabelText("Done")).toBeEnabled();
    expect(screen.getByLabelText("Other notes")).toBeEnabled();
    expect(screen.getByText("Checklist item: Make the bed")).toBeVisible();
    expect(screen.getAllByText("Answer this item before sending for review.")).toHaveLength(3);
    expect(screen.getByText("Required photo is not saved yet.")).toBeVisible();
    expect(screen.getByText("Choose an inventory level before sending for review.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Go to first missing item" }));
    expect(within(itemFieldset("Make the bed")).getByLabelText("Done")).toHaveFocus();
  });

  it("clears each missing marker as its requirement is satisfied", async () => {
    readyPublicChecklistForReview.mockRejectedValueOnce({
      code: "checklist_requirements_missing",
      status: 422,
      requirements: { missingChecklistCount: 3, missingInventoryCount: 1, missingPhotoCount: 1 },
    });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });
    fireEvent.click(screen.getByRole("button", { name: "Send checklist for review" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send checklist for review" }));
    await screen.findByText("Still needed — checklist answers: 3; inventory items: 1; required photos: 1.");

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    await waitFor(() => expect(screen.getByText("Saved")).toBeVisible());
    expect(within(itemFieldset("Make the bed")).queryByText("Answer this item before sending for review.")).not.toBeInTheDocument();
    expect(within(itemFieldset("Check under beds and furniture")).getByText("Required photo is not saved yet.")).toBeVisible();
    expect(screen.getByText("Still needed — checklist answers: 2; inventory items: 1; required photos: 1.")).toBeVisible();

    fireEvent.click(within(itemFieldset("Check under beds and furniture")).getByLabelText("Done"));
    fireEvent.click(within(itemFieldset("Check the pool")).getByLabelText("Not applicable"));
    fireEvent.change(screen.getByLabelText("Hand soap"), { target: { value: "HIGH" } });
    await waitFor(() => expect(screen.queryByText("Choose an inventory level before sending for review.")).not.toBeInTheDocument());
    expect(within(itemFieldset("Check under beds and furniture")).queryByText("Answer this item before sending for review.")).not.toBeInTheDocument();
    await waitFor(() => expect(within(itemFieldset("Check the pool")).queryByText("Answer this item before sending for review.")).not.toBeInTheDocument());

    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "under-bed.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelectorAll('input[type="file"]')[0], { target: { files: [photo] } });
    await waitFor(() => expect(screen.queryByText("Required photo is not saved yet.")).not.toBeInTheDocument());
    expect(screen.getByText("These requirements now appear complete. Send again so the server can check the saved version.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Go to first missing item" })).not.toBeInTheDocument();
  });

  it("does not treat an unconfirmed photo response as saved evidence", async () => {
    readyPublicChecklistForReview.mockRejectedValueOnce({
      code: "checklist_requirements_missing",
      status: 422,
      requirements: { missingChecklistCount: 3, missingInventoryCount: 1, missingPhotoCount: 1 },
    });
    const pendingUpload = deferred();
    uploadPublicChecklistEvidence.mockReturnValueOnce(pendingUpload.promise);
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });
    fireEvent.click(screen.getByRole("button", { name: "Send checklist for review" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send checklist for review" }));
    await screen.findByText("Required photo is not saved yet.");
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "under-bed.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelectorAll('input[type="file"]')[0], { target: { files: [photo] } });

    expect(await screen.findByText("Uploading photo…")).toBeVisible();
    expect(screen.getByText("Required photo is not saved yet.")).toBeVisible();
    await act(async () => pendingUpload.resolve({ evidence: [] }));
    expect(await screen.findByText("Photo could not be saved. Try again.")).toBeVisible();
    expect(within(itemFieldset("Check under beds and furniture")).getByText("Required photo is not saved yet.")).toBeVisible();
    expect(within(itemFieldset("Check under beds and furniture")).queryByText("Photo saved")).not.toBeInTheDocument();
    expect(within(itemFieldset("Check under beds and furniture")).getByRole("button", { name: "Take photo" })).toBeVisible();
  });

  it("lets a cleaner correct validation gaps and submit a fresh saved revision", async () => {
    readyPublicChecklistForReview.mockRejectedValueOnce({
      code: "checklist_requirements_missing",
      status: 422,
      requirements: { missingChecklistCount: 3, missingInventoryCount: 1, missingPhotoCount: 1 },
    });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });
    fireEvent.click(screen.getByRole("button", { name: "Send checklist for review" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send checklist for review" }));
    await screen.findByText("Still needed — checklist answers: 3; inventory items: 1; required photos: 1.");

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    await waitFor(() => expect(screen.getByText("Saved")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Send checklist for review" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send checklist for review" }));

    await waitFor(() => expect(readyPublicChecklistForReview).toHaveBeenCalledTimes(2));
    expect(readyPublicChecklistForReview.mock.calls[1][0]).toMatchObject({ baseRevision: 1 });
    expect(readyPublicChecklistForReview.mock.calls[1][0].submissionId)
      .not.toBe(readyPublicChecklistForReview.mock.calls[0][0].submissionId);
    expect(await screen.findByText("This checklist is read-only. Your manager can now review the saved checklist.")).toBeVisible();
  });

  it("refreshes on a revision conflict instead of classifying it as an unavailable link", async () => {
    readyPublicChecklistForReview.mockRejectedValueOnce({ code: "checklist_conflict", status: 409 });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(screen.getByRole("button", { name: "Send checklist for review" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send checklist for review" }));

    expect(await screen.findByText("The saved checklist changed. Please review the latest saved version before sending it.")).toBeVisible();
    expect(getPublicChecklist).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("This checklist link is no longer available.")).not.toBeInTheDocument();
  });

  it("offers a retry after a transient read failure instead of claiming the link is invalid", async () => {
    getPublicChecklist.mockRejectedValueOnce({ code: "checklist_request_failed", status: 503 });
    renderPage();

    expect(await screen.findByText("Could not load the checklist right now. The link has not been confirmed invalid. Check your connection and try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry checklist loading" })).toBeVisible();
    expect(screen.queryByText("This checklist link is no longer available.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry checklist loading" }));
    expect(await screen.findByRole("heading", { name: "Cleaning checklist" })).toBeVisible();
  });

  it("loads a submitted Run as read-only and discards stale local recovery instead of saving it", async () => {
    getPublicChecklist.mockResolvedValue({
      checklist: { ...frozenChecklist, status: "READY_FOR_REVIEW", readyForReviewAt: "2026-09-22T18:00:00.000Z" },
      draft: createDraft({ revision: 2, generalNotes: "Server saved" }),
    });
    vi.stubGlobal("crypto", {
      subtle: { digest: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer) },
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
    window.localStorage.setItem(`${checklistDraftRecoveryStoragePrefix}AQID`, JSON.stringify({
      pendingMutation: { mutationId: "recovery-mutation-1", baseRevision: 1, changes: { generalNotes: "Stale local" } },
      queuedChanges: {}, updatedAt: Date.now(),
    }));
    renderPage();

    expect(await screen.findByText("This checklist is read-only. Your manager can now review the saved checklist.")).toBeVisible();
    expect(screen.getByLabelText("Other notes")).toHaveValue("Server saved");
    expect(savePublicChecklistDraft).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(`${checklistDraftRecoveryStoragePrefix}AQID`)).toBeNull();
  });
});

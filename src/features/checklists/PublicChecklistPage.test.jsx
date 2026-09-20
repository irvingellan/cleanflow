import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { checklistDraftRecoveryStoragePrefix } from "./checklistDraftRecovery.js";

const mocks = vi.hoisted(() => ({
  getPublicChecklist: vi.fn(),
  savePublicChecklistDraft: vi.fn(),
}));
const { getPublicChecklist, savePublicChecklistDraft } = mocks;

vi.mock("./checklistCapabilityService.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getPublicChecklist: mocks.getPublicChecklist,
  savePublicChecklistDraft: mocks.savePublicChecklistDraft,
}));

const { PublicChecklistPage } = await import("./PublicChecklistPage.jsx");

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
      { id: "pool", label: "Check the pool", canBeNotApplicable: true },
    ],
  }],
  inventoryItems: [{ id: "soap", label: "Hand soap" }],
  requiredPhotoTypes: [{ id: "final", label: "Final room" }],
};

function createDraft(overrides = {}) {
  return {
    revision: 0,
    checklistAnswers: { bed: "UNANSWERED", pool: "UNANSWERED" },
    inventoryAnswers: { soap: "UNANSWERED" },
    issueNotes: "",
    generalNotes: "",
    progress: {
      checklist: { total: 2, done: 0, unanswered: 2 },
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

beforeEach(() => {
  window.localStorage.clear();
  getPublicChecklist.mockReset();
  savePublicChecklistDraft.mockReset();
  getPublicChecklist.mockResolvedValue({ checklist: frozenChecklist, draft: createDraft() });
  savePublicChecklistDraft.mockImplementation(async ({ baseRevision, changes }) => ({
    draft: createDraft({
      revision: baseRevision + 1,
      checklistAnswers: { bed: "UNANSWERED", pool: "UNANSWERED", ...(changes.checklistAnswers || {}) },
      inventoryAnswers: { soap: "UNANSWERED", ...(changes.inventoryAnswers || {}) },
      issueNotes: Object.hasOwn(changes, "issueNotes") ? changes.issueNotes : "",
      generalNotes: Object.hasOwn(changes, "generalNotes") ? changes.generalNotes : "",
    }),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PublicChecklistPage", () => {
  it("loads a virtual draft from the frozen projection and only offers N/A where allowed", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Cleaning checklist" })).toBeVisible();
    expect(within(itemFieldset("Make the bed")).queryByLabelText("Not applicable")).not.toBeInTheDocument();
    expect(within(itemFieldset("Check the pool")).getByLabelText("Not applicable")).toBeVisible();
    expect(screen.getByLabelText("Hand soap")).toHaveValue("UNANSWERED");
    expect(screen.getByText("Use the frozen instructions.")).toBeVisible();
    expect(savePublicChecklistDraft).not.toHaveBeenCalled();
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

  it("shows a conflict without silently overwriting local or server state", async () => {
    savePublicChecklistDraft.mockRejectedValueOnce({ code: "checklist_conflict", status: 409 });
    renderPage();
    await screen.findByRole("heading", { name: "Cleaning checklist" });

    fireEvent.click(within(itemFieldset("Make the bed")).getByLabelText("Done"));
    expect(await screen.findByText("Conflict — review changes")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload saved version" })).toBeVisible();
    expect(within(itemFieldset("Make the bed")).getByLabelText("Done")).toBeChecked();
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
});

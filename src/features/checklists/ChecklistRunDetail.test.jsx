import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ChecklistRunDetail } from "./ChecklistRunDetail.jsx";

function renderChecklistRun(runOverrides = {}) {
  return render(
    <TranslationProvider>
      <ChecklistRunDetail
        job={{ id: "job-1", propertyName: "Job Property", scheduledDate: "2026-09-20" }}
        checklistRun={{
          id: "initial",
          status: "DRAFT",
          definitionVersion: 1,
          property: { id: "property-1", name: "Snapshot Property" },
          checklistItemCount: 28,
          inventoryItemCount: 13,
          requiredPhotoTypes: [{ id: "balcony", label: "Balcony", maximum: 2 }],
          cleanerInstructions: "Check the balcony.",
          createdAt: "2026-09-20T17:00:00.000Z",
          // Deliberately unrendered server-only data must not appear in the manager summary.
          propertyChecklistSettingsSnapshot: { accessCode: "private-code" },
          ...runOverrides,
        }}
        onBack={vi.fn()}
      />
    </TranslationProvider>,
  );
}

describe("ChecklistRunDetail", () => {
  it("renders the persisted manager snapshot summary without server-only configuration", () => {
    renderChecklistRun();

    expect(screen.getByRole("heading", { name: "Checklist run" })).toBeVisible();
    expect(screen.getByText("Snapshot Property")).toBeVisible();
    expect(screen.getByText("28 items")).toBeVisible();
    expect(screen.getByText("13 items")).toBeVisible();
    expect(screen.getByText("Balcony · up to 2")).toBeVisible();
    expect(screen.getByText("Check the balcony.")).toBeVisible();
    expect(screen.getByText("Draft")).toBeVisible();
    expect(screen.queryByText("private-code")).not.toBeInTheDocument();
    expect(screen.queryByText("propertyChecklistSettingsSnapshot")).not.toBeInTheDocument();
  });

  it("shows only acknowledged cleaner draft progress and notes read-only", () => {
    renderChecklistRun({
      draft: {
        revision: 3,
        progress: {
          checklist: { done: 4, unanswered: 24 },
          inventory: { answered: 2, needsRestock: 1 },
        },
        issueNotes: "Replace a burned-out bulb.",
        generalNotes: "Everything else looks good.",
        lastSavedAt: "2026-09-20T18:00:00.000Z",
      },
    });

    expect(screen.getByRole("heading", { name: "Saved progress" })).toBeVisible();
    expect(screen.getByText("Checklist: 4 done, 24 unanswered")).toBeVisible();
    expect(screen.getByText("Inventory: 2 checked, 1 need restock")).toBeVisible();
    expect(screen.getByText("Replace a burned-out bulb.")).toBeVisible();
    expect(screen.getByText("Everything else looks good.")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("lets the manager explicitly refresh only the server-acknowledged progress", () => {
    const onRefresh = vi.fn();
    render(
      <TranslationProvider>
        <ChecklistRunDetail
          job={{ id: "job-1", propertyName: "Job Property", scheduledDate: "2026-09-20" }}
          checklistRun={{ id: "initial", status: "DRAFT", property: { name: "Snapshot Property" }, checklistItemCount: 28, inventoryItemCount: 13 }}
          isRefreshing={false}
          onRefresh={onRefresh}
          onBack={vi.fn()}
        />
      </TranslationProvider>,
    );

    screen.getByRole("button", { name: "Refresh saved progress" }).click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows a cleaner-ready Run and its acknowledged draft without manager editing controls", () => {
    renderChecklistRun({
      status: "READY_FOR_REVIEW",
      readyForReviewAt: "2026-09-20T18:30:00.000Z",
      draft: {
        revision: 4,
        progress: {
          checklist: { done: 5, unanswered: 23 },
          inventory: { answered: 1, needsRestock: 1 },
        },
        issueNotes: "Manager should check the lamp.",
      },
    });

    expect(screen.getAllByText("Ready for manager review").length).toBeGreaterThan(0);
    expect(screen.getByText("The cleaner sent this saved checklist for manager review. This does not complete the job.")).toBeVisible();
    expect(screen.getByText("Manager should check the lamp.")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

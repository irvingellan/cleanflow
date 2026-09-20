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
});

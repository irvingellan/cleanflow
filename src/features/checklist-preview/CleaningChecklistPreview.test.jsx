import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { CleaningChecklistPreview } from "./CleaningChecklistPreview.jsx";
import { checklistSections, inventoryItems } from "./checklistPreviewData.js";

function renderPreview() {
  return render(
    <TranslationProvider>
      <CleaningChecklistPreview />
    </TranslationProvider>,
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe("CleaningChecklistPreview", () => {
  it("shows a clearly labeled fictitious cleaner checklist", () => {
    renderPreview();

    expect(screen.getByRole("heading", { name: "Cleaning & Reset Checklist" })).toBeVisible();
    expect(screen.getByText("Preview only. Nothing here is saved or sent.")).toBeVisible();
    expect(screen.getByLabelText("Cleaner name")).toHaveValue("Alex Rivera");
    expect(screen.getByLabelText("Property / listing")).toHaveValue("Cedar Grove Apartment");
    expect(checklistSections.flatMap((section) => section.items)).toHaveLength(26);
    expect(inventoryItems).toHaveLength(13);
  });

  it("generates a client-facing report from checklist, inventory, and note state", () => {
    renderPreview();

    fireEvent.click(screen.getByLabelText("Strip and remake all beds"));
    fireEvent.click(screen.getByRole("button", {
      name: "Mark Check pool/hot tub when applicable as not applicable",
    }));
    fireEvent.change(screen.getByLabelText("Toilet paper"), {
      target: { value: "NEEDS_RESTOCK" },
    });
    fireEvent.change(screen.getByLabelText("Damage, missing items, or maintenance issues (optional)"), {
      target: { value: "The hallway light flickers." },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add photo placeholder" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Add photo placeholder" })[1]);
    fireEvent.submit(screen.getByRole("button", { name: "Generate client report preview" }).form);

    expect(screen.getByRole("heading", { name: "Completion report" })).toBeVisible();
    expect(screen.getByText("1 / 25")).toBeVisible();
    expect(screen.getByText("Restock needed")).toBeVisible();
    expect(screen.getByText("Toilet paper")).toBeVisible();
    expect(screen.getByText("The hallway light flickers.")).toBeVisible();
    expect(screen.getByText("Email delivery is not active in this prototype.")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.getByText("Photo placeholders")).toBeVisible();
  });
});

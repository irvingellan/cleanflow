import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PropertyChecklistEditor } from "./PropertyChecklistEditor.jsx";
import { PropertyCleanerAccess } from "./PropertyCleanerAccess.jsx";

beforeEach(() => localStorage.setItem("cleanflow-language", "en"));
const renderIn = (node) => render(<TranslationProvider>{node}</TranslationProvider>);

describe("FB07 property checklist editor", () => {
  it("renames, removes, makes optional, adds items and photos, previews, and saves a template", async () => {
    const onSave = vi.fn(async () => {});
    renderIn(<PropertyChecklistEditor property={{ id: "p", checklistSettings: {} }} onSave={onSave} />);
    expect(screen.getByText(/0 change\(s\) from the standard checklist/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit checklist" }));
    expect(screen.getByText(/A checklist already created, in progress or under review keeps its own version/)).toBeVisible();
    fireEvent.click(screen.getByText("Bedrooms & linens"));
    const bedrooms = screen.getByRole("group", { name: "Bedrooms & linens" });
    const [first] = within(bedrooms).getAllByRole("textbox", { name: "Item text" });
    fireEvent.change(first, { target: { value: "Trocar toda a roupa de cama" } });
    fireEvent.click(within(bedrooms).getAllByRole("button", { name: "Remove" })[1]);
    fireEvent.click(within(bedrooms).getAllByRole("checkbox", { name: /^Optional:/ })[2]);
    fireEvent.click(within(bedrooms).getByRole("button", { name: "Add item" }));
    const added = within(bedrooms).getAllByRole("textbox", { name: "Item text" }).at(-1);
    fireEvent.change(added, { target: { value: "Travesseiros extras" } });
    fireEvent.click(screen.getByRole("button", { name: "Add photo" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Photo to take" }), { target: { value: "Embaixo das camas" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview as the cleaner" }));
    const preview = screen.getByTestId("checklist-preview");
    expect(preview).toHaveTextContent("Trocar toda a roupa de cama");
    expect(preview).toHaveTextContent("Travesseiros extras");
    expect(preview).toHaveTextContent("Embaixo das camas");
    fireEvent.click(screen.getByRole("button", { name: "Save checklist" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const settings = onSave.mock.calls[0][0];
    expect(settings.itemOverrides).toEqual(expect.arrayContaining([
      { id: "bed-remake", label: "Trocar toda a roupa de cama" }, { id: "bed-stains", hidden: true },
      { id: "bed-towels", canBeNotApplicable: true },
    ]));
    expect(settings.additionalChecklistItems).toEqual([expect.objectContaining({ sectionId: "bedrooms", label: "Travesseiros extras" })]);
    expect(settings.requiredPhotoTypes).toEqual([expect.objectContaining({ label: "Embaixo das camas" })]);
  });

  it("keeps the required photo item and never saves when the manager cancels", () => {
    const onSave = vi.fn();
    renderIn(<PropertyChecklistEditor property={{ id: "p", checklistSettings: {} }} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit checklist" }));
    expect(screen.getByText("Required photo item: you can change its text.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("FB01 shared access", () => {
  it("is off by default, pre-fills from internal notes only on request, and saves the switch", async () => {
    const onSave = vi.fn(async () => {});
    renderIn(<PropertyCleanerAccess property={{ id: "p", keyCodeInfo: "internal-1234", accessInstructions: "internal-note" }} onSave={onSave} />);
    expect(screen.getByText(/Off: cleaners don't see access details/)).toBeVisible();
    expect(screen.queryByText("internal-1234")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit access" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy from internal notes" }));
    expect(screen.getByRole("textbox", { name: "Entry / door code" })).toHaveValue("internal-1234");
    fireEvent.click(screen.getByRole("switch", { name: /Show to the assigned cleaner/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ shared: true, door: "internal-1234", note: "internal-note" })));
  });
});

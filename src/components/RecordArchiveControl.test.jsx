import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../i18n/translations.js";
import { RecordArchiveControl } from "./RecordArchiveControl.jsx";

describe("RecordArchiveControl", () => {
  it("confirms before a reversible archive and prevents duplicate submission", async () => {
    let resolveArchive;
    const onArchive = vi.fn(() => new Promise((resolve) => { resolveArchive = resolve; }));
    render(<TranslationProvider><RecordArchiveControl record={{ id: "test" }} onArchive={onArchive} /></TranslationProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Remove from view?")).toBeVisible();
    const confirm = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirm);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    resolveArchive();
  });

  it("only exposes restore in the developer-authorized archived view", () => {
    const { rerender } = render(<TranslationProvider><RecordArchiveControl record={{ id: "test", archivedAt: {} }} /></TranslationProvider>);
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    rerender(<TranslationProvider><RecordArchiveControl record={{ id: "test", archivedAt: {} }} canRestore onRestore={vi.fn()} /></TranslationProvider>);
    expect(screen.getByRole("button", { name: "Restore" })).toBeVisible();
  });
});

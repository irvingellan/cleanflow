import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { DevCenter } from "./DevCenter.jsx";

function buildDevCenter({ environment = "emulator", pendingPreviewType = null, onPreviewReminder = vi.fn() } = {}) {
  return (
    <TranslationProvider>
      <DevCenter
        access={{ authorized: true, environment, demoJobCount: 0 }}
        isWorking={false}
        pendingPreviewType={pendingPreviewType}
        hasError={false}
        lastResult={null}
        onGenerate={vi.fn()}
        onClear={vi.fn()}
        onPreviewReminder={onPreviewReminder}
      />
    </TranslationProvider>
  );
}

describe("DevCenter action states", () => {
  it("starts with every allowed action idle and isolates preview loading to the selected preview", () => {
    const { rerender } = render(buildDevCenter());

    expect(screen.getByRole("button", { name: "Preview today" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Preview tomorrow" })).toBeEnabled();
    const generateButtons = screen.getAllByRole("button", { name: "Generate" });
    expect(generateButtons).toHaveLength(4);
    generateButtons.forEach((button) => expect(button).toBeEnabled());

    rerender(buildDevCenter({ pendingPreviewType: "TODAY_07" }));

    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Preview tomorrow" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Generate" })).toHaveLength(4);
  });

  it("keeps production demo mutations blocked while allowing authorized read-only previews", () => {
    const onPreviewReminder = vi.fn();
    render(buildDevCenter({ environment: "production", onPreviewReminder }));

    screen.getAllByRole("button", { name: "Generate" }).forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByRole("button", { name: "Preview today" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Preview tomorrow" })).toBeEnabled();
    expect(screen.getByText("Current data — read only.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview today" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview tomorrow" }));
    expect(onPreviewReminder).toHaveBeenNthCalledWith(1, "TODAY_07");
    expect(onPreviewReminder).toHaveBeenNthCalledWith(2, "TOMORROW_19");
  });
});

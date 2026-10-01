import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { DevCenter } from "./DevCenter.jsx";

vi.mock("../notifications/NotificationChannelDiagnostics.jsx", () => ({
  NotificationChannelDiagnostics: () => <p>Advanced provider diagnostics mounted</p>,
}));

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
  it("shows back to top only after 600px while keeping allowed actions available", () => {
    const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
    let scrollY = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    const onPreviewReminder = vi.fn();

    try {
      render(buildDevCenter({ onPreviewReminder }));
      expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();

      scrollY = 600;
      fireEvent.scroll(window);
      expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();

      scrollY = 601;
      fireEvent.scroll(window);
      expect(screen.getByRole("button", { name: "Back to top" })).toBeVisible();
      const generateButtons = screen.getAllByRole("button", { name: "Generate" });
      expect(generateButtons).toHaveLength(4);
      generateButtons.forEach((button) => expect(button).toBeEnabled());
      expect(screen.getByRole("button", { name: "Clear demo data" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Preview today" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Preview tomorrow" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Preview today" }));
      expect(onPreviewReminder).toHaveBeenCalledExactlyOnceWith("TODAY_07");

      scrollY = 0;
      fireEvent.scroll(window);
      expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Preview tomorrow" })).toBeEnabled();
    } finally {
      if (originalScrollY) Object.defineProperty(window, "scrollY", originalScrollY);
      else delete window.scrollY;
    }
  });

  it("does not run advanced provider checks until the developer explicitly requests them", () => {
    render(buildDevCenter());

    expect(screen.queryByText("Advanced provider diagnostics mounted")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run advanced provider checks" }));
    expect(screen.getByText("Advanced provider diagnostics mounted")).toBeVisible();
  });

  it("keeps the internal page-load view linked from the developer-only Dev Center", () => {
    render(buildDevCenter());
    expect(screen.getByRole("link", { name: "Page-load timings" }))
      .toHaveAttribute("href", "/diagnostics/load-times");
  });

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

  it("allows demo mutations in the dedicated sandbox", () => {
    render(buildDevCenter({ environment: "sandbox" }));

    screen.getAllByRole("button", { name: "Generate" }).forEach((button) => expect(button).toBeEnabled());
    expect(screen.getByRole("button", { name: "Clear demo data" })).toBeEnabled();
    expect(screen.getByText("Sandbox target")).toBeVisible();
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

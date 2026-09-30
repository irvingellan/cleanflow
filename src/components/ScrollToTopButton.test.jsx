import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../i18n/translations.js";
import { ScrollToTopButton } from "./ScrollToTopButton.jsx";

describe("ScrollToTopButton", () => {
  beforeEach(() => {
    window.localStorage.setItem("cleanflow-language", "en");
    vi.stubGlobal("scrollY", 0);
    vi.stubGlobal("matchMedia", undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.removeItem("cleanflow-language");
  });

  it("stays hidden near the top and scrolls smoothly after the threshold", async () => {
    let scrollY = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<TranslationProvider><ScrollToTopButton threshold={100} /></TranslationProvider>);
    expect(screen.queryByRole("button", { name: /back to top/i })).not.toBeInTheDocument();
    scrollY = 101;
    fireEvent.scroll(window);
    await user.click(await screen.findByRole("button", { name: /back to top/i }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("uses the default 400px threshold and disappears when returning near the top", () => {
    render(<TranslationProvider><ScrollToTopButton /></TranslationProvider>);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();

    window.scrollY = 400;
    fireEvent.scroll(window);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();

    window.scrollY = 401;
    fireEvent.scroll(window);
    expect(screen.getByRole("button", { name: "Back to top" })).toBeVisible();

    window.scrollY = 20;
    fireEvent.scroll(window);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();
  });

  it.each(["{Enter}", " "])("supports native keyboard activation with %s", async (key) => {
    window.scrollY = 401;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<TranslationProvider><ScrollToTopButton /></TranslationProvider>);

    const button = screen.getByRole("button", { name: "Back to top" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard(key);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: "smooth" });
  });

  it("reads the current reduced-motion preference at each click", async () => {
    window.scrollY = 401;
    let reducedMotion = false;
    const matchMedia = vi.fn(() => ({ matches: reducedMotion }));
    vi.stubGlobal("matchMedia", matchMedia);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<TranslationProvider><ScrollToTopButton /></TranslationProvider>);
    const button = screen.getByRole("button", { name: "Back to top" });
    expect(matchMedia).not.toHaveBeenCalled();

    reducedMotion = true;
    await user.click(button);
    expect(matchMedia).toHaveBeenLastCalledWith("(prefers-reduced-motion: reduce)");
    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 0, behavior: "auto" });

    reducedMotion = false;
    await user.click(button);
    expect(matchMedia).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 0, behavior: "smooth" });
  });

  it.each([
    ["en", "Back to top"],
    ["pt", "Voltar ao topo"],
    ["es", "Volver arriba"],
  ])("localizes the accessible label and title in %s", (language, label) => {
    window.localStorage.setItem("cleanflow-language", language);
    window.scrollY = 401;
    render(<TranslationProvider><ScrollToTopButton /></TranslationProvider>);

    const button = screen.getByRole("button", { name: label });
    expect(button).toHaveAttribute("aria-label", label);
    expect(button).toHaveAttribute("title", label);
  });

  it("registers a passive scroll listener and removes it on unmount", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<TranslationProvider><ScrollToTopButton /></TranslationProvider>);
    const scrollListeners = addEventListener.mock.calls.filter(([event]) => event === "scroll");

    expect(scrollListeners).toHaveLength(1);
    const [, updateVisibility, options] = scrollListeners[0];
    expect(options).toEqual({ passive: true });
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("scroll", updateVisibility);
  });

  it("rechecks visibility when the threshold changes", () => {
    window.scrollY = 500;
    const { rerender } = render(
      <TranslationProvider><ScrollToTopButton threshold={600} /></TranslationProvider>,
    );
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();

    rerender(<TranslationProvider><ScrollToTopButton threshold={400} /></TranslationProvider>);
    expect(screen.getByRole("button", { name: "Back to top" })).toBeVisible();

    rerender(<TranslationProvider><ScrollToTopButton threshold={700} /></TranslationProvider>);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();
  });
});

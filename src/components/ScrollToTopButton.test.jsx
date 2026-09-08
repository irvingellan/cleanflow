import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../i18n/translations.js";
import { ScrollToTopButton } from "./ScrollToTopButton.jsx";

describe("ScrollToTopButton", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stays hidden near the top and scrolls smoothly after the threshold", async () => {
    let scrollY = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<TranslationProvider><ScrollToTopButton threshold={100} /></TranslationProvider>);
    expect(screen.queryByRole("button", { name: /back to top/i })).not.toBeInTheDocument();
    scrollY = 101;
    window.dispatchEvent(new Event("scroll"));
    await user.click(await screen.findByRole("button", { name: /back to top/i }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});

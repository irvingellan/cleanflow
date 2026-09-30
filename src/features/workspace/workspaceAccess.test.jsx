import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../../App.jsx";
import { TranslationProvider } from "../../i18n/translations.js";

const subscribe = vi.hoisted(() => vi.fn());
vi.mock("../auth/authService.js", async (original) => ({ ...(await original()), subscribeToAuthState: subscribe }));

describe("workspace experiment access", () => {
  it("fails closed outside explicit emulator mode before auth subscription or manager data loading", () => {
    window.history.replaceState(null, "", "/workspace-preview");
    render(<TranslationProvider><App /></TranslationProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("available only with local Firebase emulators");
    expect(subscribe).not.toHaveBeenCalled();
    expect(document.querySelector(".operations-workspace")).toBeNull();
    window.history.replaceState(null, "", "/");
  });
});

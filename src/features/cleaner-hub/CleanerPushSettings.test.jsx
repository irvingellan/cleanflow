import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CleanerPushSettings } from "./CleanerHubApp.jsx";
import { hubTranslate } from "./cleanerHubMessages.js";

const t = (key) => hubTranslate("pt", key);
const pairingReference = "synthetic-session.synthetic-device";

describe("Cleaner pilot account settings", () => {
  it("shows only the current pairing reference with recheck and keeps the Inbox available", async () => {
    const push = { state: "pilot-ineligible", pairingReference, canEnable: false, enable: vi.fn(), recheck: vi.fn() };
    const view = render(<CleanerPushSettings t={t} push={push} go={vi.fn()} />);
    const reference = screen.getByRole("textbox", { name: t("hb.push.pairingReference") });
    expect(reference).toHaveValue(pairingReference);
    expect(reference).toHaveAttribute("readonly");
    expect(screen.getByText(t("hb.push.inboxAlways"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("hb.push.enable") })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: t("hb.push.recheck") }));
    expect(push.recheck).toHaveBeenCalledOnce();
    expect(push.enable).not.toHaveBeenCalled();
    view.rerender(<CleanerPushSettings t={t} push={{ ...push, state: "missing", canEnable: true }} go={vi.fn()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: t("hb.push.enable") }));
    expect(push.enable).toHaveBeenCalledOnce();
  });

  it.each(["missing", "error", "pilot-check-required", "unavailable"])("offers a fresh check instead of permission when approval is absent in %s", (state) => {
    render(<CleanerPushSettings t={t} push={{ state, pairingReference, canEnable: false, enable: vi.fn(), recheck: vi.fn() }} go={vi.fn()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: t("hb.push.enable") })).toBeNull();
    expect(screen.getByRole("button", { name: t("hb.push.recheck") })).toBeInTheDocument();
    expect(screen.getByText(t("hb.push.inboxAlways"))).toBeInTheDocument();
  });

  it.each(["pt", "en", "es"])("provides pilot status and pairing copy in %s", (language) => {
    for (const key of ["pilot-ineligible", "pilot-check-required", "unavailable", "pairingReference", "pairingHelp"]) {
      expect(hubTranslate(language, `hb.push.${key}`)).not.toBe(`hb.push.${key}`);
    }
  });
});

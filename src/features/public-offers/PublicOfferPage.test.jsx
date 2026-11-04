import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App.jsx";
import { TranslationProvider } from "../../i18n/translations.js";

// Loading the public route must never require initializing manager auth.
vi.mock("../auth/authService.js", () => ({
  signInWithEmail: vi.fn(),
  signOutManager: vi.fn(),
  subscribeToAuthState: vi.fn(() => { throw new Error("Unexpected manager session subscription."); }),
}));

const automaticOffer = {
  offerDistributionMode: "FIRST_ACCEPT_WINS",
  status: "PENDING",
  propertyName: "Birch Example Flat",
  scheduledDate: "2026-11-05",
  scheduledStart: "09:00",
  offeredCompensation: 140,
  preferredLanguage: "pt",
};

beforeEach(() => {
  window.history.replaceState({}, "", "/offer/example-public-link");
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("Public automatic offer", () => {
  it("directs the recipient to the authenticated Hub without public response controls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ offer: automaticOffer })));
    render(<TranslationProvider><App /></TranslationProvider>);
    const link = await screen.findByRole("link", { name: "Entrar na Minha agenda" });
    expect(link).toHaveAttribute("href", "/agenda");
    expect(screen.queryByRole("button", { name: /Aceitar serviço|Tenho interesse|Não posso/ })).toBeNull();
  });

  it("replaces stale public response controls when the server requires the Hub", async () => {
    const { offerDistributionMode: _, ...staleOffer } = automaticOffer;
    const fetchOffer = vi.fn()
      .mockResolvedValueOnce(Response.json({ offer: staleOffer }))
      .mockResolvedValueOnce(Response.json({ error: "offer_hub_required" }, { status: 403 }));
    vi.stubGlobal("fetch", fetchOffer);

    render(<TranslationProvider><App /></TranslationProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Tenho interesse" }));
    expect(await screen.findByRole("link", { name: "Entrar na Minha agenda" })).toHaveAttribute("href", "/agenda");
    expect(screen.queryByRole("button", { name: "Tenho interesse" })).toBeNull();
    expect(screen.queryByText(/Você demonstrou interesse/)).toBeNull();
  });

  it("shows why a taken offer link is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "offer_already_taken" }, { status: 410 })));
    render(<TranslationProvider><App /></TranslationProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable — this job has already been accepted.");
    expect(screen.queryByRole("link", { name: "Sign in to My schedule" })).toBeNull();
  });
});

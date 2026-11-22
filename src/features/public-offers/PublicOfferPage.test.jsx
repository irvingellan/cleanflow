import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { preloadCurrentEntry } from "../../App.jsx";
import { publicOfferLoadDeadlineMs } from "./publicOfferService.js";
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

beforeEach(async () => {
  window.history.replaceState({}, "", "/offer/example-public-link");
  await preloadCurrentEntry();
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

  it("confirms an open automatic offer from the link and shows the winner receipt", async () => {
    const fetchOffer = vi.fn()
      .mockResolvedValueOnce(Response.json({ offer: { ...automaticOffer, confirmationMode: "FIRST_ACCEPT_WINS", scheduleRevision: 4 } }))
      .mockResolvedValueOnce(Response.json({ status: "ACCEPTED" }));
    vi.stubGlobal("fetch", fetchOffer);
    render(<TranslationProvider><App /></TranslationProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar serviço" }));
    expect(await screen.findByText("Serviço confirmado para você ✅")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirmar serviço" })).not.toBeInTheDocument();
    expect(JSON.parse(fetchOffer.mock.calls[1][1].body)).toEqual({ token: "example-public-link", status: "ACCEPTED", scheduleRevision: 4 });
  });

  it("offers explicit confirmation to a previously interested team invite and explains a late response", async () => {
    const fetchOffer = vi.fn()
      .mockResolvedValueOnce(Response.json({ offer: { status: "INTERESTED", confirmationMode: "FIRST_ACCEPT_WINS", preferredLanguage: "pt" } }))
      .mockResolvedValueOnce(Response.json({ error: "offer_already_taken" }, { status: 410 }));
    vi.stubGlobal("fetch", fetchOffer);
    render(<TranslationProvider><App /></TranslationProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar serviço" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Outra profissional já ficou com este serviço.");
  });

  it("requires another explicit confirmation after a schedule change", async () => {
    const firstOffer = { ...automaticOffer, confirmationMode: "FIRST_ACCEPT_WINS", scheduleRevision: 2 };
    const fetchOffer = vi.fn()
      .mockResolvedValueOnce(Response.json({ offer: firstOffer }))
      .mockResolvedValueOnce(Response.json({ error: "offer_stale_schedule" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ offer: { ...firstOffer, scheduledStart: "11:00", scheduleRevision: 3 } }));
    vi.stubGlobal("fetch", fetchOffer);
    render(<TranslationProvider><App /></TranslationProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar serviço" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A data ou o horário mudou.");
    expect(screen.queryByRole("button", { name: "Confirmar serviço" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("button", { name: "Confirmar serviço" })).toBeEnabled();
    expect(screen.getByText("11:00")).toBeVisible();
    expect(fetchOffer).toHaveBeenCalledTimes(3);
  });

  it("shows the manual hourly offer in the recipient's selected language", async () => {
    window.localStorage.setItem("cleanflow-language", "en");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ offer: {
      status: "PENDING", preferredLanguage: "pt", offeredPay: { mode: "HOURLY", rateCents: 3167 },
    } })));
    render(<TranslationProvider><App /></TranslationProvider>);
    expect(await screen.findByText(/31,67 por hora/)).toBeVisible();
    expect(screen.getByText(/Você informa suas horas no final do serviço/)).toBeVisible();
  });

  it("shows only the offered individual amount and the first-spot condition in the recipient's language", async () => {
    window.localStorage.setItem("cleanflow-language", "en");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ offer: {
      status: "PENDING", preferredLanguage: "es", offeredCompensation: 33.33, offeredFirstSlotExtraCents: 1, offeredPayEstimated: true,
      cleanerPayout: 100, clientPrice: 275,
    } })));
    render(<TranslationProvider><App /></TranslationProvider>);
    expect(await screen.findByText(/33,33.*0,01.*si te asignan la primera plaza/)).toBeVisible();
    expect(screen.getByText(/Estimación según el tamaño previsto del equipo/)).toBeVisible();
    expect(screen.queryByText(/100,00|275,00/)).toBeNull();
  });

  it("never presents a house or client price when the offer has no personal terms", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ offer: {
      status: "PENDING", preferredLanguage: "en", cleanerPayout: 100, clientPrice: 275,
    } })));
    render(<TranslationProvider><App /></TranslationProvider>);
    expect(await screen.findByText("Amount not set / To be agreed")).toBeVisible();
    expect(screen.queryByText(/100.00|275.00/)).toBeNull();
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

  it("stops loading when a response body never settles and retries without a page refresh", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => new Promise(() => {}),
      }).mockResolvedValueOnce(Response.json({ offer: automaticOffer }));
      vi.stubGlobal("fetch", load);
      await act(async () => { render(<TranslationProvider><App /></TranslationProvider>); });
      expect(load).toHaveBeenCalledTimes(1);
      await act(async () => vi.advanceTimersByTimeAsync(publicOfferLoadDeadlineMs));
      expect(screen.getByRole("alert")).toBeVisible();
      expect(load.mock.calls[0][1].signal.aborted).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await act(async () => {});
      expect(screen.getByRole("link", { name: "Entrar na Minha agenda" })).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows why a taken offer link is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "offer_already_taken" }, { status: 410 })));
    render(<TranslationProvider><App /></TranslationProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Another cleaner already took this service.");
    expect(screen.queryByRole("link", { name: "Sign in to My schedule" })).toBeNull();
  });
});

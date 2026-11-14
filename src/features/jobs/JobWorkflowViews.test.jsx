import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";

const { createJobOffers, respondToJobOffer, createIssue } = vi.hoisted(() => ({
  createJobOffers: vi.fn(),
  respondToJobOffer: vi.fn(),
  createIssue: vi.fn(),
}));

vi.mock("./jobOfferService.js", () => ({ createJobOffers, respondToJobOffer }));
vi.mock("../issues/issueService.js", () => ({ createIssue }));

import { OfferCleaners } from "./JobWorkflowViews.jsx";

beforeEach(() => {
  createJobOffers.mockReset().mockResolvedValue({ id: "job-1" });
  respondToJobOffer.mockReset();
  createIssue.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

function renderOfferCleaners(onSent = vi.fn(), language = "en", job = {}) {
  window.localStorage.setItem("cleanflow-language", language);
  return {
    onSent,
    ...render(
      <TranslationProvider>
        <OfferCleaners
          job={{ id: "job-1", propertyName: "Pilot Property", ...job }}
          cleaners={[{ id: "ana", name: "Ana" }, { id: "beatriz", name: "Beatríz" }]}
          isLoading={false}
          hasError={false}
          onBack={vi.fn()}
          onSent={onSent}
        />
      </TranslationProvider>,
    ),
  };
}

describe("OfferCleaners name search", () => {
  it("retains selections hidden by filtering and creates the selected cleaner offers", async () => {
    const user = userEvent.setup();
    const { onSent } = renderOfferCleaners();

    await user.click(screen.getByLabelText("Ana"));
    const search = screen.getByRole("searchbox", { name: "Search cleaners by name" });
    await user.type(search, "beatriz");
    expect(screen.getByLabelText("Beatríz")).toBeVisible();
    expect(screen.queryByLabelText("Ana")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Beatríz"));
    await user.clear(search);

    expect(screen.getByLabelText("Ana")).toBeChecked();
    expect(screen.getByLabelText("Beatríz")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Create offers" }));

    await waitFor(() => {
      expect(createJobOffers).toHaveBeenCalledWith({
        jobId: "job-1",
        cleaners: [{ id: "ana", name: "Ana" }, { id: "beatriz", name: "Beatríz" }],
      });
      expect(onSent).toHaveBeenCalledWith(2, { id: "job-1" });
    });
  });

  it("shows an explicit no-match state while retaining the offer form", async () => {
    const user = userEvent.setup();
    renderOfferCleaners();

    await user.type(screen.getByRole("searchbox", { name: "Search cleaners by name" }), "nobody");
    expect(screen.getByText("No cleaners match this search.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create offers" })).toBeDisabled();
  });

  it.each([
    ["pt", "Buscar cleaners por nome", "Nenhuma cleaner corresponde a esta busca.", "Criar ofertas"],
    ["es", "Buscar cleaners por nombre", "Ninguna cleaner coincide con esta búsqueda.", "Crear ofertas"],
  ])("localizes the offer-list search and creation action in %s", async (language, searchLabel, noMatch, createLabel) => {
    const user = userEvent.setup();
    renderOfferCleaners(vi.fn(), language);

    const search = screen.getByRole("searchbox", { name: searchLabel });
    await user.type(search, "missing");
    expect(screen.getByText(noMatch)).toBeVisible();
    expect(screen.getByRole("button", { name: createLabel })).toBeDisabled();
  });
});

describe("automatic offer opt-in", () => {
  it("keeps Release A manual on an eligible Job when automatic offers are disabled", async () => {
    vi.stubEnv("VITE_AUTOMATIC_OFFERS_MODE", "disabled");
    const user = userEvent.setup();
    renderOfferCleaners(vi.fn(), "en", {
      schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [],
    });
    expect(screen.queryByRole("checkbox", { name: "Assign automatically to the first cleaner who accepts" }))
      .not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Ana"));
    await user.click(screen.getByRole("button", { name: "Create offers" }));
    expect(createJobOffers).toHaveBeenCalledWith({
      jobId: "job-1",
      cleaners: [{ id: "ana", name: "Ana" }],
    });
  });

  it("defaults a new multi-slot Job to automatic offers when the mode is enabled", async () => {
    vi.stubEnv("VITE_AUTOMATIC_OFFERS_MODE", "enabled");
    const user = userEvent.setup();
    renderOfferCleaners(vi.fn(), "en", {
      schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [], requiredCleanerCount: 3,
    });
    const optIn = screen.getByRole("checkbox", { name: "Assign the available spots to the first cleaners who accept" });
    expect(optIn).toBeChecked();
    await user.click(screen.getByLabelText("Ana"));
    await user.click(screen.getByRole("button", { name: "Create offers" }));
    expect(createJobOffers).toHaveBeenCalledWith({
      jobId: "job-1",
      cleaners: [{ id: "ana", name: "Ana" }],
      automatic: true,
    });
  });

  it("allows the manager to use manual offers on an eligible Job", async () => {
    vi.stubEnv("VITE_AUTOMATIC_OFFERS_MODE", "enabled");
    const user = userEvent.setup();
    renderOfferCleaners(vi.fn(), "en", {
      schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [], requiredCleanerCount: 10,
    });
    const optIn = screen.getByRole("checkbox", { name: "Assign the available spots to the first cleaners who accept" });
    await user.click(optIn);
    await user.click(screen.getByLabelText("Ana"));
    await user.click(screen.getByRole("button", { name: "Create offers" }));
    expect(createJobOffers).toHaveBeenCalledWith({ jobId: "job-1", cleaners: [{ id: "ana", name: "Ana" }] });
  });

  it.each([
    { operationalStatus: "OFFERED" },
    { requiredCleanerCount: 11 },
    { requiredCleanerCount: 0 },
    { assignedCleanerIds: ["ana"] },
    { archivedAt: new Date() },
  ])("keeps the automatic option out of incompatible Jobs (%o)", (data) => {
    vi.stubEnv("VITE_AUTOMATIC_OFFERS_MODE", "enabled");
    renderOfferCleaners(vi.fn(), "en", {
      schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [], ...data,
    });
    expect(screen.queryByRole("checkbox", { name: "Assign automatically to the first cleaner who accepts" }))
      .not.toBeInTheDocument();
  });
});

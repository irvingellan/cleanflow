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
const { setRequiredCleanerCount } = vi.hoisted(() => ({ setRequiredCleanerCount: vi.fn() }));
vi.mock("./assignmentService.js", () => ({ setRequiredCleanerCount }));

import { OfferCleaners } from "./JobWorkflowViews.jsx";
import * as jobService from "./jobService.js";

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

  it("keeps a manual draft when newly fetched history enables automatic offers", async () => {
    vi.stubEnv("VITE_AUTOMATIC_OFFERS_MODE", "enabled");
    const job = { id: "job-1", schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [] };
    const cleaners = [{ id: "ana", name: "Ana" }];
    const onSent = vi.fn();
    const form = (eligible) => <TranslationProvider>
      <OfferCleaners job={job} cleaners={cleaners} canOfferAutomatically={eligible} onSent={onSent} />
    </TranslationProvider>;
    const { rerender } = render(form(false));
    await userEvent.click(screen.getByLabelText("Ana"));
    rerender(form(true));
    expect(screen.getByRole("checkbox", { name: /assign automatically/i })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Create offers" }));
    expect(createJobOffers).toHaveBeenCalledExactlyOnceWith({ jobId: job.id, cleaners });
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


describe("offer amount, cleaner count and send to more (Nov 19 feedback)", () => {
  const cleaners = [{ id: "ana", name: "Ana" }, { id: "bia", name: "Bia" }];
  const render2 = (job, extra = {}) => render(<TranslationProvider>
    <OfferCleaners job={{ id: "job-1", ...job }} cleaners={cleaners} onSent={vi.fn()} {...extra} />
  </TranslationProvider>);
  beforeEach(() => { window.localStorage.setItem("cleanflow-language", "en"); setRequiredCleanerCount.mockReset().mockResolvedValue({}); });

  it("shows the amount from the Property when the Job has none, and sends it on manual offers", async () => {
    render2({ schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [] }, { property: { defaultCleanerPrice: 95 } });
    expect(screen.getByTestId("offer-amount")).toHaveTextContent("95");
    await userEvent.click(screen.getByLabelText("Ana"));
    await userEvent.click(screen.getByRole("button", { name: "Create offers" }));
    expect(createJobOffers).toHaveBeenCalledWith({ jobId: "job-1", cleaners: [cleaners[0]], offeredCompensation: 95 });
  });

  it("shows and sends the snapshotted hourly rate without using a property total", async () => {
    const pay = { mode: "HOURLY", rateCents: 3125 };
    render2({ schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [], requiredCleanerCount: 3, pay },
      { property: { defaultCleanerPrice: 95 } });
    expect(screen.getByTestId("offer-amount")).toHaveTextContent("$31.25 per hour");
    expect(screen.getByTestId("offer-amount")).toHaveTextContent("You report your hours at the end.");
    await userEvent.click(screen.getByLabelText("Ana"));
    await userEvent.click(screen.getByRole("button", { name: "Create offers" }));
    expect(createJobOffers).toHaveBeenCalledWith({ jobId: "job-1", cleaners: [cleaners[0]], offeredPay: pay });
  });

  it("splits a house total by the number of spots, regardless of how many people are invited", async () => {
    render2({ schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [], cleanerPayout: 100 });
    const addSpot = screen.getByRole("button", { name: "One more cleaner" });
    await userEvent.click(addSpot);
    expect(screen.getByTestId("offer-amount")).toHaveTextContent("$50.00");
    await userEvent.click(addSpot);
    await userEvent.click(screen.getByLabelText("Ana"));
    expect(screen.getByTestId("offer-amount")).toHaveTextContent("$33.33 · +$0.01 if you get the first spot");
    await userEvent.click(screen.getByRole("button", { name: "Create offers" }));
    expect(createJobOffers).toHaveBeenCalledWith({ jobId: "job-1", cleaners: [cleaners[0]],
      offeredCompensation: 33.33, offeredFirstSlotExtraCents: 1 });
  });

  it("uses the Job's individual override and keeps it independent of invitee count", async () => {
    render2({ schemaVersion: 2, operationalStatus: "OFFERED", assignedCleanerIds: [], requiredCleanerCount: 3,
      pay: { mode: "FIXED", perCleanerCents: 4525 }, cleanerPayout: 135.75 }, { existingOfferCleanerIds: ["bia"] });
    expect(screen.getByTestId("offer-amount")).toHaveTextContent("$45.25");
    expect(screen.getByTestId("offer-amount")).not.toHaveTextContent(/135.75|first spot/);
    await userEvent.click(screen.getByLabelText("Ana"));
    await userEvent.click(screen.getByRole("button", { name: "Create offers" }));
    expect(createJobOffers).toHaveBeenCalledWith({ jobId: "job-1", cleaners: [cleaners[0]], offeredCompensation: 45.25 });
  });

  it("omits the conditional extra from the preview when the first spot is filled", () => {
    render2({ schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["bia"], requiredCleanerCount: 3,
      cleanerPayout: 100 });
    expect(screen.getByTestId("offer-amount")).toHaveTextContent("$33.33");
    expect(screen.getByTestId("offer-amount")).not.toHaveTextContent(/first spot|100.00/);
  });

  it("warns before sending an offer with no amount", () => {
    render2({ schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [] });
    expect(screen.getByTestId("offer-amount-missing")).toBeInTheDocument();
  });

  it("saves the chosen number of cleaners before the first automatic batch", async () => {
    vi.stubEnv("VITE_AUTOMATIC_OFFERS_MODE", "enabled");
    render2({ schemaVersion: 2, operationalStatus: "UNASSIGNED", assignedCleanerIds: [], cleanerPayout: 120 });
    await userEvent.click(screen.getByRole("button", { name: "One more cleaner" }));
    expect(screen.getByTestId("offer-amount")).toHaveTextContent("$60.00");
    expect(screen.getByRole("checkbox", { name: "Assign the available spots to the first cleaners who accept" })).toBeChecked();
    await userEvent.click(screen.getByLabelText("Ana"));
    await userEvent.click(screen.getByRole("button", { name: "Create offers" }));
    expect(setRequiredCleanerCount).toHaveBeenCalledWith("job-1", 2);
    expect(createJobOffers).toHaveBeenCalledWith({ jobId: "job-1", cleaners: [cleaners[0]], automatic: true });
  });

  it("does not add a blocked recipient to an extended automatic batch until the manager reveals and checks her", async () => {
    vi.stubEnv("VITE_AUTOMATIC_OFFERS_MODE", "enabled");
    const read = vi.spyOn(jobService, "getCleanerSelectionContext").mockResolvedValue({
      byCleanerId: { bia: { sameDayStarts: [], unavailability: { state: "blocked", periods: [] } } },
    });
    try {
      render2({
        schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["ana"], requiredCleanerCount: 2,
        scheduledDate: "2026-11-20", offerDistributionMode: "FIRST_ACCEPT_WINS", checklistContextRevision: 1,
        automaticOfferBatch: { version: 2, capacity: 2, openingContextRevision: 0, currentContextRevision: 1 },
      }, { existingOfferCleanerIds: ["ana"] });
      const reveal = await screen.findByRole("button", { name: "Show 1 unavailable cleaner" });
      const send = screen.getByRole("button", { name: "Create offers" });
      expect(screen.queryByRole("checkbox", { name: "Bia" })).toBeNull();
      expect(screen.getByRole("checkbox", { name: /Ana · Already offered/ })).toBeDisabled();
      expect(send).toBeDisabled();
      await userEvent.click(reveal);
      expect(send).toBeDisabled();
      await userEvent.click(screen.getByRole("checkbox", { name: "Bia" }));
      expect(screen.getByText("You selected Bia for an unavailable period.")).toBeVisible();
      await userEvent.click(send);
      expect(createJobOffers).toHaveBeenCalledExactlyOnceWith({ jobId: "job-1", cleaners: [cleaners[1]], automatic: true });
      expect(read).toHaveBeenCalledTimes(1);
    } finally { read.mockRestore(); }
  });

  it("adds cleaners to an open automatic batch and blocks those already offered", async () => {
    vi.stubEnv("VITE_AUTOMATIC_OFFERS_MODE", "enabled");
    render2({
      schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["ana"], requiredCleanerCount: 2, cleanerPayout: 120,
      offerDistributionMode: "FIRST_ACCEPT_WINS", checklistContextRevision: 1,
      automaticOfferBatch: { version: 2, capacity: 2, openingContextRevision: 0, currentContextRevision: 1 },
    }, { existingOfferCleanerIds: ["ana"] });
    expect(screen.getByLabelText(/Ana · Already offered/)).toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: /first cleaners who accept/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("offer-cleaner-count")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Bia"));
    await userEvent.click(screen.getByRole("button", { name: "Create offers" }));
    expect(createJobOffers).toHaveBeenCalledWith({ jobId: "job-1", cleaners: [cleaners[1]], automatic: true });
  });
});

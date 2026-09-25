import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function renderOfferCleaners(onSent = vi.fn(), language = "en") {
  window.localStorage.setItem("cleanflow-language", language);
  return {
    onSent,
    ...render(
      <TranslationProvider>
        <OfferCleaners
          job={{ id: "job-1", propertyName: "Pilot Property" }}
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
  it("retains selections hidden by filtering and sends the selected cleaner records", async () => {
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
    await user.click(screen.getByRole("button", { name: "Send offers" }));

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
    expect(screen.getByRole("button", { name: "Send offers" })).toBeDisabled();
  });

  it.each([
    ["pt", "Buscar cleaners por nome", "Nenhuma cleaner corresponde a esta busca."],
    ["es", "Buscar cleaners por nombre", "Ninguna cleaner coincide con esta búsqueda."],
  ])("localizes the offer-list search in %s", async (language, searchLabel, noMatch) => {
    const user = userEvent.setup();
    renderOfferCleaners(vi.fn(), language);

    const search = screen.getByRole("searchbox", { name: searchLabel });
    await user.type(search, "missing");
    expect(screen.getByText(noMatch)).toBeVisible();
  });
});

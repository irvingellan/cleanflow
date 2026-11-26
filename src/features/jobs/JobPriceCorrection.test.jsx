import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServiceLifecycleFixtures } from "../../../scripts/serviceLifecycleFixtures.mjs";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetail } from "./JobDetail.jsx";
import { subscribeToJobPriceCorrections } from "./jobPriceCorrectionService.js";

vi.mock("./jobPriceCorrectionService.js", () => ({ subscribeToJobPriceCorrections: vi.fn() }));

function setup({ paid = true, manager = true } = {}) {
  const fixture = buildServiceLifecycleFixtures().find(({ id }) => id === "assigned");
  const job = { ...fixture.job, clientPrice: 125, ...(paid ? { payoutId: "payout" } : {}) };
  const correctPrice = vi.fn().mockResolvedValue({ unchanged: false });
  const unsubscribe = vi.fn();
  let receiveCorrections;
  subscribeToJobPriceCorrections.mockImplementation((_jobId, onChange) => {
    receiveCorrections = onChange;
    return unsubscribe;
  });
  const view = render(
    <TranslationProvider>
      <JobDetail {...fixture} job={job} onCorrectPrice={manager ? correctPrice : undefined} />
    </TranslationProvider>,
  );
  const financial = view.container.querySelector(".job-pricing").closest("details");
  financial.open = true;
  return { correctPrice, job, unsubscribe, ...view, publish: (rows) => act(() => receiveCorrections(rows)) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Job Detail client price corrections", () => {
  it("offers a client-only form after payout and submits a trimmed reason with a rate in cents", async () => {
    const { correctPrice } = setup();
    expect(screen.queryByRole("button", { name: "Edit prices" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Correct price" }));
    expect(screen.getByLabelText("Client price")).toHaveValue(125);
    expect(screen.queryByRole("combobox", { name: /cleaner/i })).not.toBeInTheDocument();
    const reason = screen.getByRole("textbox", { name: "Reason" });
    expect(reason).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Save prices" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a reason of 3 to 200 characters.");
    expect(correctPrice).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: /client/i }), { target: { value: "HOURLY" } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "47.50" } });
    fireEvent.change(reason, { target: { value: "  Confirmed hourly rate  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save prices" }));
    await waitFor(() => expect(correctPrice).toHaveBeenCalledExactlyOnceWith({
      clientPricing: { mode: "HOURLY", hourlyRateCents: 4750 },
      reason: "Confirmed hourly rate",
    }));
    expect(await screen.findByRole("button", { name: "Correct price" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Reason" })).not.toBeInTheDocument();
  });

  it("shows dates, localized prices and reasons as history arrives and stops listening on unmount", () => {
    const { job, publish, unsubscribe, unmount } = setup();
    expect(subscribeToJobPriceCorrections).toHaveBeenCalledWith(job.id, expect.any(Function), expect.any(Function));
    publish([]);
    expect(screen.queryByText("Corrections")).not.toBeInTheDocument();
    publish([{
      id: "correction", kind: "CLIENT_PRICE", at: { toDate: () => new Date(2026, 10, 25, 12) },
      before: { mode: "FIXED", amountCents: 12500 },
      after: { mode: "HOURLY", hourlyRateCents: 4750 },
      reason: "Confirmed hourly rate",
    }]);
    const section = screen.getByText("Corrections").closest("details");
    section.open = true;
    expect(screen.getByText(/Nov 25, 2026/)).toBeVisible();
    expect(screen.getByText("$125.00 → $47.50 per hour")).toBeVisible();
    expect(screen.getByText("Confirmed hourly rate")).toBeVisible();
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("keeps normal editing for unpaid Jobs and hides correction features outside manager Job Detail", () => {
    const unpaid = setup({ paid: false });
    expect(screen.getByRole("button", { name: "Edit prices" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Correct price" })).not.toBeInTheDocument();
    unpaid.unmount();
    subscribeToJobPriceCorrections.mockClear();
    setup({ manager: false });
    expect(screen.queryByRole("button", { name: "Correct price" })).not.toBeInTheDocument();
    expect(screen.queryByText("Corrections")).not.toBeInTheDocument();
    expect(subscribeToJobPriceCorrections).not.toHaveBeenCalled();
  });
});

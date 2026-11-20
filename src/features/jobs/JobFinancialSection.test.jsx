import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider, useTranslation } from "../../i18n/translations.js";
import { JobFinancialSection } from "./JobFinancialSection.jsx";
import { useJobPriceEdit } from "./useJobPriceEdit.js";

function Financial({ job, save }) {
  const { language, translate } = useTranslation();
  const edit = useJobPriceEdit({ job, translate, onUpdatePrices: save });
  return <JobFinancialSection job={job} translate={translate} language={language} grossMargin={null} {...edit} />;
}

function show(job, save = vi.fn()) {
  const view = render(<TranslationProvider><Financial job={{ id: "example-job", ...job }} save={save} /></TranslationProvider>);
  view.container.querySelector("details").open = true;
  return view;
}

describe("Job financial section", () => {
  it("shows separate hourly and fixed rates, then saves the edited modes after the write resolves", async () => {
    let finish;
    const save = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    show({ billing: { mode: "HOURLY", hourlyRateCents: 3500 }, cleanerPayout: 12.5 }, save);
    expect(screen.getByText("$35.00 per hour")).toBeVisible();
    expect(screen.getByText("$12.50")).toBeVisible();
    fireEvent.click(screen.getByText("Edit prices"));
    expect(screen.getByLabelText("Client price per hour")).toHaveValue(35);
    fireEvent.change(screen.getByLabelText("Client pricing method"), { target: { value: "FIXED" } });
    fireEvent.change(screen.getByLabelText("Cleaner pay method"), { target: { value: "HOURLY" } });
    fireEvent.click(screen.getByText("Save prices"));
    expect(save).toHaveBeenCalledWith({ clientPrice: 35, cleanerPayout: undefined, pay: { mode: "HOURLY", rateCents: 1250 } });
    expect(screen.getByLabelText("Client price")).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole("status")).toBeVisible());
  });

  it("keeps an unset hourly rate visible for correction and keeps edits on write failure", async () => {
    show({ pay: { mode: "HOURLY" } }, vi.fn().mockRejectedValue(new Error("unavailable")));
    expect(screen.getAllByText("Not set")).toHaveLength(3);
    fireEvent.click(screen.getByText("Edit prices"));
    expect(screen.getByLabelText("Cleaner pay per hour")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Cleaner pay per hour"), { target: { value: "23" } });
    fireEvent.click(screen.getByText("Save prices"));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByLabelText("Cleaner pay per hour")).toHaveValue(23);
  });

  it.each([
    [{ clientPrice: 1.005 }, "Client price", 1.005],
    [{ billing: { mode: "HOURLY", hourlyRateCents: 135.5 } }, "Client price per hour", 1.355],
    [{ billing: { mode: "UNRECOGNIZED" }, clientPrice: 27 }, "Client price", null],
  ])("requires explicit correction of an invalid existing client rate when editing cleaner pay", async (job, label, rawValue) => {
    const save = vi.fn();
    show({ ...job, cleanerPayout: 12 }, save);
    fireEvent.click(screen.getByRole("button", { name: "Edit prices" }));
    expect(screen.getByLabelText(label)).toHaveValue(rawValue);
    fireEvent.change(screen.getByLabelText("Cleaner payout"), { target: { value: "15" } });
    fireEvent.click(screen.getByText("Save prices"));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(label), { target: { value: "23.25" } });
    fireEvent.click(screen.getByText("Save prices"));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
  });

  it("keeps the recorded legacy amount visible and locks editing after payment", () => {
    show({ payoutId: "example-payout", cleanerPayout: 200 });
    expect(screen.getByText("$200.00")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit prices" })).toBeDisabled();
  });
});

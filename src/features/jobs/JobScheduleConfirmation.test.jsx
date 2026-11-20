import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { JobScheduleConfirmation } from "./JobScheduleConfirmation.jsx";
import { getCleanerSelectionContext } from "./jobService.js";

vi.mock("./jobService.js", () => ({ getCleanerSelectionContext: vi.fn() }));

it("marks an unavailable replacement after a schedule decline, with the manager keeping the decision", async () => {
  const context = { byCleanerId: { busy: { sameDayStarts: [], unavailability: { state: "blocked", periods: [] } } } };
  getCleanerSelectionContext.mockResolvedValue(context);
  const offer = vi.fn().mockResolvedValue({});
  render(<JobScheduleConfirmation job={{ id: "demo-job", operationalStatus: "ASSIGNED", scheduleRevision: 4, scheduledDate: "2026-11-20" }}
    responses={[{ cleanerId: "previous", state: "DECLINED" }]} cleanerName={id => ({ busy: "Team B", free: "Team A", previous: "Team C" })[id]}
    translate={key => key} language="en" onOfferReplacement={offer} canOfferReplacement
    replacementCandidates={[{ id: "busy" }, { id: "free" }]} />);
  const blocked = await screen.findByRole("option", { name: "Team B · Unavailable this day" });
  const select = screen.getByRole("combobox", { name: "Cleaner for the open spot" });
  expect(blocked).toBe(select.lastElementChild);
  fireEvent.change(select, { target: { value: "busy" } });
  expect(screen.getByText("You selected Team B for an unavailable period.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Offer the spot to another cleaner" }));
  await waitFor(() => expect(offer).toHaveBeenCalledExactlyOnceWith("busy", 4));
  expect(getCleanerSelectionContext).toHaveBeenCalledTimes(1);
});

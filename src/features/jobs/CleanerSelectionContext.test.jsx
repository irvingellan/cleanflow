import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { OfferCleaners } from "./JobWorkflowViews.jsx";

const mocks = vi.hoisted(() => ({ context: vi.fn(), createOffers: vi.fn() }));
vi.mock("./jobService.js", () => ({ getCleanerSelectionContext: mocks.context }));
vi.mock("./jobOfferService.js", async (importOriginal) => ({
  ...(await importOriginal()),
  createJobOffers: mocks.createOffers,
}));

const job = { id: "synthetic-job", propertyId: "synthetic-property", scheduledDate: "2026-11-14" };
const cleaners = [
  { id: "new", name: "Alex Demo", active: true },
  { id: "experienced", name: "Riley Demo", active: true },
  { id: "other", name: "Taylor Demo", active: true },
];
function page(overrides = {}) {
  return <TranslationProvider><OfferCleaners job={job} cleaners={cleaners} {...overrides} /></TranslationProvider>;
}
function result(date = "2026-11-01") {
  return {
    byCleanerId: {
      experienced: { sameDayStarts: ["08:30", null], completedHereCount: 3, lastCompletedHereDate: date },
      other: { sameDayStarts: [], completedHereCount: 1, lastCompletedHereDate: date },
    },
    historyPartial: false,
    schedulePartial: false,
  };
}
const checkboxOrder = () => screen.getAllByRole("checkbox").map((row) => row.getAttribute("aria-label"));

beforeEach(() => {
  mocks.context.mockReset().mockResolvedValue(result());
  mocks.createOffers.mockReset().mockResolvedValue({ id: job.id, operationalStatus: "OFFERED" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("manager cleaner selection context", () => {
  it("orders cleaners by recent house history and keeps a same-day job selectable", async () => {
    render(page({ onSent: vi.fn() }));
    const scheduled = await screen.findByText("Already scheduled that day · 08:30, Time not set");
    expect(scheduled).toBeVisible();
    expect(screen.getByText("Cleaned here 3 times in recent history · Last: Nov 1, 2026")).toBeVisible();
    expect(checkboxOrder()).toEqual(["Riley Demo", "Taylor Demo", "Alex Demo"]);

    const choice = screen.getByRole("checkbox", { name: "Riley Demo", description: /Already scheduled that day/ });
    expect(choice).toBeEnabled();
    fireEvent.click(choice);
    expect(choice).toBeChecked();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alex" } });
    expect(checkboxOrder()).toEqual(["Alex Demo"]);
    fireEvent.click(screen.getByRole("button", { name: "Create offers" }));
    expect(mocks.createOffers).toHaveBeenCalledWith({ jobId: job.id, cleaners: [cleaners[1]] });
  });

  it.each(["manual", "automatic"])("shows blocked cleaners last, starts them unchecked, and sends a %s offer after explicit selection", async (mode) => {
    vi.stubEnv("VITE_AUTOMATIC_OFFERS_MODE", mode === "automatic" ? "enabled" : "disabled");
    const target = { ...job, scheduledStart: "10:30", schemaVersion: 2, assignedCleanerIds: [], operationalStatus: "UNASSIGNED" };
    const context = result();
    context.byCleanerId.experienced.unavailability = { state: "blocked", periods: [{ startTime: "09:00", endTime: "12:00" }] };
    context.byCleanerId.new = { sameDayStarts: [], completedHereCount: 0, unavailability: { state: "blocked", periods: [] } };
    mocks.context.mockResolvedValue(context);
    render(page({ job: target, onSent: vi.fn() }));
    const blocked = await screen.findByRole("checkbox", { name: "Riley Demo", description: /Unavailable this day.*9:00 AM–12:00 PM/ });
    expect(screen.getAllByRole("checkbox").filter(input => input.getAttribute("aria-label")).map(input => input.getAttribute("aria-label")))
      .toEqual(["Taylor Demo", "Riley Demo", "Alex Demo"]);
    expect(blocked).toBeEnabled();
    expect(blocked).not.toBeChecked();
    expect(screen.queryByText(/You selected/)).toBeNull();
    fireEvent.click(blocked);
    fireEvent.click(screen.getByRole("checkbox", { name: "Taylor Demo" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Taylor" } });
    expect(screen.getByText("You selected Riley Demo for an unavailable period.")).toBeVisible();
    expect(mocks.context).toHaveBeenCalledTimes(1);
    expect(mocks.context.mock.calls[0][0]).toMatchObject({ scheduledStart: "10:30" });
    fireEvent.click(screen.getByRole("button", { name: "Create offers" }));
    expect(mocks.createOffers).toHaveBeenCalledExactlyOnceWith({ jobId: job.id, cleaners: [cleaners[1], cleaners[2]],
      ...(mode === "automatic" ? { automatic: true } : {}) });
  });

  it("distinguishes partial blocks on an untimed Job, then resolves a changed Job start", async () => {
    const context = result();
    context.byCleanerId.other.unavailability = { state: "unknown", periods: [{ startTime: "13:30", endTime: "15:00" }] };
    mocks.context.mockResolvedValueOnce(context).mockResolvedValueOnce(result());
    const { rerender } = render(page());
    const affected = await screen.findByRole("checkbox", { name: "Taylor Demo", description: /Possible time conflict.*1:30 PM–3:00 PM/ });
    fireEvent.click(affected);
    expect(screen.getByText("Check the time with Taylor Demo before confirming.")).toBeVisible();
    rerender(page({ job: { ...job, scheduledStart: "09:00" } }));
    await waitFor(() => expect(screen.queryByText(/Possible time conflict/)).toBeNull());
    expect(screen.queryByText(/Check the time with Taylor Demo/)).toBeNull();
    expect(mocks.context).toHaveBeenCalledTimes(2);
  });

  it("preserves a verified availability mark when schedule history could not be read", async () => {
    const context = result();
    context.byCleanerId.other.unavailability = { state: "blocked", periods: [] };
    mocks.context.mockResolvedValue({ ...context, jobContextUnavailable: true });
    render(page());
    expect(await screen.findByText(/Some schedule or recent history details could not be checked/)).toBeVisible();
    expect(screen.queryByText(/Search limits reached/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Taylor Demo", description: /Unavailable this day/ })).toBeEnabled();
  });
  it("keeps the available history and warns when only the availability read fails", async () => {
    mocks.context.mockResolvedValue({ ...result(), availabilityUnavailable: true });
    render(page());
    expect(await screen.findByText(/Unavailable days could not be checked/)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Riley Demo", description: /Cleaned here 3 times/ })).toBeEnabled();
  });

  it("shows truncated counts as lower bounds and does not mark unconfirmed statuses", async () => {
    mocks.context.mockResolvedValue({ ...result(), historyPartial: true, schedulePartial: true });
    render(page());
    expect(await screen.findByText(/Search limits reached/)).toBeVisible();
    expect(screen.getByText("Cleaned here at least 3 times in recent history · Last found: Nov 1, 2026")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Alex Demo" })).not.toHaveAccessibleDescription();
  });

  it("keeps the picker usable when context is unavailable", async () => {
    mocks.context.mockRejectedValue(new Error("read failed"));
    render(page());
    expect(await screen.findByText(/Schedules and recent history could not be checked/)).toBeVisible();
    expect(screen.getByText(/Unavailable days could not be checked/)).toBeVisible();
    expect(checkboxOrder()).toEqual(["Alex Demo", "Riley Demo", "Taylor Demo"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Alex Demo" }));
    expect(screen.getByRole("button", { name: "Create offers" })).toBeEnabled();
  });

  it("aborts a stale read and never displays its late rows when the Job date changes", async () => {
    let settle;
    mocks.context.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }))
      .mockResolvedValueOnce({ ...result(), byCleanerId: {} });
    const { rerender } = render(page());
    await waitFor(() => expect(mocks.context).toHaveBeenCalledTimes(1));
    const firstRequest = mocks.context.mock.calls[0][1].signal;
    rerender(page({ job: { ...job, scheduledDate: "2026-11-15" } }));
    await waitFor(() => expect(mocks.context).toHaveBeenCalledTimes(2));
    expect(firstRequest.aborted).toBe(true);
    await act(async () => settle(result("2026-11-02")));
    expect(screen.queryByText(/Already scheduled that day/)).not.toBeInTheDocument();
    expect(checkboxOrder()).toEqual(["Alex Demo", "Riley Demo", "Taylor Demo"]);
  });

  it("stops a stalled context read without stopping cleaner selection", async () => {
    vi.useFakeTimers();
    mocks.context.mockReturnValue(new Promise(() => {}));
    render(page());
    expect(screen.getByText(/Checking schedules/)).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(mocks.context.mock.calls[0][1].signal.aborted).toBe(true);
    expect(screen.getByText(/Schedules and recent history could not be checked/)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Alex Demo" })).toBeEnabled();
  });
});

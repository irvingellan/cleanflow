import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { WeeklyClosePreview } from "./WeeklyClosePreview.jsx";
import { buildWeeklyClose } from "./weeklyCloseModel.js";
import { loadWeeklyClose, loadWeeklyCloseJob } from "./weeklyCloseService.js";

vi.mock("./weeklyCloseService.js", () => ({ loadWeeklyClose: vi.fn(), loadWeeklyCloseJob: vi.fn() }));

const period = { start: "2026-09-21", end: "2026-09-27" };
const job = (id, clientPrice, cleanerPayout, changes = {}) => ({
  id, clientPrice, cleanerPayout, dataProvenance: "REAL", operationalStatus: "COMPLETED",
  scheduledDate: period.start, clientId: "fixture-client", clientName: "Example client",
  propertyName: id, legacyPayoutEligible: true,
  assignedCleanerId: "fixture-cleaner", assignedCleanerName: "Example cleaner", ...changes,
});

async function openWeek(jobs, options = {}) {
  const onOpenJob = vi.fn();
  loadWeeklyClose.mockResolvedValue(buildWeeklyClose({ period, jobs, ...options }));
  render(<TranslationProvider><WeeklyClosePreview initialSelection={{ period }}
    onOpenJob={onOpenJob} onBack={vi.fn()} /></TranslationProvider>);
  const count = await screen.findByText(/^Completed services( loaded)?$/, { selector: "dt" });
  const metrics = within(count.closest("dl"));
  return { onOpenJob, metric: (name) => metrics.getByText(name, { selector: "dt" }).parentElement };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.setItem("cleanflow-language", "en");
});

it("shows one team quote and leaves its actual payment unknown", async () => {
  const { metric } = await openWeek([job("Example shared property", 110, 90, {
    schemaVersion: 2, assignedCleanerIds: ["one", "two"],
  })], { cleanerNamesById: { one: "Example one", two: "Example two" } });
  expect(metric("Cleaner payout quotes").querySelector("dd")).toHaveTextContent("$90.00");
  expect(metric("Gross operational margin").querySelector("dd")).toHaveTextContent("$20.00");
  expect(document.querySelector(".weekly-close-job")).toHaveTextContent("Example one · Example two");
  expect(document.querySelector(".weekly-close-status")).toHaveTextContent("Unknown");
  expect(screen.queryByRole("button", { name: /Open service/ })).not.toBeInTheDocument();
});

it("keeps zero valid, distinguishes an invalid value and counts a job missing both fields once", async () => {
  await openWeek([
    job("Example zero", 0, 0), job("Example invalid", 0, -5), job("Example both", null, null),
  ]);
  const issues = within(screen.getByRole("region", { name: "2 services with incomplete amounts" }));
  expect(issues.getAllByRole("listitem")).toHaveLength(2);
  expect(issues.queryByText("Example zero")).not.toBeInTheDocument();
  const invalid = issues.getByText("Example invalid").closest("li");
  expect(invalid).toHaveTextContent("Cleaner payout is invalid.");
  expect(invalid).toHaveTextContent("$0.00");
  expect(invalid).not.toHaveTextContent("Client price is not set.");
  const both = issues.getByText("Example both").closest("li");
  expect(both).toHaveTextContent("Client price is not set.");
  expect(both).toHaveTextContent("Cleaner payout is not set.");
  expect(within(both).getAllByRole("button")).toHaveLength(1);
});

it("excludes cancelled and archived services from actionable financial issues", async () => {
  const { metric } = await openWeek([
    job("Example cancelled", null, 90, { operationalStatus: "CANCELLED" }),
    job("Example archived", 110, null, { archivedAt: true }), job("Example included", 15, 10),
  ]);
  expect(metric("Completed services").querySelector("dd")).toHaveTextContent(/^1$/);
  expect(metric("Gross operational margin").querySelector("dd")).toHaveTextContent("$5.00");
  expect(screen.queryByText(/Example (cancelled|archived)/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Open service/ })).not.toBeInTheDocument();
});

it("shows an empty week without declaring its reconciliation complete", async () => {
  const { metric } = await openWeek([]);
  expect(screen.getByText(/No completed REAL services for this selection/)).toBeInTheDocument();
  expect(metric("Completed services").querySelector("dd")).toHaveTextContent(/^0$/);
  expect(metric("Gross operational margin").querySelector("dd")).toHaveTextContent("$0.00");
  expect(screen.queryByRole("button", { name: /Open service/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/All included services have complete reconciliation data/)).not.toBeInTheDocument();
});

it("does not turn even paired margins into a complete total in a truncated period", async () => {
  const { metric } = await openWeek([
    job("Example charge", 110, null), job("Example payout", null, 90),
    job("Example pair", 70, 30, { clientId: "paired-client", clientName: "Paired client" }),
  ], { coverage: { truncated: true, scanned: 200, limit: 200 } });
  expect(screen.getByText(/Partial results/)).toBeVisible();
  expect(metric("Gross operational margin")).toHaveTextContent("Incomplete");
  expect(metric("Gross operational margin")).not.toHaveTextContent("$");
  expect(screen.getByRole("region", { name: "2 services with incomplete amounts" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Client"), { target: { value: "id:paired-client" } });
  expect(metric("Gross operational margin").querySelector("dd")).toHaveTextContent("Incomplete");
  expect(metric("Gross operational margin")).toHaveTextContent(/Known subtotal:.*40\.00/);
  expect(screen.queryByRole("button", { name: /Open service/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/All included services have complete reconciliation data/)).not.toBeInTheDocument();
});

it("opens distinct job IDs when different clients share the same property name and service date", async () => {
  const first = job("first", 110, null, { propertyName: "Example property" });
  const second = job("second", null, 90, { clientId: "other-client", propertyName: "Example property" });
  const { onOpenJob } = await openWeek([first, second]);
  const selector = screen.getByLabelText("Client");
  for (const [source, missing, other] of [
    [first, "Cleaner payout is not set.", "Client price is not set."],
    [second, "Client price is not set.", "Cleaner payout is not set."],
  ]) {
    const selectedClient = `id:${source.clientId}`;
    fireEvent.change(selector, { target: { value: selectedClient } });
    const issues = screen.getByRole("region", { name: "1 service with incomplete amounts" });
    expect(issues).toHaveTextContent(missing);
    expect(issues).not.toHaveTextContent(other);
    loadWeeklyCloseJob.mockResolvedValueOnce(source);
    fireEvent.click(within(issues).getByRole("button", { name: /Open service/ }));
    await waitFor(() => expect(onOpenJob).toHaveBeenCalledWith(source, { period, selectedClient }));
    expect(loadWeeklyCloseJob).toHaveBeenLastCalledWith(source.id);
  }
});

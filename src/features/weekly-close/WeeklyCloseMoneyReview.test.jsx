import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { WeeklyClosePreview } from "./WeeklyClosePreview.jsx";
import { buildWeeklyClose } from "./weeklyCloseModel.js";
import { loadWeeklyClose, loadWeeklyCloseJob } from "./weeklyCloseService.js";

vi.mock("./weeklyCloseService.js", () => ({ loadWeeklyClose: vi.fn(), loadWeeklyCloseJob: vi.fn() }));
const period = { start: "2026-09-21", end: "2026-09-27" };
const base = { dataProvenance: "REAL", operationalStatus: "COMPLETED", scheduledDate: period.start,
  clientId: "fixture-client", clientName: "Example client", assignedCleanerId: "fixture-cleaner",
  assignedCleanerName: "Example cleaner", legacyPayoutEligible: true };
const jobs = [
  { ...base, id: "charge-only", propertyName: "Example North", clientPrice: 110 },
  { ...base, id: "payout-only", propertyName: "Example South", cleanerPayout: 90 },
];
const mount = (rows = jobs, onOpenJob = vi.fn()) => {
  loadWeeklyClose.mockResolvedValue(buildWeeklyClose({ period, jobs: rows }));
  return render(<TranslationProvider><WeeklyClosePreview onOpenJob={onOpenJob} onBack={vi.fn()} /></TranslationProvider>);
};
beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.setItem("cleanflow-language", "en");
});

it("does not present disjoint charges and payouts as comparable subtotals, overall or per client", async () => {
  mount();
  await screen.findByText("Example client", { selector: "strong" });
  for (const area of [document.querySelector(".weekly-close-metrics"), document.querySelector(".weekly-close-client summary")]) {
    for (const label of ["Client charges", "Cleaner payout quotes", "Gross operational margin"]) {
      const metric = within(area).getByText(label, { exact: true }).parentElement;
      expect(metric).toHaveTextContent("Incomplete");
      expect(metric).not.toHaveTextContent(/\$|110|90/);
    }
  }
});

it("identifies both incomplete services, the affected field and the canonical job to open", async () => {
  const onOpenJob = vi.fn();
  const source = { id: "payout-only", propertyName: "Example South", clientId: "fixture-client" };
  loadWeeklyCloseJob.mockResolvedValue(source);
  mount(jobs, onOpenJob);
  const panel = await screen.findByRole("region", { name: "2 services with incomplete amounts" });
  const [north, south] = within(panel).getAllByRole("listitem");
  expect(north).toHaveTextContent("Example North");
  expect(north).toHaveTextContent("Cleaner payout is not set.");
  expect(south).toHaveTextContent("Example South");
  expect(south).toHaveTextContent("Client price is not set.");
  fireEvent.click(within(south).getByRole("button", { name: /open service/i }));
  await vi.waitFor(() => expect(onOpenJob).toHaveBeenCalledWith(source, expect.any(Object)));
  expect(loadWeeklyCloseJob).toHaveBeenCalledWith("payout-only");
});

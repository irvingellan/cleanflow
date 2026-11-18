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

it.each([
  ["en", "1 service with incomplete amounts", "Client price is not set.", "Open service"],
  ["pt", "1 serviço com valores incompletos", "Valor do cliente não definido.", "Abrir serviço"],
  ["es", "1 servicio con importes incompletos", "Importe del cliente no establecido.", "Abrir servicio"],
])("names the field and the direct action in %s", async (language, title, reason, open) => {
  window.localStorage.setItem("cleanflow-language", language);
  mount([jobs[1]]);
  const panel = await screen.findByRole("region", { name: title });
  expect(panel).toHaveTextContent(reason);
  expect(within(panel).getByRole("button").getAttribute("aria-label")).toContain(open);
});

it("lets the manager retry a failed service lookup without losing the review", async () => {
  const onOpenJob = vi.fn();
  loadWeeklyCloseJob.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce({ id: jobs[0].id });
  mount(jobs, onOpenJob);
  const panel = await screen.findByRole("region", { name: "2 services with incomplete amounts" });
  const button = within(panel).getByRole("button", { name: /open service.*Example North/i });
  fireEvent.click(button);
  expect(await within(panel).findByRole("alert")).toHaveTextContent("Could not open this service");
  expect(onOpenJob).not.toHaveBeenCalled();
  fireEvent.click(button);
  await vi.waitFor(() => expect(onOpenJob).toHaveBeenCalledTimes(1));
  expect(loadWeeklyCloseJob.mock.calls).toEqual([["charge-only"], ["charge-only"]]);
});

it("ignores a service response after the manager chooses another client", async () => {
  let resolveJob;
  const onOpenJob = vi.fn();
  loadWeeklyCloseJob.mockReturnValue(new Promise((resolve) => { resolveJob = resolve; }));
  mount([jobs[0], { ...jobs[1], clientId: "other-client", clientName: "Other client" }], onOpenJob);
  const panel = await screen.findByRole("region", { name: "2 services with incomplete amounts" });
  fireEvent.click(within(panel).getByRole("button", { name: /open service.*Example North/i }));
  fireEvent.change(screen.getByLabelText("Client"), { target: { value: "id:other-client" } });
  resolveJob({ id: jobs[0].id });
  const filtered = await screen.findByRole("region", { name: "1 service with incomplete amounts" });
  expect(filtered).toHaveTextContent("Example South");
  expect(onOpenJob).not.toHaveBeenCalled();
});

it("does not call an unreconciled selection complete when a conflicting service was excluded", async () => {
  mount([jobs[0], { ...jobs[0], clientPrice: 300 }, { ...jobs[1], clientPrice: 120 }]);
  await screen.findByText("Example client", { selector: "strong" });
  expect(screen.getByText(/records? excluded from this summary/)).toBeInTheDocument();
  expect(screen.queryByText(/All included services have complete reconciliation data/)).not.toBeInTheDocument();
});

it("does not describe a partial margin that this screen deliberately withholds", async () => {
  mount();
  await screen.findByRole("region", { name: "2 services with incomplete amounts" });
  expect(screen.queryByText(/margin subtotals include only services with both prices/i)).not.toBeInTheDocument();
});

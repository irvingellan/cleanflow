import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { getActiveClients } from "../clients/clientService.js";
import { getPropertyJobHistory } from "../jobs/jobService.js";
import { PropertyDetail } from "./PropertyDetail.jsx";
import { PropertyEditForm, PropertyForm } from "./PropertyForm.jsx";

vi.mock("../clients/clientService.js", () => ({ getActiveClients: vi.fn() }));
vi.mock("../jobs/jobService.js", () => ({ getPropertyJobHistory: vi.fn() }));
const client = { id: "client", name: "Example Client" };
const property = { id: "property", name: "Example Property", clientId: client.id };
const configured = {
  client: { mode: "HOURLY", amountCents: 4510 },
  cleaner: { mode: "FIXED", amountCents: 3900, byCleanerCount: { 2: 2600 } },
};
const show = (element) => render(<TranslationProvider>{element}</TranslationProvider>);
const change = (input, value) => fireEvent.change(input, { target: { value } });
const edit = () => fireEvent.click(screen.getByRole("button", { name: "Edit prices · Deep cleaning" }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save property" }));

describe("Property service rate workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveClients.mockResolvedValue([client]);
    getPropertyJobHistory.mockResolvedValue({ upcomingJobs: [], recentJobs: [] });
  });

  it("creates hourly and fixed rates with a per-person override and rejects fractional cents", async () => {
    const onSaved = vi.fn();
    show(<PropertyForm preselectedClient={client} onSaved={onSaved} />);
    change(screen.getByLabelText("Property or address name"), property.name);
    edit();
    const clientInputs = within(screen.getByRole("group", { name: "Client price" }));
    const cleanerInputs = within(screen.getByRole("group", { name: "Cleaner pay" }));
    change(clientInputs.getByLabelText("Pricing"), "HOURLY");
    change(clientInputs.getByLabelText("Amount (USD)"), "45.101");
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("Deep cleaning");
    expect(onSaved).not.toHaveBeenCalled();
    change(clientInputs.getByLabelText("Amount (USD)"), "45.10");
    change(cleanerInputs.getByLabelText("Amount (USD)"), "39");
    fireEvent.click(cleanerInputs.getByText("Pay by team size"));
    change(cleanerInputs.getByLabelText("Amount per cleaner (USD)"), "26");
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      serviceRates: { DEEP_CLEANING: configured },
    })));
  });

  it("clears a configured service row independently and keeps explicit zero on another", async () => {
    const onSaved = vi.fn();
    const other = { client: { mode: "FIXED", amountCents: 0 } };
    show(<PropertyEditForm property={{ ...property, serviceRates: { STANDARD: other, DEEP_CLEANING: configured } }} onSaved={onSaved} />);
    edit();
    const clientInputs = within(screen.getByRole("group", { name: "Client price" }));
    const cleanerInputs = within(screen.getByRole("group", { name: "Cleaner pay" }));
    change(clientInputs.getByLabelText("Amount (USD)"), "");
    change(cleanerInputs.getByLabelText("Amount (USD)"), "");
    fireEvent.click(cleanerInputs.getByText("Pay by team size"));
    change(cleanerInputs.getByLabelText("Amount per cleaner (USD)"), "");
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      serviceRates: { STANDARD: other }, changedRateTypes: ["DEEP_CLEANING"],
    })));
  });

  it("retains an empty rate table during client loading and on a client read error", async () => {
    let rejectClients;
    getActiveClients.mockReturnValueOnce(new Promise((_, reject) => { rejectClients = reject; }));
    show(<PropertyForm onSaved={vi.fn()} />);
    expect(screen.getByText("Loading clients…")).toBeVisible();
    expect(within(screen.getByRole("table")).getAllByText("Not set")).toHaveLength(10);
    rejectClients(new Error("offline"));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("table", { name: "Prices by service type" })).toBeVisible();
  });

  it("shows rates and team amounts while history is loading and after its error", async () => {
    let rejectHistory;
    getPropertyJobHistory.mockReturnValueOnce(new Promise((_, reject) => { rejectHistory = reject; }));
    show(<PropertyDetail property={{ ...property, defaultClientPrice: 195, serviceRates: { DEEP_CLEANING: configured } }} />);
    const table = within(screen.getByRole("table", { name: "Prices by service type" }));
    expect(table.getByText("$195.00")).toBeVisible();
    expect(table.getByText("$45.10 per hour")).toBeVisible();
    expect(table.getByText("Team of 2: $26.00 each")).toBeVisible();
    expect(table.getAllByText("Not set").length).toBeGreaterThan(0);
    rejectHistory(new Error("offline"));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(table.getByText("$45.10 per hour")).toBeVisible();
  });
});

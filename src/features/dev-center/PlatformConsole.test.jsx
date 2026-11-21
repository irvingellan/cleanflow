import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PlatformConsole } from "./PlatformConsole.jsx";
import { getPlatformOverview } from "./devCenterService.js";

vi.mock("./devCenterService.js", () => ({ getPlatformOverview: vi.fn() }));

const first = {
  id: "example-north", displayName: "North Demo", createdAt: null, lastActivityAt: "2026-01-15T12:00:00Z",
  people: { activeManagers: 1, activeCleaners: 2, archivedCleaners: 3 },
  clients: { active: 4, archived: 0 }, properties: { active: 5, archived: 1 },
  jobs: { total: 9, created30d: 7, scheduled7d: 3, completed30d: 2 },
  attention: { openIssues: 3, waitingOffers: 1 },
  health: { status: "ok", pageLoads: 220, failedPageLoads: 1, pageFailureRate: 1 / 220, timedLoads: 210, medianMs: 250, p95Ms: 400, failedOperations: { offers: 2 }, operationAttempts: { offers: 90 }, operationFailureRates: { offers: 2 / 90 } },
};
const second = { ...first, id: "example-south", displayName: null, lastActivityAt: null };
const third = { ...first, id: "example-east", displayName: "East Demo", lastActivityAt: "2026-01-15T10:00:00Z" };

function show(language = "en") {
  localStorage.setItem("cleanflow-language", language);
  return render(<StrictMode><TranslationProvider><PlatformConsole><p>Version panel</p></PlatformConsole></TranslationProvider></StrictMode>);
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => { getPlatformOverview.mockReset(); });
afterEach(() => { localStorage.removeItem("cleanflow-language"); });

describe("PlatformConsole", () => {
  it("waits for access before displaying the summary and the existing version panel", async () => {
    const response = deferred();
    getPlatformOverview.mockReturnValueOnce(response.promise);
    show("pt");
    expect(screen.getByRole("status")).toHaveTextContent("Carregando empresas");
    expect(screen.queryByText("Version panel")).not.toBeInTheDocument();
    await act(async () => response.resolve({ organizations: [] }));
    expect(screen.getByText("Nenhuma empresa encontrada.")).toBeVisible();
    expect(screen.getByText("Version panel")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(getPlatformOverview).toHaveBeenCalledOnce();
  });

  it("retries a failed read and uses the new result", async () => {
    getPlatformOverview.mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ organizations: [first] });
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the platform overview.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "Companies" })).toBeVisible();
    expect(getPlatformOverview).toHaveBeenCalledTimes(2);
    expect(getPlatformOverview).toHaveBeenLastCalledWith(undefined);
  });

  it.each(["functions/permission-denied", "functions/unauthenticated"])("hides all platform data on %s", async code => {
    getPlatformOverview.mockRejectedValueOnce({ code });
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Developer access is required");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Version panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("adds every company's totals and sorts activity in either direction with missing dates last", async () => {
    getPlatformOverview.mockResolvedValueOnce({ organizations: [second, third, first] });
    show();
    const table = await screen.findByRole("table", { name: "Companies" });
    const names = () => within(table).getAllByRole("rowheader").map(cell => within(cell).getByRole("button").textContent);
    expect(names()).toEqual(["North Demo", "East Demo", "ID example-south"]);
    for (const org of [first, third]) {
      const row = within(table).getByRole("button", { name: org.displayName }).closest("tr");
      const timestamp = new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(new Date(org.lastActivityAt));
      expect(row.querySelector("time").textContent).toBe(timestamp);
    }
    const totals = document.querySelector(".platform-summary");
    expect([...totals.querySelectorAll("dd")].map(item => item.textContent)).toEqual(["3", "6", "21", "9"]);
    const sort = within(table).getByRole("columnheader", { name: "Last activity" });
    expect(sort).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(within(sort).getByRole("button"));
    expect(sort).toHaveAttribute("aria-sort", "ascending");
    expect(names()).toEqual(["East Demo", "North Demo", "ID example-south"]);
    expect(getPlatformOverview).toHaveBeenCalledTimes(1);
  });

  it("opens company details from the keyboard, localizes health and staff, and restores focus", async () => {
    const user = userEvent.setup();
    getPlatformOverview.mockResolvedValueOnce({ organizations: [first] }).mockResolvedValueOnce({
      people: [
        { displayName: "te•••@", role: "MANAGER", active: true, activitySource: "signIn", lastSignInAt: "2026-01-10T13:30:00Z" },
        { displayName: null, role: "CLEANER", active: false, lastSignInAt: "2026-01-11T14:30:00Z" },
        { displayName: "Crew C", role: "CLEANER", active: true, lastActivityAt: "2026-01-12T14:30:00Z", activitySource: "notifications" },
      ],
    });
    show("pt");
    const company = await screen.findByRole("button", { name: "North Demo" });
    company.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "North Demo" })).toHaveFocus();
    const members = await screen.findByRole("table", { name: "Gerentes e cleaners" });
    expect(within(members).getByRole("row", { name: /Nome indisponível Cleaner Inativo Sem registro/ })).toBeVisible();
    expect(within(members).getByRole("row", { name: /te•••@ Gerente Ativo/ }).querySelector("time"))
      .toHaveAttribute("datetime", "2026-01-10T13:30:00Z");
    const crew = within(members).getByRole("row", { name: /Crew C Cleaner Ativo/ });
    expect(within(crew).getByText("Notificações")).toBeVisible();
    expect(crew.querySelector("time")).toHaveAttribute("datetime", "2026-01-12T14:30:00Z");
    expect(getPlatformOverview).toHaveBeenLastCalledWith("example-north");
    const health = screen.getByRole("region", { name: "Saúde · últimos 7 dias" });
    expect(within(health).getByText("400 ms")).toBeVisible();
    expect(within(health).getByText("Ofertas")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("button", { name: "North Demo" })).toHaveFocus();
  });

  it.each([
    ["en", "Failed page loads"], ["pt", "Carregamentos com erro"], ["es", "Cargas de página con error"],
  ])("shows failed page loads separately from failed operations in %s", async (language, label) => {
    getPlatformOverview.mockResolvedValueOnce({ organizations: [first] }).mockResolvedValueOnce({ people: [] });
    show(language);
    fireEvent.click(await screen.findByRole("button", { name: "North Demo" }));
    const group = screen.getByText(label).parentElement;
    expect(within(group).getByRole("definition")).toHaveTextContent("1");
    await screen.findByRole("status");
  });

  it("explains the rates behind the badge on hover and in the detail", async () => {
    getPlatformOverview.mockResolvedValueOnce({ organizations: [first, second] }).mockResolvedValueOnce({ people: [] });
    show("pt");
    const row = (await screen.findByRole("button", { name: "North Demo" })).closest("tr");
    const badge = within(row).getByText("Normal").parentElement;
    expect(badge.title).toContain("1 de 220 (0,5%)");
    expect(badge.title).toContain("Ofertas · 2 de 90 (2,2%)");
    fireEvent.click(within(row).getByRole("button"));
    const health = screen.getByRole("region", { name: "Saúde · últimos 7 dias" });
    expect(within(health).getByText("1 de 220 (0,5%)")).toBeVisible();
    expect(within(health).getByText("2 de 90 (2,2%)")).toBeVisible();
    expect(within(health).getByText("210")).toBeVisible();
    await screen.findByText("Nenhuma gerente ou cleaner encontrada.");
  });

  it("labels an unnamed company's ID and a small health sample without implying an error", async () => {
    const company = { ...second, health: { ...first.health, status: "no-data" } };
    getPlatformOverview.mockResolvedValueOnce({ organizations: [company] }).mockResolvedValueOnce({ people: [] });
    show();
    const button = await screen.findByRole("button", { name: "ID example-south" });
    expect(within(button).getByText("ID example-south")).toHaveClass("platform-org-id");
    expect(screen.getByText("Small sample")).toBeVisible();
    fireEvent.click(button);
    expect(screen.getByRole("heading", { name: "ID example-south" })).toBeVisible();
    await screen.findByText("No managers or cleaners found.");
  });

  it("shows an unavailable failed-load count when the backend does not supply it", async () => {
    getPlatformOverview.mockResolvedValueOnce({ organizations: [{ ...first, health: { ...first.health, failedPageLoads: null } }] })
      .mockResolvedValueOnce({ people: [] });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "North Demo" }));
    const group = screen.getByText("Failed page loads").parentElement;
    expect(within(group).getByRole("definition")).toHaveTextContent("Unavailable");
    await screen.findByText("No managers or cleaners found.");
  });

  it("loads only the selected team, retries in place, and ignores a late result after switching companies", async () => {
    const old = deferred();
    getPlatformOverview.mockResolvedValueOnce({ organizations: [first, second] })
      .mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ people: [] });
    show();
    fireEvent.click((await screen.findByRole("rowheader", { name: /North Demo/ })).closest("tr"));
    expect(screen.getByText("Loading team…")).toBeVisible();
    await waitFor(() => expect(getPlatformOverview).toHaveBeenLastCalledWith("example-north"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "ID example-south" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this team.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No managers or cleaners found.")).toBeVisible();
    await act(async () => old.resolve({ people: [{ displayName: "Old team", role: "CLEANER", active: true, lastSignInAt: null }] }));
    expect(screen.queryByText("Old team")).not.toBeInTheDocument();
    expect(getPlatformOverview.mock.calls).toEqual([[undefined], ["example-north"], ["example-south"], ["example-south"]]);
  });

  it("clears an already loaded overview if access is denied on the detail read", async () => {
    getPlatformOverview.mockResolvedValueOnce({ organizations: [first] }).mockRejectedValueOnce({ code: "functions/permission-denied" });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "North Demo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Developer access is required");
    expect(screen.queryByText("North Demo")).not.toBeInTheDocument();
    expect(screen.queryByText("Version panel")).not.toBeInTheDocument();
  });
});

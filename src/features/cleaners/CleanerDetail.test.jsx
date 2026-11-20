import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { managerAvailabilityForCleaner } from "../availability/managerAvailabilityService.js";
import { CleanerDetail } from "./CleanerDetail.jsx";

vi.mock("../availability/managerAvailabilityService.js", () => ({ managerAvailabilityForCleaner: vi.fn() }));
vi.mock("../jobs/jobService.js", () => ({
  getCleanerJobHistory: vi.fn(async () => ({ upcomingJobs: [], recentJobs: [] })),
}));
vi.mock("./CleanerHubAccessPanel.jsx", () => ({ CleanerHubAccessPanel: () => null }));

function detail(id) {
  return <TranslationProvider><CleanerDetail cleaner={{ id, name: id, active: true }} /></TranslationProvider>;
}

describe("the manager's availability section on a cleaner profile", () => {
  beforeEach(() => {
    window.localStorage.setItem("cleanflow-language", "en");
    managerAvailabilityForCleaner.mockReset();
  });

  it("retries a failed list, saves a period and removes the confirmed block for this cleaner", async () => {
    const service = {
      list: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ blocks: [] }),
      set: vi.fn(async period => ({ block: { id: "period", ...period, createdBy: "MANAGER" } })),
      remove: vi.fn(async () => ({ removed: true })),
    };
    managerAvailabilityForCleaner.mockReturnValue(service);
    render(detail("sample-a"));
    const section = within(screen.getByRole("region", { name: "Unavailable days" }));
    expect(section.getByText("Loading periods…")).toBeVisible();
    expect(await section.findByRole("alert")).toHaveTextContent("Could not load the periods.");
    const user = userEvent.setup();
    await user.click(section.getByRole("button", { name: "Try again" }));
    expect(await section.findByText("No periods added.")).toBeVisible();
    await user.click(section.getByRole("button", { name: "Add a period" }));
    const date = section.getByLabelText("From").value;
    await user.click(section.getByRole("button", { name: "Save period" }));
    expect(service.set).toHaveBeenCalledWith({ startDate: date, endDate: date });
    expect(await section.findByText("All day")).toBeVisible();
    await user.click(section.getByRole("button", { name: /^Remove / }));
    expect(service.remove).toHaveBeenCalledWith({ blockId: "period" });
    expect(await section.findByText("No periods added.")).toBeVisible();
    expect(managerAvailabilityForCleaner).toHaveBeenCalledTimes(1);
    expect(managerAvailabilityForCleaner).toHaveBeenCalledWith("sample-a");
  });

  it("discards a pending read when the displayed profile changes", async () => {
    let finish;
    managerAvailabilityForCleaner.mockImplementation(id => ({
      list: () => id === "first" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ blocks: [] }),
    }));
    const view = render(detail("first"));
    view.rerender(detail("second"));
    const section = within(screen.getByRole("region", { name: "Unavailable days" }));
    expect(await section.findByText("No periods added.")).toBeVisible();
    await act(async () => finish({ blocks: [{ id: "stale", startDate: "2099-01-01", endDate: "2099-01-01" }] }));
    expect(section.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(section.getByText("No periods added.")).toBeVisible();
  });

  it.each([["pt", "Dias indisponíveis", "Nenhum período adicionado."], ["es", "Días no disponibles", "No hay períodos añadidos."]])(
    "uses the manager's %s language", async (language, title, empty) => {
      window.localStorage.setItem("cleanflow-language", language);
      managerAvailabilityForCleaner.mockReturnValue({ list: async () => ({ blocks: [] }) });
      render(detail("sample"));
      expect(await within(screen.getByRole("region", { name: title })).findByText(empty)).toBeVisible();
    },
  );
});

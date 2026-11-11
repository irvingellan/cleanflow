import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PublicClientPortalPage } from "./PublicClientPortalPage.jsx";
import { getPublicClientPortal, getPublicClientPortalReport, publicClientPortalPhotoUrl } from "./clientPortalService.js";

vi.mock("./clientPortalService.js", () => ({
  getPublicClientPortal: vi.fn(), getPublicClientPortalReport: vi.fn(),
  publicClientPortalPhotoUrl: vi.fn((token, jobId, evidenceId, options) => `/photo/${jobId}/${evidenceId}${options?.thumbnail ? "?thumb" : ""}`),
}));

const portal = {
  clientName: "Owner Example",
  properties: [{ id: "p1", name: "Seaside House" }],
  coming: [{ propertyId: "p1", propertyName: "Seaside House", date: "2026-11-12", start: "14:30" }],
  reports: [{ jobId: "job-1", propertyId: "p1", propertyName: "Seaside House", date: "2026-11-03" }],
};
const report = {
  titleKey: "clientReport.title", propertyName: "Seaside House", serviceDate: "2026-11-03", sections: [], inventoryItems: [],
  issueNotes: "", generalNotes: "", managerNote: "All good.", hasPhoto: true, evidence: [{ evidenceId: "photo-1" }],
  summary: { tasksDone: 3, tasksTotal: 3, tasksNotApplicable: 0, photoCount: 1, restockCount: 0 },
};
const renderPage = () => render(<TranslationProvider><PublicClientPortalPage token="synthetic-token" /></TranslationProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  getPublicClientPortal.mockResolvedValue(portal);
  getPublicClientPortalReport.mockResolvedValue(report);
});

describe("client portal page", () => {
  it("shows the coming cleanings, the released reports and the properties", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Owner Example" })).toBeVisible();
    expect(getPublicClientPortal).toHaveBeenCalledWith("synthetic-token");
    expect(screen.getByRole("heading", { name: "Coming cleanings" })).toBeVisible();
    expect(screen.getByText(/14:30/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Open the report for Seaside House/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Your properties" })).toBeVisible();
  });

  it("opens one report through the portal link and comes back", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Open the report for Seaside House/ }));
    expect(await screen.findByText("All good.")).toBeVisible();
    expect(getPublicClientPortalReport).toHaveBeenCalledWith("synthetic-token", "job-1");
    expect(publicClientPortalPhotoUrl).toHaveBeenCalledWith("synthetic-token", "job-1", "photo-1", { thumbnail: true });

    fireEvent.click(screen.getByRole("button", { name: /Back to all cleanings/ }));
    expect(await screen.findByRole("heading", { name: "Coming cleanings" })).toBeVisible();
  });

  it("says plainly when nothing is scheduled or shared", async () => {
    getPublicClientPortal.mockResolvedValue({ ...portal, coming: [], reports: [] });
    renderPage();
    expect(await screen.findByText("No cleanings scheduled for the coming weeks.")).toBeVisible();
    expect(screen.getByText("No reports shared yet.")).toBeVisible();
  });

  it("explains a turned-off link without offering a retry", async () => {
    getPublicClientPortal.mockRejectedValue({ retryable: false });
    renderPage();
    expect(await screen.findByText(/This link is no longer available/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("offers a retry when the connection fails", async () => {
    getPublicClientPortal.mockRejectedValueOnce({ retryable: true });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(getPublicClientPortal).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: "Owner Example" })).toBeVisible();
  });
});

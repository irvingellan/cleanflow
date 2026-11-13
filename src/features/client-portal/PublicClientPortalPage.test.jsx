import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const portalPage = (token = "synthetic-token") => (
  <TranslationProvider><PublicClientPortalPage token={token} /></TranslationProvider>
);
const renderPage = () => render(portalPage());
const restore = () => fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
const hide = () => fireEvent(window, new Event("pagehide"));
const setVisibility = (value) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  fireEvent(document, new Event("visibilitychange"));
};
function pendingRead() {
  let resolve;
  let reject;
  const promise = new Promise((fulfill, fail) => { resolve = fulfill; reject = fail; });
  return { promise, resolve, reject };
}
const openReport = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /Open the report for Seaside House/ }));
  return screen.findByText("All good.");
};
const backToList = () => fireEvent.click(screen.getByRole("button", { name: /Back to all cleanings/ }));

afterEach(() => { delete document.visibilityState; });

beforeEach(() => {
  vi.resetAllMocks();
  publicClientPortalPhotoUrl.mockImplementation((_, jobId, evidenceId, options) =>
    `/photo/${jobId}/${evidenceId}${options?.thumbnail ? "?thumb" : ""}`);
  getPublicClientPortal.mockResolvedValue(portal);
  getPublicClientPortalReport.mockResolvedValue(report);
});

describe("client portal page", () => {
  it("shows the coming cleanings, the released reports and the properties", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Owner Example" })).toBeVisible();
    expect(getPublicClientPortal).toHaveBeenCalledWith("synthetic-token", { signal: expect.any(AbortSignal) });
    expect(screen.getByRole("heading", { name: "Coming cleanings" })).toBeVisible();
    expect(screen.getByText(/14:30/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Open the report for Seaside House/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Your properties" })).toBeVisible();
  });

  it("opens one report through the portal link and comes back", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Open the report for Seaside House/ }));
    expect(await screen.findByText("All good.")).toBeVisible();
    expect(getPublicClientPortalReport).toHaveBeenCalledWith("synthetic-token", "job-1", { signal: expect.any(AbortSignal) });
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

  it("keeps a visible list during hidden and background validation without a loading screen", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Owner Example" })).toBeVisible();
    const response = pendingRead();
    getPublicClientPortal.mockReturnValueOnce(response.promise);
    setVisibility("hidden");
    expect(screen.getByRole("heading", { name: "Owner Example" })).toBeVisible();
    expect(getPublicClientPortal).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    restore();
    expect(getPublicClientPortal).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "Owner Example" })).toBeVisible();
    await act(async () => response.resolve({ ...portal, clientName: "Updated owner" }));
    expect(screen.getByRole("heading", { name: "Updated owner" })).toBeVisible();
  });

  it("does not suppress a later persisted pageshow after a visibility request settled", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Owner Example" });
    getPublicClientPortal.mockResolvedValueOnce({ ...portal, clientName: "Visible owner" });
    setVisibility("hidden");
    setVisibility("visible");
    expect(await screen.findByRole("heading", { name: "Visible owner" })).toBeVisible();

    getPublicClientPortal.mockResolvedValueOnce({ ...portal, clientName: "Restored owner" });
    restore();
    expect(await screen.findByRole("heading", { name: "Restored owner" })).toBeVisible();
    expect(getPublicClientPortal).toHaveBeenCalledTimes(3);
  });

  it("retains the open report and lightbox through pagehide and applies current report data on restore", async () => {
    renderPage();
    expect(await openReport()).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open photo 1" }));
    const reportResponse = pendingRead();
    getPublicClientPortalReport.mockReturnValueOnce(reportResponse.promise);

    hide();
    expect(screen.getByText("All good.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    restore();
    expect(screen.getByText("All good.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(getPublicClientPortal).toHaveBeenCalledTimes(2);
    expect(getPublicClientPortalReport).toHaveBeenCalledTimes(2);

    await act(async () => reportResponse.resolve({ ...report, managerNote: "Fresh report." }));
    expect(screen.getByText("Fresh report.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Owner Example" })).not.toBeInTheDocument();
  });

  it("keeps already-visible content when both revalidation requests fail transiently", async () => {
    renderPage();
    expect(await openReport()).toBeVisible();
    getPublicClientPortal.mockRejectedValueOnce(new TypeError("synthetic-network-error"));
    getPublicClientPortalReport.mockRejectedValueOnce({ retryable: true, status: 503 });
    await act(async () => restore());
    expect(screen.getByText("All good.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    backToList();
    expect(screen.getByRole("heading", { name: "Owner Example" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([{ status: 410 }, { retryable: false }])(
    "removes a permanently invalid portal and open report, even when the report request is still pending",
    async (error) => {
      renderPage();
      expect(await openReport()).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Open photo 1" }));
      const pending = pendingRead();
      getPublicClientPortal.mockRejectedValueOnce(error);
      getPublicClientPortalReport.mockReturnValueOnce(pending.promise);
      await act(async () => restore());
      expect(await screen.findByText(/This link is no longer available/)).toBeVisible();
      expect(screen.queryByText("All good.")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
      expect(getPublicClientPortalReport.mock.lastCall[2].signal.aborted).toBe(true);
      await act(async () => pending.resolve({ ...report, managerNote: "Stale report." }));
      await act(async () => restore());
      expect(screen.queryByText("Stale report.")).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeVisible();
      expect(getPublicClientPortal).toHaveBeenCalledTimes(2);
    },
  );

  it("shows the report-only 404 with Back while keeping the portal available", async () => {
    renderPage();
    expect(await openReport()).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open photo 1" }));
    getPublicClientPortal.mockResolvedValueOnce({ ...portal, reports: [] });
    getPublicClientPortalReport.mockRejectedValueOnce({ status: 404 });
    await act(async () => restore());
    expect(await screen.findByText("This cleaning report is no longer available.")).toBeVisible();
    expect(screen.queryByText("All good.")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    backToList();
    expect(screen.getByText("No reports shared yet.")).toBeVisible();
  });

  it("keeps an authorized report that falls outside the capped list response", async () => {
    renderPage();
    expect(await openReport()).toBeVisible();
    getPublicClientPortal.mockResolvedValueOnce({ ...portal, reports: [] });
    getPublicClientPortalReport.mockResolvedValueOnce({ ...report, managerNote: "Still authorized." });
    await act(async () => restore());
    expect(screen.getByText("Still authorized.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("removes a lightbox for a photo omitted by the current report", async () => {
    renderPage();
    expect(await openReport()).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open photo 1" }));
    getPublicClientPortalReport.mockResolvedValueOnce({ ...report, evidence: [{ evidenceId: "photo-2" }] });
    await act(async () => restore());
    expect(screen.getByText("All good.")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/photo/job-1/photo-2?thumb");
  });

  it("aborts both pre-suspension reads and ignores their late responses after newer results", async () => {
    renderPage();
    expect(await openReport()).toBeVisible();
    const oldList = pendingRead();
    const oldReport = pendingRead();
    getPublicClientPortal.mockReturnValueOnce(oldList.promise);
    getPublicClientPortalReport.mockReturnValueOnce(oldReport.promise);
    restore();
    hide();
    expect(getPublicClientPortal.mock.lastCall[1].signal.aborted).toBe(true);
    expect(getPublicClientPortalReport.mock.lastCall[2].signal.aborted).toBe(true);

    getPublicClientPortal.mockResolvedValueOnce({ ...portal, clientName: "New owner result" });
    getPublicClientPortalReport.mockResolvedValueOnce({ ...report, managerNote: "New report result." });
    await act(async () => restore());
    expect(screen.getByText("New report result.")).toBeVisible();
    await act(async () => {
      oldList.resolve({ ...portal, clientName: "Stale owner" });
      oldReport.reject({ status: 410 });
    });
    expect(screen.getByText("New report result.")).toBeVisible();
    backToList();
    expect(screen.getByRole("heading", { name: "New owner result" })).toBeVisible();
    expect(screen.queryByText("Stale owner")).not.toBeInTheDocument();
  });

  it("does not apply a stale report success after current authorization is lost", async () => {
    renderPage();
    expect(await openReport()).toBeVisible();
    const staleReport = pendingRead();
    getPublicClientPortalReport.mockReturnValueOnce(staleReport.promise);
    restore();
    hide();
    getPublicClientPortalReport.mockRejectedValueOnce({ status: 410 });
    await act(async () => restore());
    expect(screen.getByText("This cleaning report is no longer available.")).toBeVisible();
    await act(async () => staleReport.resolve({ ...report, managerNote: "Stale report result." }));
    expect(screen.queryByText("Stale report result.")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("does not let requests from a different token or Job replace the current view", async () => {
    const { rerender } = renderPage();
    expect(await openReport()).toBeVisible();
    const oldPortal = pendingRead();
    const oldReport = pendingRead();
    getPublicClientPortal.mockReturnValueOnce(oldPortal.promise);
    getPublicClientPortalReport.mockReturnValueOnce(oldReport.promise);
    restore();

    const nextPortal = { ...portal, clientName: "Another owner", reports: [
      { jobId: "job-2", propertyId: "p2", propertyName: "Forest House", date: "2026-11-03" },
      { jobId: "job-3", propertyId: "p3", propertyName: "Hill House", date: "2026-11-04" },
    ] };
    getPublicClientPortal.mockResolvedValue(nextPortal);
    rerender(portalPage("other-token"));
    expect(screen.queryByText("All good.")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Another owner" })).toBeVisible();
    expect(getPublicClientPortal.mock.calls[1][1].signal.aborted).toBe(true);
    expect(getPublicClientPortalReport.mock.calls[1][2].signal.aborted).toBe(true);
    await act(async () => { oldPortal.resolve(portal); oldReport.resolve(report); });
    expect(screen.getByRole("heading", { name: "Another owner" })).toBeVisible();

    const oldJob = pendingRead();
    getPublicClientPortalReport.mockReturnValueOnce(oldJob.promise);
    fireEvent.click(screen.getByRole("button", { name: /Open the report for Forest House/ }));
    // Revalidation fails only this report, so the back route can choose another Job.
    getPublicClientPortalReport.mockRejectedValueOnce({ status: 404 });
    await act(async () => restore());
    expect(await screen.findByRole("alert")).toBeVisible();
    backToList();
    await act(async () => oldJob.resolve({ ...report, managerNote: "Stale Job." }));
    getPublicClientPortalReport.mockResolvedValueOnce({ ...report, managerNote: "Hill notes." });
    fireEvent.click(await screen.findByRole("button", { name: /Open the report for Hill House/ }));
    expect(await screen.findByText("Hill notes.")).toBeVisible();
    expect(getPublicClientPortalReport).toHaveBeenLastCalledWith("other-token", "job-3", { signal: expect.any(AbortSignal) });
    expect(screen.queryByText("Stale Job.")).not.toBeInTheDocument();
  });
});

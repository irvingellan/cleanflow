import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "./i18n/translations.js";

const calls = vi.hoisted(() => ({ open: vi.fn(), getJob: vi.fn() }));
vi.mock("./features/auth/authService.js", () => ({
  signInWithEmail: vi.fn(), signOutManager: vi.fn(),
  subscribeToAuthState: (callback) => { callback({ uid: "synthetic-manager" }); return () => {}; },
}));
vi.mock("./features/auth/ManagerAccessBoundary.jsx", () => ({ ManagerAccessBoundary: ({ children }) => children }));
vi.mock("./features/notifications/useOneSignalIdentity.js", () => ({ useOneSignalIdentity: () => {} }));
vi.mock("./features/telemetry/useManagerPageLoadTelemetry.js", () => ({ useManagerPageLoadTelemetry: () => {} }));
vi.mock("./components/shell/AppShell.jsx", () => ({
  AppShell: ({ items, primaryAction, children }) => <>
    {items.map((item) => <button key={item.key} onClick={item.onSelect}>{item.key}</button>)}
    <button onClick={primaryAction.onSelect}>new service</button>{children}
  </>,
}));
vi.mock("./features/notifications/NotificationInbox.jsx", () => ({
  useNotificationInbox: () => ({ state: "ready", items: [], open: calls.open }),
  NotificationInboxBadge: () => null,
  NotificationInbox: () => <h2>Inbox screen</h2>,
}));
vi.mock("./features/dashboard/Dashboard.jsx", () => ({
  Dashboard: ({ onOpenNotice }) => <><h2>Home screen</h2>
    <button onClick={() => onOpenNotice({ id: "notice-one", type: "CHECKLIST_READY_FOR_REVIEW" })}>Review notice</button>
    <button onClick={() => onOpenNotice({ id: "notice-two", type: "CHECKLIST_READY_FOR_REVIEW" })}>Review second notice</button>
  </>,
}));
vi.mock("./features/dashboard/useDashboardController.js", () => ({ useDashboardController: () => ({}) }));
vi.mock("./features/jobs/JobsPage.jsx", () => ({ JobsPage: () => <h2>Services screen</h2> }));
vi.mock("./features/jobs/JobForm.jsx", () => ({ CreateCleaningForm: () => <h2>New service form</h2> }));
vi.mock("./features/jobs/JobDetail.jsx", () => ({ JobDetail: ({ job }) => <h2>{job.propertyName}</h2> }));
vi.mock("./features/jobs/jobService.js", async (original) => ({ ...(await original()), getJobById: calls.getJob }));
vi.mock("./features/jobs/useJobsWorklist.js", () => ({
  useJobsWorklist: () => ({ jobs: [], cleaners: [], setFilters: () => {}, resetPagination: () => {} }),
}));
vi.mock("./features/jobs/useJobDetailController.js", async () => {
  const { useState } = await import("react");
  return { useJobDetailController: () => {
    const [job, setJob] = useState(null);
    return { job, detail: {}, offerFlow: { availableCleaners: [], clearOffersCreatedCount: () => {} }, actions: {},
      openJob: setJob, closeJob: () => setJob(null) };
  } };
});
vi.mock("./features/cleaners/useCleanersController.js", () => ({ useCleanersController: () => ({ directory: { cleaners: [] }, profile: {} }) }));
vi.mock("./features/clients/useClientsController.js", () => ({ useClientsController: () => ({ directory: { clients: [] }, detail: {} }) }));
vi.mock("./features/payouts/usePayoutsController.js", () => ({ usePayoutsController: () => ({ directory: {}, review: {}, proof: {} }) }));
vi.mock("./features/properties/usePropertiesController.js", () => ({ usePropertiesController: () => ({ directory: { properties: [] }, selection: { clearProperty: () => {} } }) }));
vi.mock("./features/dev-center/useDevCenterController.js", () => ({ useDevCenterController: () => ({ access: { authorized: false } }) }));
import App from "./App.jsx";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const opened = { state: "opened", destination: { kind: "JOB", jobId: "authorized-job" } };
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  localStorage.setItem("cleanflow-language", "en");
  calls.open.mockResolvedValue(opened);
  calls.getJob.mockResolvedValue({ id: "authorized-job", propertyName: "Authorized job" });
});
function openNotice() {
  render(<TranslationProvider><App /></TranslationProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Review notice", exact: true }));
}

describe("Dashboard notice navigation", () => {
  it("keeps the authorized read and opens the current notice normally", async () => {
    openNotice();
    expect(await screen.findByRole("heading", { name: "Authorized job" })).toBeVisible();
    expect(calls.open).toHaveBeenCalledExactlyOnceWith("notice-one");
    expect(calls.getJob).toHaveBeenCalledExactlyOnceWith("authorized-job", { serverOnly: true });
  });

  it("keeps the user's new screen when inbox.open resolves after navigation", async () => {
    const receipt = deferred();
    calls.open.mockReturnValueOnce(receipt.promise);
    openNotice();
    fireEvent.click(screen.getByRole("button", { name: "jobs", exact: true }));
    await act(async () => receipt.resolve(opened));
    expect(screen.getByRole("heading", { name: "Services screen" })).toBeVisible();
    expect(calls.open).toHaveBeenCalledExactlyOnceWith("notice-one");
    expect(calls.getJob).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"])("does not replace a new form after a late Job read %s", async (outcome) => {
    const read = deferred();
    calls.getJob.mockReturnValueOnce(read.promise);
    openNotice();
    await act(async () => {});
    expect(calls.getJob).toHaveBeenCalledWith("authorized-job", { serverOnly: true });
    fireEvent.click(screen.getByRole("button", { name: "new service" }));
    await act(async () => outcome === "success"
      ? read.resolve({ id: "authorized-job", propertyName: "Late job" })
      : read.reject(new Error("late failure")));
    expect(screen.getByRole("heading", { name: "New service form" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Inbox screen" })).toBeNull();
  });

  it("does not revive an old request after leaving and reopening Home", async () => {
    const receipt = deferred();
    calls.open.mockReturnValueOnce(receipt.promise);
    openNotice();
    fireEvent.click(screen.getByRole("button", { name: "jobs", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "dashboard", exact: true }));
    await act(async () => receipt.resolve(opened));
    expect(screen.getByRole("heading", { name: "Home screen" })).toBeVisible();
    expect(calls.getJob).not.toHaveBeenCalled();
  });

  it("keeps the latest notice when two user-initiated receipts resolve backwards", async () => {
    const receipt = deferred();
    calls.open.mockReturnValueOnce(receipt.promise);
    openNotice();
    fireEvent.click(screen.getByRole("button", { name: "Review second notice" }));
    expect(await screen.findByRole("heading", { name: "Authorized job" })).toBeVisible();
    await act(async () => receipt.resolve({ state: "opened", destination: { kind: "JOB", jobId: "old-job" } }));
    expect(calls.open).toHaveBeenCalledTimes(2);
    expect(calls.getJob).toHaveBeenCalledTimes(1);
  });

  it("retains the Inbox fallback when the current notice is unavailable", async () => {
    calls.open.mockResolvedValueOnce({ state: "unavailable" });
    openNotice();
    expect(await screen.findByRole("heading", { name: "Inbox screen" })).toBeVisible();
    expect(calls.getJob).not.toHaveBeenCalled();
  });
});

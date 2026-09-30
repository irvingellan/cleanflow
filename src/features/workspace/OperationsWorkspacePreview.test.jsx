import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import Workspace from "./OperationsWorkspacePreview.jsx";

const api = vi.hoisted(() => ({
  getJobs: vi.fn(), getAllCleaners: vi.fn(), getCleaners: vi.fn(), getProperties: vi.fn(),
  getJobOffers: vi.fn(), getJobIssues: vi.fn(), getJobAssignments: vi.fn(),
  getChecklistRun: vi.fn(), getChecklistCapability: vi.fn(),
  assignCleanerDirectly: vi.fn(), issueChecklistCapability: vi.fn(), getJobById: vi.fn(),
}));
vi.mock("../jobs/jobService.js", async (original) => ({ ...(await original()), getJobs: api.getJobs, getJobById: api.getJobById }));
vi.mock("../cleaners/cleanerService.js", async (original) => ({ ...(await original()), getAllCleaners: api.getAllCleaners, getCleaners: api.getCleaners }));
vi.mock("../properties/propertyService.js", async (original) => ({ ...(await original()), getProperties: api.getProperties }));
vi.mock("../jobs/jobOfferService.js", async (original) => ({ ...(await original()), getJobOffers: api.getJobOffers }));
vi.mock("../issues/issueService.js", async (original) => ({ ...(await original()), getJobIssues: api.getJobIssues }));
vi.mock("../jobs/assignmentService.js", async (original) => ({ ...(await original()), getJobAssignments: api.getJobAssignments, assignCleanerDirectly: api.assignCleanerDirectly }));
vi.mock("../checklists/checklistRunService.js", async (original) => ({ ...(await original()), getChecklistRun: api.getChecklistRun }));
vi.mock("../checklists/checklistCapabilityService.js", async (original) => ({ ...(await original()), getChecklistCapability: api.getChecklistCapability, issueChecklistCapability: api.issueChecklistCapability }));
vi.mock("../telemetry/managerOperationTelemetryService.js", () => ({
  createManagerPageVisitId: () => "synthetic-visit", createManagerOperationTracker: () => ({ track: (_operation, task) => task() }),
}));

const jobs = ["A", "B", "C"].map((letter) => ({
  id: `job-${letter}`, propertyId: `property-${letter}`, propertyName: `Demo ${letter}`,
  schemaVersion: 2, operationalStatus: "UNASSIGNED", scheduledDate: "2026-10-01",
  assignedCleanerIds: [], dataProvenance: "DEMO",
}));
const cleaners = [{ id: "cleaner-demo", name: "Demo Cleaner", active: true }];
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/workspace-preview");
  localStorage.setItem("cleanflow-language", "en");
  window.scrollTo = vi.fn();
  api.getJobs.mockResolvedValue({ jobs, hasMore: false, nextPageCursors: {} });
  api.getAllCleaners.mockResolvedValue(cleaners);
  api.getProperties.mockResolvedValue(jobs.map((job) => ({ id: job.propertyId, name: job.propertyName })));
  api.getJobOffers.mockResolvedValue([]);
  api.getJobIssues.mockResolvedValue([]);
  api.getJobAssignments.mockResolvedValue([]);
  api.getChecklistRun.mockResolvedValue(null);
  api.getChecklistCapability.mockResolvedValue({ state: "NONE" });
});

function open() { return render(<TranslationProvider><Workspace authUser={{ uid: "synthetic-manager" }} /></TranslationProvider>); }
async function select(name) { fireEvent.click(await screen.findByRole("button", { name: `View Demo ${name}` })); }

describe("isolated operations workspace", () => {
  it("keeps the same worklist/search and highlighted selection while switching Jobs, without duplicate cleaner reads", async () => {
    open();
    await screen.findByRole("button", { name: "View Demo A" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "Demo" } });
    const list = document.querySelector(".workspace-job-list");
    list.scrollTop = 320;
    await select("A"); await select("B"); await select("C");
    expect(document.querySelector(".workspace-job-list")).toBe(list);
    expect(list.scrollTop).toBe(320);
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("Demo");
    expect(screen.getByRole("button", { name: "View Demo C" })).toHaveAttribute("aria-pressed", "true");
    expect(api.getJobs).toHaveBeenCalledTimes(1);
    expect(api.getAllCleaners).toHaveBeenCalledTimes(1);
    expect(api.getCleaners).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?job=job-C");
  });

  it("reuses the direct-assignment pending/error path and closes a panel without losing selection", async () => {
    let reject;
    api.assignCleanerDirectly.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    open(); await select("A");
    fireEvent.click(await within(document.querySelector(".workspace-next-actions")).findByRole("button", { name: "Assign cleaner", exact: true }));
    const panel = screen.getByRole("dialog");
    fireEvent.change(within(panel).getByRole("combobox", { name: "Assigned cleaner" }), { target: { value: "cleaner-demo" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm assignment" }));
    expect(within(panel).getByRole("button", { name: "Assigning…" })).toBeDisabled();
    expect(api.assignCleanerDirectly).toHaveBeenCalledWith("job-A", "cleaner-demo");
    reject(new Error("synthetic request failure"));
    await within(panel).findByRole("alert");
    fireEvent.click(within(panel).getByRole("button", { name: "Close panel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Demo A", exact: true })).toBeVisible();
    expect(window.location.search).toBe("?job=job-A");
  });

  it("retains a newly issued link across panel close/reopen without issuing a replacement", async () => {
    const assigned = { ...jobs[0], operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-demo"] };
    api.getJobs.mockResolvedValue({ jobs: [assigned], hasMore: false, nextPageCursors: {} });
    api.getJobAssignments.mockResolvedValue([{ id: "assignment", cleanerId: "cleaner-demo", isActive: true }]);
    api.getChecklistRun.mockResolvedValue({ id: "initial", status: "DRAFT" });
    const capability = { state: "ACTIVE", cleanerId: "cleaner-demo", issuedAt: "2026-09-30T12:00:00Z" };
    api.issueChecklistCapability.mockResolvedValue({ url: "/checklist?t=synthetic-only", capability });
    open(); await select("A");
    const next = within(document.querySelector(".workspace-next-actions"));
    fireEvent.click(await next.findByRole("button", { name: "Cleaner link", exact: true }));
    fireEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: "Create cleaner link" }));
    await within(screen.getByRole("dialog")).findByRole("button", { name: "Copy link" });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close panel" }));
    fireEvent.click(next.getByRole("button", { name: "Cleaner link", exact: true }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Copy link" })).toBeVisible();
    expect(api.issueChecklistCapability).toHaveBeenCalledTimes(1);
  });

  it("closes assignment only after confirmed success and retains the selected Job", async () => {
    api.assignCleanerDirectly.mockResolvedValue({ ...jobs[0], operationalStatus: "ASSIGNED",
      assignedCleanerIds: ["cleaner-demo"] });
    api.getJobAssignments.mockResolvedValue([{ id: "assignment", cleanerId: "cleaner-demo", isActive: true }]);
    open(); await select("A");
    fireEvent.click(await within(document.querySelector(".workspace-next-actions")).findByRole("button", { name: "Assign cleaner", exact: true }));
    const panel = screen.getByRole("dialog");
    fireEvent.change(within(panel).getByRole("combobox", { name: "Assigned cleaner" }), { target: { value: "cleaner-demo" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm assignment" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Demo A", exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: "View Demo A" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not expose completion or assignment on historical Jobs and renders EN/PT/ES workspace copy", async () => {
    api.getJobs.mockResolvedValue({ jobs: [{ ...jobs[0], operationalStatus: "COMPLETED" }], hasMore: false, nextPageCursors: {} });
    open(); await select("A");
    const next = within(document.querySelector(".workspace-next-actions"));
    expect(next.queryByRole("button", { name: "Assign cleaner" })).not.toBeInTheDocument();
    expect(next.queryByRole("button", { name: "Complete service" })).not.toBeInTheDocument();
    for (const [language, title] of [["pt", "Área de operações"], ["es", "Espacio de operaciones"], ["en", "Operations workspace"]]) {
      fireEvent.change(document.querySelector(".workspace-header select"), { target: { value: language } });
      await screen.findByRole("heading", { name: title });
    }
  });

  it("rejects malformed deep selection without reading arbitrary Job paths", async () => {
    window.history.replaceState(null, "", "/workspace-preview?job=bad%2Fpath");
    open();
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(api.getJobById).not.toHaveBeenCalled();
  });

  it("keeps an archived legacy deep-linked Job read-only in the experiment", async () => {
    const archived = { ...jobs[0], schemaVersion: 1, operationalStatus: "ASSIGNED",
      assignedCleanerId: "cleaner-demo", archivedAt: "2026-09-30T12:00:00Z" };
    api.getJobById.mockResolvedValue(archived);
    window.history.replaceState(null, "", "/workspace-preview?job=job-A");
    open();
    await screen.findByRole("heading", { name: "Demo A", exact: true });
    expect(screen.queryByRole("button", { name: "Start cleaning" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prepare message" })).not.toBeInTheDocument();
    expect(document.querySelector(".workspace-more")).toBeNull();
  });
});

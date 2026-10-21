import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import ManagerWorkspaceV3 from "./ManagerWorkspaceV3.jsx";
import { workspaceMessages } from "./workspaceMessages.js";
import { JobDetailV2Pilot } from "../jobs/JobDetailV2Pilot.jsx";
import { getServiceLifecycleFixture } from "../../../scripts/serviceLifecycleFixtures.mjs";
vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerContactsById: vi.fn().mockResolvedValue({}) }));
beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/?workspace=v3&jobDetail=v2"); });

const job = { id: "synthetic-job", propertyName: "Synthetic Garden", operationalStatus: "UNASSIGNED", scheduledDate: "2026-10-21", scheduledStart: "11:00", dataProvenance: "DEMO" };
function mount(overrides = {}) {
  const props = { view: "job-list", now: new Date("2026-10-21T19:00:00Z"), onExit: vi.fn(), onNow: vi.fn(), onOperation: vi.fn(), onBack: vi.fn(), selectedJob: null,
    dashboard: { dashboardData: { counts: {}, attentionJobs: [job], next48HoursJobs: [job] }, isLoading: false, hasError: false, onRefresh: vi.fn(), onOpenJob: vi.fn() },
    worklist: { jobs: [job], cleaners: [], properties: [], filters: { search: "", status: "all", datePreset: "any", cleanerId: "", propertyId: "", clientId: "", clientName: "" }, isLoading: false, hasError: false, onFiltersChange: vi.fn(), onClearFilters: vi.fn(), onCreate: vi.fn(), onSelect: vi.fn(), onLoadMore: vi.fn(), hasMore: true }, ...overrides };
  const result = render(<TranslationProvider><ManagerWorkspaceV3 {...props}><div>Existing detail controls</div></ManagerWorkspaceV3></TranslationProvider>);
  return { ...result, props };
}
it("retains manual pagination when a calendar filter has no loaded match", () => {
  const { props } = mount(); fireEvent.click(screen.getByRole("button", { name: "Tomorrow", exact: true }));
  expect(screen.getByText("No matching loaded services")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(props.worklist.onLoadMore).toHaveBeenCalledOnce();
  expect(props.worklist.onSelect).not.toHaveBeenCalled();
  expect(props.worklist.onFiltersChange).not.toHaveBeenCalled();
});
it("keeps an out-of-range selected detail and its real controls mounted", () => {
  mount({ view: "job-detail", selectedJob: job });
  fireEvent.click(screen.getByRole("button", { name: "Tomorrow", exact: true }));
  expect(screen.getByText(/outside the selected period/)).toBeVisible();
  expect(screen.getByText("Existing detail controls")).toBeVisible();
});
it("Now delegates the existing attention item to the correct Job, never an operational mutation", () => {
  const { props } = mount({ view: "dashboard" });
  fireEvent.click(within(document.querySelector(".workspace-v3-start")).getByRole("button", { name: /Synthetic Garden/ }));
  expect(props.dashboard.onOpenJob).toHaveBeenCalledWith(job);
  expect(props.worklist.onSelect).not.toHaveBeenCalled();
});
it("offers a recoverable Dashboard error using its existing refresh handler", () => {
  const { props } = mount({ view: "dashboard", dashboard: { dashboardData: null, hasError: true, isLoading: false, onRefresh: vi.fn() } });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(props.dashboard.onRefresh).toHaveBeenCalledOnce();
});
it("opening or changing presentation never calls assignment, completion or create", () => {
  const { props } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Week", exact: true }));
  expect(props.worklist.onCreate).not.toHaveBeenCalled(); expect(props.worklist.onSelect).not.toHaveBeenCalled();
});
it("EN/PT/ES contain every workspace key without untranslated placeholders", () => {
  for (const lang of ["en", "pt", "es"]) {
    expect(Object.keys(workspaceMessages[lang]).sort()).toEqual(Object.keys(workspaceMessages.en).sort());
    expect(Object.values(workspaceMessages[lang]).every(v => typeof v === "string" && v.length > 0)).toBe(true);
  }
});
it("a non-operation screen mounts its existing controls exactly once", () => {
  mount({ view: "create-cleaning" });
  expect(screen.getAllByText("Existing detail controls")).toHaveLength(1);
});
it("returning to a top-level view clears only the workspace detail history marker", () => {
  window.history.replaceState({ workspaceV3Detail: true, preserved: "value" }, "");
  mount({ view: "dashboard" });
  expect(window.history.state).toEqual({ preserved: "value" });
});
it("a completed save for Job A cannot close or overwrite Job B's pending real edit form", async () => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  let finish;
  const save = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const { props, unmount } = mount(); unmount();
  const first = getServiceLifecycleFixture("assigned");
  const second = { ...first, job: { ...first.job, id: "synthetic-second", guestName: "Second guest" } };
  const frame = fixture => <TranslationProvider><ManagerWorkspaceV3 {...props} view="job-detail" selectedJob={fixture.job}>
    <JobDetailV2Pilot {...fixture} onUpdateDetails={save} />
  </ManagerWorkspaceV3></TranslationProvider>;
  const { container, rerender } = render(frame(first));
  const edit = () => {
    fireEvent.click(container.querySelector(".job-detail-section > summary"));
    fireEvent.click(screen.getByRole("button", { name: "Edit guest / notes", exact: true }));
  };
  edit(); fireEvent.change(screen.getByLabelText("Guest name (optional)"), { target: { value: "First edited" } });
  fireEvent.click(screen.getByRole("button", { name: "Save details", exact: true }));
  expect(save).toHaveBeenCalledOnce();
  rerender(frame(second)); edit();
  fireEvent.change(screen.getByLabelText("Guest name (optional)"), { target: { value: "Second pending" } });
  await act(async () => finish());
  expect(screen.getByLabelText("Guest name (optional)")).toHaveValue("Second pending");
  expect(screen.getByRole("button", { name: "Save details", exact: true })).toBeVisible();
});

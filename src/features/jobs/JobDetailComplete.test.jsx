import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetailV2Pilot } from "./JobDetailV2Pilot.jsx";
import { getServiceLifecycleFixture } from "../../../scripts/serviceLifecycleFixtures.mjs";
import { formatDate } from "../../lib/presentation.js";
import { JobConfirmationV2 } from "./JobConfirmationV2.jsx";
vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerContactsById: vi.fn().mockResolvedValue({}) }));
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/?jobDetail=v2");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: query => ({ matches: query.includes("max-width"), addEventListener() {}, removeEventListener() {} }) });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
function setup(id = "assigned", extra = {}) {
  const fixture = getServiceLifecycleFixture(id);
  return render(<TranslationProvider><JobDetailV2Pilot {...fixture}
    isLoadingChecklistRun={false} hasChecklistRunError={false}
    isLoadingAssignments={false} hasAssignmentsError={false} {...extra} /></TranslationProvider>);
}
it("mobile V2 has one shared primary and seven described mounted disclosures", () => {
  const { container } = setup("assigned-draft");
  expect(container.querySelector(".job-detail-v2")).toBeInTheDocument();
  expect(container.querySelectorAll(".job-intents")).toHaveLength(1);
  expect(container.querySelectorAll(".job-intents__next button")).toHaveLength(1);
  expect(container.querySelector(".cfv2-sticky")).toContainElement(screen.getByRole("button", { name: "Next step: Open existing checklist" }));
  expect(container.querySelectorAll(".job-detail-section")).toHaveLength(7);
  expect(container.querySelectorAll(".job-v2-disclosure-summary")).toHaveLength(7);
});
it("mobile CURRENT remains selectable and has no V2 sticky or confirmation surfaces", () => {
  const { container } = setup();
  fireEvent.click(screen.getByRole("button", { name: "CURRENT", exact: true }));
  expect(container.querySelector(".panel.job-detail")).toBeInTheDocument();
  expect(container.querySelector(".cfv2-sticky")).toBeNull();
});
it("existing completion confirmation names Job and only final confirm invokes handler", async () => {
  const complete = vi.fn().mockResolvedValue(undefined);
  setup("assigned", { onCompleteCleaning: complete });
  fireEvent.click(screen.getByText("More actions"));
  fireEvent.click(screen.getByRole("button", { name: "Choose intention: Complete service" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Lifecycle Demo Assigned");
  expect(dialog).toHaveTextContent(formatDate("2026-10-05", null, "en"));
  expect(dialog).toHaveTextContent("10:00");
  expect(dialog).toHaveTextContent("payment");
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Choose intention: Complete service" }));
  fireEvent.click(screen.getByRole("button", { name: "Complete service", exact: true }));
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
});
it.each(["en", "pt", "es"])("confirmation schedule context uses the existing %s formatter", lang => {
  localStorage.setItem("cleanflow-language", lang);
  render(<TranslationProvider><JobConfirmationV2 job={getServiceLifecycleFixture("assigned").job}
    kind="complete" title="Synthetic confirmation" message="Synthetic" confirmLabel="Confirm"
    cancelLabel="Cancel" onCancel={() => {}} onConfirm={() => {}} /></TranslationProvider>);
  expect(screen.getByRole("dialog")).toHaveTextContent(formatDate("2026-10-05", null, lang));
  expect(screen.getByRole("dialog")).not.toHaveTextContent("jobV2.confirm");
});
it("completion rejection keeps the real error in the open confirmation", async () => {
  setup("assigned", { onCompleteCleaning: vi.fn().mockRejectedValue(new Error("synthetic")) });
  fireEvent.click(screen.getByText("More actions"));
  fireEvent.click(screen.getByRole("button", { name: "Choose intention: Complete service" }));
  fireEvent.click(await screen.findByRole("button", { name: "Complete service", exact: true }));
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Unable to complete cleaning."));
});
it("archive retains existing confirmation and cancel is non-mutating", async () => {
  const archive = vi.fn(); const { container } = setup("assigned", { onArchive: archive });
  fireEvent.click(container.querySelectorAll(".job-detail-section > summary")[6]);
  fireEvent.click(screen.getByRole("button", { name: "Delete", exact: true }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Lifecycle Demo Assigned");
  expect(archive).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(archive).not.toHaveBeenCalled();
});
it("switching Job cancels an old open completion instead of carrying it forward", async () => {
  const first = getServiceLifecycleFixture("assigned"); const second = getServiceLifecycleFixture("ready");
  const { rerender } = setup("assigned");
  fireEvent.click(screen.getByText("More actions"));
  fireEvent.click(screen.getByRole("button", { name: "Choose intention: Complete service" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  rerender(<TranslationProvider><JobDetailV2Pilot {...second} /></TranslationProvider>);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(first.job.id).not.toBe(second.job.id);
});
async function openReminderReplacement() {
  fireEvent.click(screen.getByText("More actions"));
  fireEvent.click(screen.getByRole("button", { name: "Choose intention: Prepare reminder" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Include checklist link" }));
  fireEvent.click(screen.getByRole("button", { name: "Prepare checklist link", exact: true }));
  return screen.findByRole("dialog");
}
it("replacement confirmation rechecks current eligibility after the same Job starts", async () => {
  const prepare = vi.fn();
  const fixture = getServiceLifecycleFixture("assigned-draft");
  const { rerender } = setup("assigned-draft", { onPrepareChecklistReminder: prepare });
  await openReminderReplacement();
  rerender(<TranslationProvider><JobDetailV2Pilot {...fixture}
    job={{ ...fixture.job, operationalStatus: "IN_PROGRESS" }}
    onPrepareChecklistReminder={prepare} /></TranslationProvider>);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Prepare checklist link" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(prepare).not.toHaveBeenCalled();
});
it("switching Job cancels archive confirmation instead of applying it to the next Job", async () => {
  const archive = vi.fn(); const { container, rerender } = setup("assigned", { onArchive: archive });
  fireEvent.click(container.querySelectorAll(".job-detail-section > summary")[6]);
  fireEvent.click(screen.getByRole("button", { name: "Delete", exact: true }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  rerender(<TranslationProvider><JobDetailV2Pilot {...getServiceLifecycleFixture("unassigned")} onArchive={archive} /></TranslationProvider>);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(archive).not.toHaveBeenCalled();
});
it("cancel and unmount settle pending replacement without calling the mutation", async () => {
  const prepare = vi.fn(); const { unmount } = setup("assigned-draft", { onPrepareChecklistReminder: prepare });
  await openReminderReplacement();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Prepare checklist link", exact: true }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  unmount();
  await Promise.resolve();
  expect(prepare).not.toHaveBeenCalled();
});
it("eligible replacement confirms once and retains the existing issuance validation", async () => {
  const prepare = vi.fn().mockResolvedValue({});
  setup("assigned-draft", { onPrepareChecklistReminder: prepare });
  await openReminderReplacement();
  expect(prepare).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Prepare checklist link" }));
  await waitFor(() => expect(prepare).toHaveBeenCalledExactlyOnceWith("lifecycle-v0-cleaner-alpha"));
  await waitFor(() => expect(screen.getByRole("region", { name: /Review reminder/ })).toHaveTextContent("Checklist link could not be prepared."));
});
it("completion remains busy until its real handler settles, then exposes retry on error", async () => {
  let reject;
  const complete = vi.fn().mockImplementationOnce(() => new Promise((_, rejectRequest) => { reject = rejectRequest; }))
    .mockResolvedValue(undefined);
  setup("assigned", { onCompleteCleaning: complete });
  fireEvent.click(screen.getByText("More actions"));
  fireEvent.click(screen.getByRole("button", { name: "Choose intention: Complete service" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Complete service" }));
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(complete).toHaveBeenCalledOnce();
  reject(new Error("synthetic"));
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Unable to complete cleaning."));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Complete service" }));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetail } from "./JobDetail.jsx";
import { SandboxLifecyclePreview } from "./SandboxLifecyclePreview.jsx";
import { buildServiceLifecycleFixtures } from "../../../scripts/serviceLifecycleFixtures.mjs";

vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerContactsById: vi.fn().mockResolvedValue({}) }));

function renderScenario(id, overrides = {}) {
  const fixture = buildServiceLifecycleFixtures().find((scenario) => scenario.id === id);
  const mutation = vi.fn();
  const open = vi.fn();
  const result = render(<TranslationProvider><JobDetail {...fixture} availableCleaners={fixture.knownCleaners}
    onBack={vi.fn()} onOpenChecklistRun={open} onSaveDataProvenance={mutation}
    onUpdatePrices={mutation} onAssignCleanerDirectly={mutation} onCreateChecklistRun={mutation}
    onIssueChecklistCapability={mutation} onCompleteCleaning={mutation} {...overrides} /></TranslationProvider>);
  return { ...result, mutation, open };
}

describe("Job Detail lifecycle integration", () => {
  it("orders compact context, rail, cleaner, saved progress, next action and closed details", () => {
    const { container, mutation } = renderScenario("in-progress");
    const selectors = [".job-detail__context", ".service-lifecycle", ".service-cleaner-summary", ".service-checklist-summary", ".job-intents", ".job-detail-section"];
    const nodes = selectors.map((selector) => container.querySelector(selector));
    for (let index = 1; index < nodes.length; index += 1) {
      expect(nodes[index - 1].compareDocumentPosition(nodes[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(container.querySelector(".service-cleaner-summary")).getByText("Demo Cleaner Alpha")).toBeVisible();
    expect(container.querySelectorAll(".job-detail-section[open]")).toHaveLength(0);
    expect(container.querySelector(".service-financial-summary")).not.toBeVisible();
    expect(mutation).not.toHaveBeenCalled();
  });
  it.each([
    ["unassigned", "Assign cleaner"], ["assigned", "Prepare reminder"],
    ["assigned-draft", "Open existing checklist"], ["ready", "Review checklist"],
    ["completed", "View saved service"],
  ])("preserves primaryIntent for %s", (id, action) => {
    const { mutation } = renderScenario(id);
    expect(screen.getByRole("button", { name: `Next step: ${action}` })).toBeVisible();
    expect(mutation).not.toHaveBeenCalled();
  });
  it("review attention navigates only through the existing open handler", () => {
    const { open, mutation } = renderScenario("ready");
    const attention = screen.getByRole("complementary", { name: "Needs attention" });
    fireEvent.click(within(attention).getByRole("button", { name: "Review checklist →" }));
    expect(open).toHaveBeenCalledOnce();
    expect(mutation).not.toHaveBeenCalled();
  });
  it("stale-link attention focuses existing link controls, never opens a different view or replaces a link", () => {
    const { container, open, mutation } = renderScenario("stale");
    const frame = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 0; });
    try {
      fireEvent.click(screen.getByRole("button", { name: "View link controls →" }));
      expect(container.querySelector(".job-checklist")).toHaveFocus();
      expect(open).not.toHaveBeenCalled();
      expect(mutation).not.toHaveBeenCalled();
    } finally { frame.mockRestore(); }
  });
  it("unavailable Run evidence never becomes a synthetic progress fallback", () => {
    const { container } = renderScenario("assigned-draft", { hasChecklistRunError: true, hasChecklistCapabilityError: true });
    const summary = within(container.querySelector(".service-checklist-summary"));
    expect(summary.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(summary.getByText("Checklist status unavailable")).toBeVisible();
    expect(summary.getByText("Link status unavailable")).toBeVisible();
  });
  it("direct assignment with loaded empty Offers does not fabricate an offered stage", () => {
    const { container, mutation } = renderScenario("assigned", { isLoadingOffers: false, hasOffersError: false });
    const offered = container.querySelectorAll(".service-lifecycle__stage")[1];
    expect(offered).toHaveClass("service-lifecycle__stage--skipped");
    expect(offered).not.toHaveTextContent("✓");
    expect(mutation).not.toHaveBeenCalled();
  });
  it.each([
    { isLoadingOffers: true, hasOffersError: false },
    { isLoadingOffers: false, hasOffersError: true },
  ])("propagates unavailable Offer evidence to the rail: %j", (flags) => {
    const { container } = renderScenario("assigned", flags);
    const offered = container.querySelectorAll(".service-lifecycle__stage")[1];
    expect(offered).toHaveClass("service-lifecycle__stage--unknown-past");
    expect(offered).not.toHaveTextContent("✓");
  });
  it("does not treat a late Offer from another Job as history of the selected Job", () => {
    const { container } = renderScenario("assigned", {
      offers: [{ id: "synthetic-other-offer", jobId: "synthetic-other-job", cleanerId: "synthetic-cleaner" }],
      isLoadingOffers: false, hasOffersError: false,
    });
    expect(container.querySelectorAll(".service-lifecycle__stage")[1])
      .toHaveClass("service-lifecycle__stage--unknown-past");
  });
  it("completed service displays saved checklist without inventing an approval receipt or changing Run state", () => {
    const fixture = buildServiceLifecycleFixtures().find((scenario) => scenario.id === "completed");
    const { container, mutation } = renderScenario("completed", { checklistRun: fixture.checklistRun });
    const summary = within(container.querySelector(".service-checklist-summary"));
    expect(summary.getByText("Saved checklist")).toBeVisible();
    expect(summary.queryByText("Ready for manager review")).not.toBeInTheDocument();
    expect(fixture.checklistRun.status).toBe("READY_FOR_REVIEW");
    expect(mutation).not.toHaveBeenCalled();
  });
  it("the labelled Sandbox preview navigates without invoking a data mutation", () => {
    render(<TranslationProvider><SandboxLifecyclePreview onBack={vi.fn()} /></TranslationProvider>);
    expect(screen.getByText(/synthetic/i, { selector: ".service-preview-notice p" })).toBeVisible();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ready" } });
    fireEvent.click(screen.getByRole("button", { name: "Next step: Review checklist" }));
    expect(screen.getByRole("status")).toHaveTextContent(/no data is saved/i);
  });
});

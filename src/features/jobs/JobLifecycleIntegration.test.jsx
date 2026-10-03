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
  it("orders rail, essentials, cleaner, saved progress, existing intents and finances", () => {
    const { container, mutation } = renderScenario("in-progress");
    const selectors = [".service-lifecycle", ".detail-list", ".service-cleaner-summary", ".service-checklist-summary", ".job-intents", ".service-financial-summary"];
    const nodes = selectors.map((selector) => container.querySelector(selector));
    for (let index = 1; index < nodes.length; index += 1) {
      expect(nodes[index - 1].compareDocumentPosition(nodes[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(container.querySelector(".service-cleaner-summary")).getByText("Demo Cleaner Alpha")).toBeVisible();
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
  it("the labelled Sandbox preview navigates without invoking a data mutation", () => {
    render(<TranslationProvider><SandboxLifecyclePreview onBack={vi.fn()} /></TranslationProvider>);
    expect(screen.getByText(/synthetic/i, { selector: ".service-preview-notice p" })).toBeVisible();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ready" } });
    fireEvent.click(screen.getByRole("button", { name: "Next step: Review checklist" }));
    expect(screen.getByRole("status")).toHaveTextContent(/no data is saved/i);
  });
});

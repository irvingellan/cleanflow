import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetail } from "./JobDetail.jsx";
import { JobDetailV2Pilot } from "./JobDetailV2Pilot.jsx";
import { buildServiceLifecycleFixtures } from "../../../scripts/serviceLifecycleFixtures.mjs";

vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerContactsById: vi.fn().mockResolvedValue({}) }));

function setup(id = "unassigned") {
  const fixture = buildServiceLifecycleFixtures().find(item => item.id === id);
  const mutate = vi.fn();
  const view = render(<TranslationProvider><JobDetail {...fixture}
    availableCleaners={fixture.knownCleaners} onAssignCleanerDirectly={mutate}
    onUpdateSchedule={mutate} onCompleteCleaning={mutate}
    renderPresentation={({ identity, summary, intents, details, scrollToTop }) => <section>
      <header>{identity}</header><main>{summary}{details}</main><aside aria-label="Decision rail">{intents}</aside>{scrollToTop}
    </section>} /></TranslationProvider>);
  return { ...view, mutate };
}

describe("Job Detail presentation slots preserve authoritative controls", () => {
  it("moves the one existing intent into the rail without losing seven mounted groups", () => {
    const { container, mutate } = setup();
    expect(screen.getByRole("complementary", { name: "Decision rail" })).toContainElement(screen.getByRole("button", { name: "Next step: Assign cleaner" }));
    expect(container.querySelectorAll(".job-detail-section")).toHaveLength(7);
    expect(container.querySelectorAll(".job-intents")).toHaveLength(1);
    expect(mutate).not.toHaveBeenCalled();
  });
  it("assignment intent reveals the original picker and only confirmation mutates", async () => {
    const { mutate } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Next step: Assign cleaner" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Demo Cleaner Alpha" })).toBeVisible());
    fireEvent.click(screen.getByRole("radio", { name: "Demo Cleaner Alpha" }));
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  });
});

describe("F1 opt-in and current presentation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?jobDetail=v2");
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
  });
  it.each([
    ["unassigned", "Assign cleaner"], ["offered", "Assign cleaner"],
    ["assigned", "Prepare reminder"], ["assigned-draft", "Open existing checklist"],
    ["in-progress", "Open existing checklist"], ["ready", "Review checklist"],
    ["completed", "View saved service"], ["open-issue", "Open existing checklist"],
  ])("%s keeps the existing primary action, not an independently inferred action", (id, action) => {
    const fixture = buildServiceLifecycleFixtures().find(item => item.id === id);
    const { container } = render(<TranslationProvider><JobDetailV2Pilot {...fixture} /></TranslationProvider>);
    expect(screen.getByRole("complementary", { name: "Service decisions" })).toContainElement(screen.getByRole("button", { name: `Next step: ${action}` }));
    expect(container.querySelectorAll(".job-detail-section")).toHaveLength(7);
  });
  it("keeps CURRENT as the default when the opt-in is absent", () => {
    window.history.replaceState(null, "", "/");
    const fixture = buildServiceLifecycleFixtures()[0];
    const { container } = render(<TranslationProvider><JobDetailV2Pilot {...fixture} /></TranslationProvider>);
    expect(container.querySelector(".panel.job-detail")).toBeInTheDocument();
    expect(container.querySelector(".job-detail-v2")).toBeNull();
  });
  it("does not offer mutable operational intents on archived services", () => {
    const fixture = buildServiceLifecycleFixtures()[0];
    const { container } = render(<TranslationProvider><JobDetailV2Pilot {...fixture} job={{ ...fixture.job, archivedAt: "2026-10-03T18:00:00Z" }} /></TranslationProvider>);
    expect(screen.getByRole("button", { name: "Next step: View saved service" })).toBeInTheDocument();
    expect(container.querySelector(".job-intents__secondary")).toBeNull();
  });
  it("does not claim opening a protected DRAFT checklist unlocks schedule", async () => {
    const fixture = buildServiceLifecycleFixtures().find(item => item.id === "assigned-draft");
    const mutation = vi.fn();
    render(<TranslationProvider><JobDetailV2Pilot {...fixture} onUpdateSchedule={mutation} /></TranslationProvider>);
    fireEvent.click(screen.getByText("More actions"));
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    expect(screen.getByRole("status")).toHaveTextContent("Do not delete and recreate");
    expect(screen.getByRole("button", { name: "Open existing checklist →" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Scheduled date")).toBeNull();
    expect(mutation).not.toHaveBeenCalled();
  });
});

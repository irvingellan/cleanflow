import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetail } from "./JobDetail.jsx";
import { buildServiceLifecycleFixtures } from "../../../scripts/serviceLifecycleFixtures.mjs";

vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerContactsById: vi.fn().mockResolvedValue({}) }));

function setup(id = "unassigned", overrides = {}) {
  const fixture = buildServiceLifecycleFixtures().find((scenario) => scenario.id === id);
  const mutation = vi.fn();
  const open = vi.fn();
  const props = { ...fixture, availableCleaners: fixture.knownCleaners,
    onOpenChecklistRun: open, onCreateChecklistRun: mutation, onIssueChecklistCapability: mutation,
    onAssignCleanerDirectly: mutation, onUpdateSchedule: mutation, onUpdatePrices: mutation,
    onCompleteCleaning: mutation, onArchive: mutation, onSaveDataProvenance: mutation, ...overrides };
  const view = render(<TranslationProvider><JobDetail {...props} /></TranslationProvider>);
  const section = (name) => screen.getByText(name, { selector: ".job-detail-section > summary" }).parentElement;
  const intent = (name) => {
    fireEvent.click(screen.getByText("More actions"));
    fireEvent.click(screen.getByRole("button", { name: `Choose intention: ${name}` }));
  };
  return { ...view, props, section, intent, mutation, open };
}

describe("Job Detail progressive disclosure", () => {
  it("starts with seven closed groups and secondary intents closed, while primary facts remain visible", () => {
    const { container, mutation } = setup("in-progress");
    expect(container.querySelectorAll(".job-detail-section")).toHaveLength(7);
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
    for (const selector of [".job-detail__context", ".service-lifecycle", ".service-cleaner-summary", ".service-checklist-summary", ".job-intents__next"]) {
      expect(container.querySelector(selector)).toBeVisible();
    }
    for (const selector of [".service-financial-summary", ".job-detail__history-summary", ".job-intents__actions"]) {
      expect(container.querySelector(selector)).not.toBeVisible();
    }
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each(["stale", "ready", "open-issue"])("%s attention is outside every closed disclosure", (id) => {
    const { container, mutation } = setup(id);
    const attention = container.querySelector(".service-attention");
    expect(attention).toBeVisible();
    expect(attention.closest("details")).toBeNull();
    expect(mutation).not.toHaveBeenCalled();
  });

  it("schedule reveals Service details before focusing the existing form; only Save mutates", async () => {
    const { section, intent, mutation } = setup("assigned");
    intent("Change date / time");
    await waitFor(() => expect(section("Service details")).toHaveAttribute("open"));
    expect(screen.getByRole("region", { name: "Change date / time" })).toHaveFocus();
    expect(screen.getByLabelText("Scheduled date")).toBeVisible();
    expect(mutation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(mutation).toHaveBeenCalledOnce());
  });

  it("primary assignment opens the same picker; selecting an option never assigns", async () => {
    const { section, mutation } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Next step: Assign cleaner" }));
    await waitFor(() => expect(section("Cleaner & assignment")).toHaveAttribute("open"));
    expect(screen.getByRole("region", { name: "Assigned cleaners" })).toHaveFocus();
    fireEvent.click(screen.getByRole("radio", { name: "Demo Cleaner Alpha" }));
    expect(mutation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    await waitFor(() => expect(mutation).toHaveBeenCalledOnce());
  });

  it("reminder opens Cleaner & assignment and focuses the existing preview without sending", async () => {
    const { section, mutation } = setup("assigned");
    fireEvent.click(screen.getByRole("button", { name: "Next step: Prepare reminder" }));
    await waitFor(() => expect(section("Cleaner & assignment")).toHaveAttribute("open"));
    expect(screen.getByRole("region", { name: "Review reminder for Demo Cleaner Alpha" })).toHaveFocus();
    expect(mutation).not.toHaveBeenCalled();
  });

  it("checklist without a Run reveals existing create controls without creating one", async () => {
    const { section, intent, mutation } = setup();
    intent("Checklist");
    await waitFor(() => expect(section("Checklist")).toHaveAttribute("open"));
    expect(screen.getByRole("button", { name: "Create checklist" })).toBeVisible();
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each([["assigned-draft", "Open existing checklist"], ["ready", "Review checklist"]])("%s reveals Checklist before calling the existing read handler", (id, label) => {
    const { section, mutation, open } = setup(id);
    open.mockImplementation(() => expect(section("Checklist")).toHaveAttribute("open"));
    fireEvent.click(screen.getByRole("button", { name: `Next step: ${label}` }));
    expect(open).toHaveBeenCalledOnce();
    expect(mutation).not.toHaveBeenCalled();
  });

  it("completion reveals only the existing confirmation, never completes on intent selection", async () => {
    const { section, intent, mutation } = setup("assigned");
    intent("Complete service");
    await waitFor(() => expect(section("Checklist")).toHaveAttribute("open"));
    expect(screen.getByRole("region", { name: "Complete service" })).toHaveFocus();
    expect(screen.getByText("This service has no checklist. Mark it completed?")).toBeVisible();
    expect(mutation).not.toHaveBeenCalled();
  });

  it("DRAFT schedule protection remains visible and never promises an unlock", () => {
    const { intent, mutation, open } = setup("assigned-draft");
    intent("Change date / time");
    const notice = screen.getByRole("status");
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent(/do not delete and recreate/i);
    fireEvent.click(within(notice).getByRole("button", { name: "Open existing checklist →" }));
    expect(open).toHaveBeenCalledOnce();
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each([false, true])("completed/archived history stays compact and opens its safe path: archived=%s", (archived) => {
    const { container, section, mutation } = setup("completed", archived ? { job: {
      ...buildServiceLifecycleFixtures().find(s => s.id === "completed").job, archivedAt: "2026-10-03T18:00:00Z",
    } } : {});
    expect(container.querySelector(".job-intents__secondary")).toBeNull();
    expect(container.querySelector(".job-detail__completion")).toBeVisible();
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Next step: View saved service" }));
    expect(section("History & administration")).toHaveAttribute("open");
    expect(mutation).not.toHaveBeenCalled();
  });

  it("all existing controls remain reachable and opening groups does not mutate", () => {
    const { container, mutation } = setup();
    container.querySelectorAll(".job-detail-section > summary").forEach(summary => fireEvent.click(summary));
    expect(screen.getByRole("button", { name: "Edit guest / notes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit prices" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Offer cleaning to cleaners" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
    expect(mutation).not.toHaveBeenCalled();
  });

  it("Job switches close disclosures and suppress the old queued focus; unmount is safe", () => {
    const frames = [];
    const frame = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => { frames.push(callback); return frames.length; });
    try {
      const { container, props, rerender, unmount, intent } = setup();
      intent("Checklist");
      rerender(<TranslationProvider><JobDetail {...props} job={{ ...props.job, id: "synthetic-new-job" }} /></TranslationProvider>);
      act(() => frames.splice(0).forEach(callback => callback(0)));
      expect(container.querySelectorAll("details[open]")).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Next step: Assign cleaner" }));
      unmount();
      expect(() => act(() => frames.splice(0).forEach(callback => callback(0)))).not.toThrow();
    } finally { frame.mockRestore(); }
  });

  it("new Offers reveal their section before auto-focus", () => {
    const { container, section } = setup("offered", { offersCreatedCount: 1 });
    expect(section("Offers")).toHaveAttribute("open");
    expect(container.querySelector(".offers-section")).toHaveFocus();
  });

  it("collapsing and reopening does not discard the existing pending form", async () => {
    const { section, intent, mutation } = setup("assigned");
    intent("Change date / time");
    await waitFor(() => expect(section("Service details")).toHaveAttribute("open"));
    fireEvent.change(screen.getByLabelText("Scheduled date"), { target: { value: "2026-10-12" } });
    const summary = section("Service details").querySelector("summary");
    fireEvent.click(summary);
    expect(screen.getByLabelText("Scheduled date")).not.toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByLabelText("Scheduled date")).toHaveValue("2026-10-12");
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each([["en", "More actions", "Service details"], ["pt", "Mais ações", "Detalhes do serviço"], ["es", "Más acciones", "Detalles del servicio"]])("disclosures are localized in %s", (language, more, details) => {
    localStorage.setItem("cleanflow-language", language);
    try {
      const { container } = setup();
      expect(screen.getByText(more)).toBeVisible();
      expect(screen.getByText(details, { selector: "summary" })).toBeVisible();
      expect(container.textContent).not.toMatch(/jobs\.section\.|jobs\.moreActions/);
    } finally { localStorage.removeItem("cleanflow-language"); }
  });
});

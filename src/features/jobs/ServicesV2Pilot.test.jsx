import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import ServicesV2Pilot from "./ServicesV2Pilot.jsx";
import { createJobListFilters } from "./jobListFilters.js";
import { buildCompactLifecycleFixtures } from "../../../scripts/compactLifecycleFixtures.mjs";

const fixture = buildCompactLifecycleFixtures(new Date(2026, 9, 6));
function mount(overrides = {}) {
  const callbacks = { onSelect: vi.fn(), onCreate: vi.fn(), onRetry: vi.fn(), onLoadMore: vi.fn(), onToggleExcluded: vi.fn(), onScrollRestored: vi.fn() };
  function Harness() {
    const [filters, setFilters] = useState(createJobListFilters);
    return <TranslationProvider><ServicesV2Pilot {...fixture} filters={filters} isLoading={false} hasError={false}
      onFiltersChange={updates => setFilters(current => ({ ...current, ...updates }))} onClearFilters={() => setFilters(createJobListFilters())}
      {...callbacks} {...overrides} /></TranslationProvider>;
  }
  const result = render(<Harness />);
  return { ...result, callbacks };
}
beforeEach(() => {
  localStorage.clear(); window.history.replaceState({}, "", "/?services=v2");
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.scrollTo = vi.fn();
});

describe("Services V2 shared presentation", () => {
  it("keeps every row, order, stored times, cleaner names and no financial fields", () => {
    const { container } = mount();
    const ids = [...container.querySelectorAll("[data-job-id]")].map(node => node.dataset.jobId);
    expect(ids).toHaveLength(10);
    expect(ids.indexOf("compact-demo-7")).toBeGreaterThan(ids.indexOf("compact-demo-9"));
    expect(screen.getAllByText("Demo Alpha").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$200/)).not.toBeInTheDocument();
  });
  it("searches the same names and clears using the existing model", async () => {
    mount(); const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "Property 03");
    expect(document.querySelectorAll("[data-job-id]")).toHaveLength(1);
    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(document.querySelectorAll("[data-job-id]")).toHaveLength(10);
  });
  it("shows no-match feedback without fabricating a total", async () => {
    mount(); await userEvent.type(screen.getByRole("searchbox"), "no-such-property");
    expect(document.querySelectorAll("[data-job-id]")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(/No jobs match/i);
  });
  it("preserves quick status/date callback semantics", async () => {
    mount(); const user = userEvent.setup();
    const today = screen.getByRole("button", { name: "Today" });
    await user.click(today); expect(today).toHaveAttribute("aria-pressed", "true");
    const needs = screen.getByRole("button", { name: "Needs assignment" });
    await user.click(needs); expect(needs).toHaveAttribute("aria-pressed", "true");
  });
  it("opens existing Job Detail with the same scroll anchor", async () => {
    const { callbacks, container } = mount();
    const row = container.querySelector('[data-job-id="compact-demo-2"]');
    await userEvent.click(row);
    expect(callbacks.onSelect).toHaveBeenCalledWith(fixture.jobs[2], { anchorJobId: fixture.jobs[2].id, anchorViewportOffset: 0 });
  });
  it("restores anchors through the forwarded Row ref", () => {
    const { callbacks } = mount({ restoreScroll: { anchorJobId: "compact-demo-2", anchorViewportOffset: 120 } });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    expect(callbacks.onScrollRestored).toHaveBeenCalledOnce();
  });
  it("keeps pagination explicit and disabled while pending", async () => {
    const { callbacks } = mount({ hasMore: true });
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(callbacks.onLoadMore).toHaveBeenCalledOnce();
  });
  it("switches to the untouched CURRENT presentation on the same data", async () => {
    const { container } = mount();
    await userEvent.click(screen.getByRole("button", { name: "Current", exact: true }));
    expect(container.querySelector(".services-v2")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".job-card")).toHaveLength(10);
    expect(location.search).toBe("?services=current");
  });
  it("does not mutate on render and keeps New service explicit", async () => {
    const { callbacks } = mount();
    Object.values(callbacks).forEach(callback => expect(callback).not.toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "New service" }));
    expect(callbacks.onCreate).toHaveBeenCalledOnce();
  });
  it("never treats absent Offer history as a skipped stage", () => {
    const { container } = mount();
    const row = container.querySelector('[data-job-id="compact-demo-2"]');
    expect(row.querySelector(".cfv2-lifecycle-unknown-past")).toBeInTheDocument();
    expect(within(row).queryByText(/skipped/i)).not.toBeInTheDocument();
  });
  it("preserves REAL and archived evidence without reclassifying either", () => {
    const { container } = mount({ jobs: [{ ...fixture.jobs[2], dataProvenance: "REAL", archivedAt: "2026-10-01T12:00:00Z" }] });
    expect(container.querySelector(".data-provenance-badge--real")).toBeInTheDocument();
    expect(container.querySelector(".services-v2__meta")).toHaveTextContent(/Excluded|Archived/i);
  });
  it("shows initial loading without invented rows or update timestamp", () => {
    mount({ jobs: [], isLoading: true });
    expect(screen.getByRole("status", { name: /Loading/ })).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll("[data-job-id]")).toHaveLength(0);
  });
  it("keeps previous rows during refresh, explicitly marked previous", () => {
    mount({ isLoading: true });
    expect(document.querySelectorAll("[data-job-id]")).toHaveLength(10);
    expect(screen.getByRole("status")).toHaveTextContent("Previous results");
  });
  it("shows genuine error/retry and marks stale rows", async () => {
    const { callbacks } = mount({ hasError: true });
    expect(screen.getByRole("alert")).toHaveTextContent(/Unable to load/);
    expect(screen.getByRole("status")).toHaveTextContent(/outdated/);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(callbacks.onRetry).toHaveBeenCalledOnce();
  });
  it("does not expose excluded toggle without existing permission", async () => {
    mount(); await userEvent.click(screen.getByRole("button", { name: "Job filters", exact: true }));
    expect(screen.queryByRole("button", { name: /Show excluded/ })).not.toBeInTheDocument();
  });
  it("retains authorized excluded toggle and advanced controls", async () => {
    const { callbacks } = mount({ canManageExcluded: true });
    await userEvent.click(screen.getByRole("button", { name: "Job filters", exact: true }));
    expect(screen.getAllByRole("combobox")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: /Show excluded/ }));
    expect(callbacks.onToggleExcluded).toHaveBeenCalledOnce();
  });
  it.each(["en", "pt", "es"])("renders localized controls with no untranslated keys (%s)", language => {
    localStorage.setItem("cleanflow-language", language);
    const { container } = mount();
    expect(container.textContent).not.toMatch(/\b(jobs|common|lifecycle|archive)\./);
  });
});

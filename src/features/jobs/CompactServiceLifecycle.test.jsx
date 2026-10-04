import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider, useTranslation } from "../../i18n/translations.js";
import { CompactServiceLifecycle } from "./CompactServiceLifecycle.jsx";
import { JobsPage, createJobListFilters } from "./JobsPage.jsx";
import { Dashboard } from "../dashboard/Dashboard.jsx";
import { buildCompactLifecycleFixtures } from "../../../scripts/compactLifecycleFixtures.mjs";

afterEach(() => localStorage.removeItem("cleanflow-language"));
const job = Object.freeze({ id: "synthetic", operationalStatus: "ASSIGNED", assignedCleanerIds: ["demo"] });
function show(props) { return render(<TranslationProvider><CompactServiceLifecycle {...props} /></TranslationProvider>); }
const states = container => [...container.querySelectorAll("[role=listitem]")].map(n => n.className.split("--")[1]);

describe("compact truthful lifecycle without provider reads", () => {
  it.each([
    ["UNASSIGNED", ["current", "future", "future", "future", "future"]],
    ["OFFERED", ["completed", "current", "future", "future", "future"]],
    ["ASSIGNED", ["completed", "unknown-past", "current", "future", "future"]],
    ["IN_PROGRESS", ["completed", "unknown-past", "completed", "current", "future"]],
    ["COMPLETED", ["completed", "unknown-past", "completed", "skipped", "current"]],
  ])("%s uses only already-loaded Job evidence", (operationalStatus, expected) => {
    const { container } = show({ job: { ...job, operationalStatus,
      assignedCleanerIds: ["UNASSIGNED", "OFFERED"].includes(operationalStatus) ? [] : job.assignedCleanerIds } });
    expect(states(container)).toEqual(expected);
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(container.querySelectorAll("button,a,progress")).toHaveLength(0);
  });
  it("Offer evidence proves history, while loaded-empty explicitly skips it", () => {
    const { container, rerender } = show({ job, offers: [{ id: "offer-demo", jobId: job.id }] });
    expect(states(container)[1]).toBe("completed");
    rerender(<TranslationProvider><CompactServiceLifecycle job={job} offers={[]} /></TranslationProvider>);
    expect(states(container)[1]).toBe("skipped");
  });
  it("Job offeredAt proves past OFFERED without fetching Offers", () => {
    const { container } = show({ job: { ...job, offeredAt: "2026-10-01T10:00:00Z" } });
    expect(states(container)[1]).toBe("completed");
  });
  it("wrong-Job Offer and malformed timestamp cannot prove history", () => {
    const { container } = show({ job: { ...job, offeredAt: "bad" }, offers: [{ id: "demo", jobId: "other" }] });
    expect(states(container)[1]).toBe("unknown-past");
  });
  it("archived does not promote lifecycle; unknown status has no current/checks", () => {
    const { container, rerender } = show({ job: { ...job, archivedAt: "2026-10-01T10:00:00Z" } });
    expect(states(container)).toEqual(["completed", "unknown-past", "current", "future", "future"]);
    rerender(<TranslationProvider><CompactServiceLifecycle job={{ operationalStatus: "bad" }} /></TranslationProvider>);
    expect(states(container)).toEqual(Array(5).fill("future"));
    expect(container.querySelector("[aria-current]")).toBeNull();
  });
  it.each([["en", "Assigned"], ["pt", "Atribuído"], ["es", "Asignado"]])("%s has localized current stage and accessible history", (language, text) => {
    localStorage.setItem("cleanflow-language", language);
    const { container } = show({ job });
    expect(container.querySelector(".compact-lifecycle__status")).toHaveTextContent(text);
    for (const node of screen.getAllByRole("listitem")) {
      expect(node.getAttribute("aria-label")).toBeTruthy();
      expect(node.getAttribute("aria-label")).not.toMatch(/lifecycle\./);
    }
  });
  it("Jobs keeps filters, archive and selection without financial rows; render does not invoke actions", () => {
    const fixture = buildCompactLifecycleFixtures();
    const select = vi.fn(), mutate = vi.fn();
    const { container } = render(<TranslationProvider><JobsPage {...fixture}
      jobs={[...fixture.jobs, { ...job, archivedAt: "2026-10-01T10:00:00Z", propertyName: "Archived Demo" }]}
      filters={createJobListFilters()} onSelect={select} onCreate={mutate} /></TranslationProvider>);
    expect(select).not.toHaveBeenCalled(); expect(mutate).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".compact-lifecycle")).toHaveLength(11);
    expect(screen.getByText("Archived Demo")).toBeVisible();
    expect(container.querySelector(".record-archive-badge")).toBeVisible();
    expect(container.querySelector(".job-card__prices")).toBeNull();
    expect(container.querySelector(".status-badge")).toBeNull();
    fireEvent.click(container.querySelector(".job-card"));
    expect(select).toHaveBeenCalledOnce(); expect(mutate).not.toHaveBeenCalled();
  });
  it("Dashboard filtered empty Offers remain unknown; loaded nonempty evidence is reused", () => {
    const fixture = buildCompactLifecycleFixtures();
    const first = fixture.jobs[2], second = fixture.jobs[4];
    const select = vi.fn();
    function Harness() {
      const { translate } = useTranslation();
      return <Dashboard translate={translate} onOpenJob={select} dashboardData={{ ...fixture.dashboardData,
        next48HoursJobs: [first, { ...second, offeredAt: undefined }],
        offersByJob: { [first.id]: [], [second.id]: [{ id: "demo-offer", jobId: second.id }] },
      }} />;
    }
    const { container } = render(<TranslationProvider><Harness /></TranslationProvider>);
    const cards = [...container.querySelectorAll(".dashboard-next-item")];
    expect(states(cards[0])[1]).toBe("unknown-past");
    expect(states(cards[1])[1]).toBe("completed");
    expect(container.querySelector(".attention-list .compact-lifecycle")).toBeNull();
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(cards[0]); expect(select).toHaveBeenCalledWith(first);
    expect(within(cards[0]).getAllByRole("listitem")).toHaveLength(5);
  });
});

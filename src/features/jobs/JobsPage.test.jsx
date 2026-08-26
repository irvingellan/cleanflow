import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import {
  createJobListFilters,
  dashboardJobListFilters,
  JobsPage,
  sortJobWorklist,
} from "./JobsPage.jsx";

const jobs = [
  {
    id: "job-active-later",
    propertyId: "property-b",
    propertyName: "Sunset House",
    clientName: "Sara",
    scheduledDate: "2026-08-28",
    scheduledStart: "12:00",
    operationalStatus: "ASSIGNED",
  },
  {
    id: "job-active-sooner",
    propertyId: "property-a",
    propertyName: "Pacific Beach Condo",
    clientName: "Carl",
    scheduledDate: "2026-08-27",
    scheduledStart: "09:00",
    operationalStatus: "UNASSIGNED",
  },
  {
    id: "job-completed-recent",
    propertyId: "property-a",
    propertyName: "Pacific Beach Condo",
    clientName: "Carl",
    scheduledDate: "2026-08-20",
    operationalStatus: "COMPLETED",
    completedAt: { toMillis: () => 200 },
  },
  {
    id: "job-completed-earlier",
    propertyId: "property-b",
    propertyName: "Sunset House",
    clientName: "Sara",
    scheduledDate: "2026-08-21",
    operationalStatus: "COMPLETED",
    completedAt: { toMillis: () => 100 },
  },
];

function JobsPageHarness({ initialFilters = createJobListFilters() }) {
  const [filters, setFilters] = useState(initialFilters);

  return (
    <TranslationProvider>
      <JobsPage
        jobs={jobs}
        isLoading={false}
        hasError={false}
        onSelect={vi.fn()}
        filters={filters}
        cleaners={[{ id: "cleaner-1", name: "Carla Perez" }]}
        properties={[
          { id: "property-a", name: "Pacific Beach Condo" },
          { id: "property-b", name: "Sunset House" },
        ]}
        onFiltersChange={(updates) =>
          setFilters((currentFilters) => ({ ...currentFilters, ...updates }))
        }
        onClearFilters={() => setFilters(createJobListFilters())}
        hasMore={false}
        isLoadingMore={false}
        onLoadMore={vi.fn()}
      />
    </TranslationProvider>
  );
}

describe("dashboardJobListFilters", () => {
  it("maps Dashboard metric presets to the existing Jobs filters", () => {
    expect(dashboardJobListFilters("today")).toMatchObject({ datePreset: "today" });
    expect(dashboardJobListFilters("needs-assignment")).toMatchObject({
      status: "needs-assignment",
    });
    expect(dashboardJobListFilters("in-progress")).toMatchObject({
      status: "in-progress",
    });
    expect(dashboardJobListFilters("completed-today")).toMatchObject({
      status: "completed",
      datePreset: "today",
    });
  });
});

describe("sortJobWorklist", () => {
  it("keeps active work in scheduled order and completed work by latest completion", () => {
    expect([...jobs].sort(sortJobWorklist).map((job) => job.id)).toEqual([
      "job-active-sooner",
      "job-active-later",
      "job-completed-recent",
      "job-completed-earlier",
    ]);
  });
});

describe("JobsPage filters", () => {
  it("toggles quick filters using the existing filter state", async () => {
    const user = userEvent.setup();
    render(<JobsPageHarness />);

    const today = screen.getByRole("button", { name: /today/i });
    const needsAssignment = screen.getByRole("button", {
      name: /needs assignment/i,
    });
    const inProgress = screen.getByRole("button", { name: /in progress/i });
    const completed = screen.getByRole("button", { name: /^✅ completed$/i });

    await user.click(today);
    await user.click(needsAssignment);
    await user.click(inProgress);
    await user.click(completed);

    expect(today).toHaveAttribute("aria-pressed", "true");
    expect(needsAssignment).toHaveAttribute("aria-pressed", "false");
    expect(inProgress).toHaveAttribute("aria-pressed", "false");
    expect(completed).toHaveAttribute("aria-pressed", "true");

    await user.click(completed);
    expect(completed).toHaveAttribute("aria-pressed", "false");
  });

  it("applies advanced filters and search, then clears them", async () => {
    const user = userEvent.setup();
    render(<JobsPageHarness />);

    await user.type(screen.getByRole("searchbox", { name: /search/i }), "pacific");
    await user.click(screen.getByRole("button", { name: /^filters$/i }));
    await user.selectOptions(screen.getByLabelText("Cleaner"), "cleaner-1");
    await user.selectOptions(screen.getByLabelText("Property"), "property-a");
    await user.selectOptions(screen.getByLabelText("Date"), "past-7-days");

    expect(screen.getByRole("button", { name: /filters \(3\)/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /clear filters/i }));

    expect(screen.getByRole("searchbox", { name: /search/i })).toHaveValue("");
    expect(screen.getByLabelText("Cleaner")).toHaveValue("");
    expect(screen.getByLabelText("Property")).toHaveValue("");
    expect(screen.getByLabelText("Date")).toHaveValue("any");
  });
});

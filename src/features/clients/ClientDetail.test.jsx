import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ClientDetail } from "./ClientDetail.jsx";

const upcomingJobs = [
  { id: "job-1", propertyName: "First Property", scheduledDate: "2026-09-01", scheduledStart: "09:00", operationalStatus: "UNASSIGNED", clientPrice: 200 },
  { id: "job-2", propertyName: "Second Property", scheduledDate: "2026-09-01", scheduledStart: "11:00", operationalStatus: "ASSIGNED", clientPrice: 220 },
  { id: "job-3", propertyName: "Third Property", scheduledDate: "2026-09-02", scheduledStart: "09:00", operationalStatus: "OFFERED", clientPrice: 240 },
  { id: "job-4", propertyName: "Hidden Fourth Property", scheduledDate: "2026-09-03", scheduledStart: "09:00", operationalStatus: "UNASSIGNED", clientPrice: 260 },
];

function renderDetail(history, onViewAllUpcoming = vi.fn()) {
  return render(
    <TranslationProvider>
      <ClientDetail
        client={{ id: "client-1", name: "Client One", active: true }}
        properties={[]}
        isLoadingProperties={false}
        hasPropertiesError={false}
        jobHistory={history}
        hasJobHistoryError={false}
        onBack={vi.fn()}
        onOpenProperty={vi.fn()}
        onCreateProperty={vi.fn()}
        onOpenJob={vi.fn()}
        onViewAllUpcoming={onViewAllUpcoming}
      />
    </TranslationProvider>,
  );
}

describe("ClientDetail upcoming services", () => {
  it("shows the next three chronological Jobs and provides View all only when more exist", () => {
    const onViewAllUpcoming = vi.fn();
    renderDetail({ upcomingJobs, hasMoreUpcoming: true, recentJobs: [] }, onViewAllUpcoming);

    const visibleProperties = screen
      .getAllByText(/First Property|Second Property|Third Property/)
      .map((element) => element.textContent);
    expect(visibleProperties).toEqual(["First Property", "Second Property", "Third Property"]);
    expect(screen.queryByText("Hidden Fourth Property")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View all upcoming services" }));
    expect(onViewAllUpcoming).toHaveBeenCalledTimes(1);
  });

  it("does not show View all when the three-item summary is complete", () => {
    renderDetail({ upcomingJobs: upcomingJobs.slice(0, 3), hasMoreUpcoming: false, recentJobs: [] });

    expect(screen.queryByRole("button", { name: "View all upcoming services" })).not.toBeInTheDocument();
  });
});

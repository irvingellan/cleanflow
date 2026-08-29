import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { getPropertyJobHistory } from "../jobs/jobService.js";
import { PropertyDetail } from "./PropertyDetail.jsx";

vi.mock("../jobs/jobService.js", () => ({
  getPropertyJobHistory: vi.fn(),
}));

const upcomingJobs = [
  { id: "job-1", scheduledDate: "2026-09-01", scheduledStart: "09:00", operationalStatus: "UNASSIGNED" },
  { id: "job-2", scheduledDate: "2026-09-01", scheduledStart: "11:00", operationalStatus: "ASSIGNED" },
  { id: "job-3", scheduledDate: "2026-09-02", scheduledStart: "09:00", operationalStatus: "OFFERED" },
  { id: "job-4", scheduledDate: "2026-09-03", scheduledStart: "09:00", operationalStatus: "UNASSIGNED" },
];

describe("PropertyDetail upcoming services", () => {
  it("shows at most three future Jobs and routes View all through its callback", async () => {
    const onViewAllUpcoming = vi.fn();
    getPropertyJobHistory.mockResolvedValue({
      upcomingJobs,
      hasMoreUpcoming: true,
      recentJobs: [],
    });

    render(
      <TranslationProvider>
        <PropertyDetail
          property={{ id: "property-1", name: "Pacific Beach Condo", clientName: "Carl", active: true }}
          onBack={vi.fn()}
          onCreateCleaning={vi.fn()}
          onOpenJob={vi.fn()}
          onLinkClient={vi.fn()}
          onViewAllUpcoming={onViewAllUpcoming}
        />
      </TranslationProvider>,
    );

    await waitFor(() => expect(screen.getAllByRole("button", { name: "View job" })).toHaveLength(3));
    expect(screen.getByRole("button", { name: "View all upcoming services" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "View all upcoming services" }));
    expect(onViewAllUpcoming).toHaveBeenCalledTimes(1);
  });
});

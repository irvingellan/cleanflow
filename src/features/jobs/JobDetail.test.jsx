import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetail } from "./JobDetail.jsx";

function renderJobDetail(status, overrides = {}) {
  const noOp = vi.fn();

  return render(
    <TranslationProvider>
      <JobDetail
        job={{
          id: "job-1",
          propertyName: "Pacific Beach Condo",
          operationalStatus: status,
          ...overrides,
        }}
        knownCleaners={[]}
        offers={[]}
        isLoadingOffers={false}
        hasOffersError={false}
        issues={[]}
        isLoadingIssues={false}
        hasIssuesError={false}
        onBack={noOp}
        onOfferToCleaners={noOp}
        onRefreshOffers={noOp}
        onRefreshIssues={noOp}
        onSimulateOffer={noOp}
        onCreatePublicOfferLink={noOp}
        onAssignCleaner={noOp}
        onStartCleaning={noOp}
        onCompleteCleaning={noOp}
        onSimulateAssignedCleaner={noOp}
        onResolveIssue={noOp}
      />
    </TranslationProvider>,
  );
}

describe("JobDetail lifecycle actions", () => {
  it("only offers Start cleaning for an assigned Job", () => {
    renderJobDetail("ASSIGNED");

    expect(screen.getByRole("button", { name: /start cleaning/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /complete cleaning/i })).not.toBeInTheDocument();
  });

  it("only offers Complete cleaning for an in-progress Job", () => {
    renderJobDetail("IN_PROGRESS");

    expect(screen.getByRole("button", { name: /complete cleaning/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /start cleaning/i })).not.toBeInTheDocument();
  });

  it("shows no lifecycle mutation actions for a completed Job and handles optional data", () => {
    renderJobDetail("COMPLETED");

    expect(screen.queryByRole("button", { name: /start cleaning/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /complete cleaning/i })).not.toBeInTheDocument();
    expect(screen.getByText("No offers sent yet.")).toBeVisible();
    expect(screen.getByText("No issues reported.")).toBeVisible();
    expect(screen.queryByText("common.notProvided")).not.toBeInTheDocument();
  });

  it("shows the manager-only guest name only when the Job has one", () => {
    const { rerender } = renderJobDetail("UNASSIGNED", {
      guestName: "Taylor Morgan",
      scheduledStart: "10:00",
    });

    expect(screen.getByText("Guest name (optional)")).toBeVisible();
    expect(screen.getByText("Taylor Morgan")).toBeVisible();
    expect(screen.getByText("Scheduled time")).toBeVisible();
    expect(screen.getByText("10:00")).toBeVisible();

    rerender(
      <TranslationProvider>
        <JobDetail
          job={{
            id: "job-1",
            propertyName: "Pacific Beach Condo",
            operationalStatus: "UNASSIGNED",
          }}
          knownCleaners={[]}
          offers={[]}
          isLoadingOffers={false}
          hasOffersError={false}
          issues={[]}
          isLoadingIssues={false}
          hasIssuesError={false}
          onBack={vi.fn()}
          onOfferToCleaners={vi.fn()}
          onRefreshOffers={vi.fn()}
          onRefreshIssues={vi.fn()}
          onSimulateOffer={vi.fn()}
          onCreatePublicOfferLink={vi.fn()}
          onAssignCleaner={vi.fn()}
          onStartCleaning={vi.fn()}
          onCompleteCleaning={vi.fn()}
          onSimulateAssignedCleaner={vi.fn()}
          onResolveIssue={vi.fn()}
        />
      </TranslationProvider>,
    );

    expect(screen.queryByText("Guest name (optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("Taylor Morgan")).not.toBeInTheDocument();
    expect(screen.queryByText("Scheduled time")).not.toBeInTheDocument();
  });
});

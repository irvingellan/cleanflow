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
});

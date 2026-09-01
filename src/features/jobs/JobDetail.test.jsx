import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetail } from "./JobDetail.jsx";

function renderJobDetail(status, overrides = {}, callbacks = {}) {
  const noOp = vi.fn();
  const { offers = [], ...jobOverrides } = overrides;

  return render(
    <TranslationProvider>
      <JobDetail
        job={{
          id: "job-1",
          propertyName: "Pacific Beach Condo",
          operationalStatus: status,
          ...jobOverrides,
        }}
        knownCleaners={[]}
        offers={offers}
        isLoadingOffers={false}
        hasOffersError={false}
        assignments={[]}
        isLoadingAssignments={false}
        hasAssignmentsError={false}
        issues={[]}
        isLoadingIssues={false}
        hasIssuesError={false}
        onBack={noOp}
        onOfferToCleaners={callbacks.onOfferToCleaners || noOp}
        onRefreshOffers={callbacks.onRefreshOffers || noOp}
        onRefreshIssues={noOp}
        onSimulateOffer={noOp}
        onCreatePublicOfferLink={noOp}
        onAssignCleaner={noOp}
        onRemoveAssignment={noOp}
        onReplaceAssignment={noOp}
        onStartCleaning={noOp}
        onCompleteCleaning={noOp}
        onSimulateAssignedCleaner={noOp}
        onResolveIssue={noOp}
      />
    </TranslationProvider>,
  );
}

describe("JobDetail lifecycle actions", () => {
  it("shows a primary offer CTA for an unassigned v2 Job with no offers", () => {
    const onOfferToCleaners = vi.fn();
    renderJobDetail(
      "UNASSIGNED",
      { schemaVersion: 2, assignedCleanerIds: [] },
      { onOfferToCleaners },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Offer cleaning to cleaners" }),
    );

    expect(onOfferToCleaners).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Refresh offers" })).toBeVisible();
  });

  it("retains the offer CTA for a legacy unassigned Job", () => {
    renderJobDetail("UNASSIGNED");

    expect(
      screen.getByRole("button", { name: "Offer cleaning to cleaners" }),
    ).toBeVisible();
  });

  it("shows a secondary add-more action for an assignment-aware Job with offers", () => {
    const onOfferToCleaners = vi.fn();
    const onRefreshOffers = vi.fn();
    renderJobDetail(
      "ASSIGNED",
      {
        schemaVersion: 2,
        assignedCleanerIds: ["cleaner-2"],
        offers: [{ id: "offer-1", cleanerId: "cleaner-1", cleanerName: "Ana", status: "PENDING" }],
      },
      { onOfferToCleaners, onRefreshOffers },
    );

    fireEvent.click(screen.getByRole("button", { name: "Send to more cleaners" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh offers" }));

    expect(onOfferToCleaners).toHaveBeenCalledTimes(1);
    expect(onRefreshOffers).toHaveBeenCalledTimes(1);
  });

  it("hides offer creation actions once a v2 Job is in progress", () => {
    renderJobDetail("IN_PROGRESS", { schemaVersion: 2, assignedCleanerIds: ["cleaner-1"] });

    expect(
      screen.queryByRole("button", { name: "Offer cleaning to cleaners" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Send to more cleaners" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh offers" })).toBeVisible();
  });

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
          assignments={[]}
          isLoadingAssignments={false}
          hasAssignmentsError={false}
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
          onRemoveAssignment={vi.fn()}
          onReplaceAssignment={vi.fn()}
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

  it("shows a v2 team roster and keeps multiple interested offers assignable", () => {
    const onAssignCleaner = vi.fn();
    render(
      <TranslationProvider>
        <JobDetail
          job={{
            id: "team-job",
            propertyName: "Team Property",
            operationalStatus: "ASSIGNED",
            schemaVersion: 2,
            assignedCleanerIds: ["cleaner-a"],
          }}
          knownCleaners={[
            { id: "cleaner-a", name: "Ana" },
            { id: "cleaner-b", name: "Beatriz" },
          ]}
          offers={[
            { id: "offer-a", cleanerId: "cleaner-a", cleanerName: "Ana", status: "INTERESTED" },
            { id: "offer-b", cleanerId: "cleaner-b", cleanerName: "Beatriz", status: "INTERESTED" },
          ]}
          assignments={[{ id: "assignment-a", cleanerId: "cleaner-a", cleanerNameSnapshot: "Ana", isActive: true, executionStatus: "ASSIGNED" }]}
          isLoadingOffers={false}
          hasOffersError={false}
          isLoadingAssignments={false}
          hasAssignmentsError={false}
          issues={[]}
          isLoadingIssues={false}
          hasIssuesError={false}
          onBack={vi.fn()}
          onOfferToCleaners={vi.fn()}
          onRefreshOffers={vi.fn()}
          onRefreshIssues={vi.fn()}
          onSimulateOffer={vi.fn()}
          onCreatePublicOfferLink={vi.fn()}
          onAssignCleaner={onAssignCleaner}
          onRemoveAssignment={vi.fn()}
          onReplaceAssignment={vi.fn()}
          onStartCleaning={vi.fn()}
          onCompleteCleaning={vi.fn()}
          onSimulateAssignedCleaner={vi.fn()}
          onResolveIssue={vi.fn()}
        />
      </TranslationProvider>,
    );

    expect(screen.getByText("Assigned cleaners")).toBeVisible();
    expect(screen.getByText("1 cleaner assigned")).toBeVisible();
    expect(screen.queryByText("Assigned cleaner")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Assign" })[0]);
    expect(onAssignCleaner).toHaveBeenCalledWith(expect.objectContaining({ id: "offer-b" }));
  });
});

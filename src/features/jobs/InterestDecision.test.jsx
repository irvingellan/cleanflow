// FB03 (Pilot feedback 2026-11-04): the interested-cleaner decision comes
// first; manual assignment stays as an explicit exception. Fictitious data.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { cloneElement } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JobDetail } from "./JobDetail.jsx";
import { TranslationProvider } from "../../i18n/translations.js";
import { decidableInterestedOffers } from "./InterestDecisionPanel.jsx";

beforeAll(() => { window.requestAnimationFrame = (callback) => { callback(); return 0; }; });

const noop = () => {};
const interested = (id, name) => ({ id: `offer-${id}`, cleanerId: id, cleanerName: name, status: "INTERESTED" });
const pending = (id, name) => ({ id: `offer-${id}`, cleanerId: id, cleanerName: name, status: "PENDING" });

function renderJob({ status = "OFFERED", offers = [], job = {}, assignments = [], onAssignCleaner = vi.fn(), onAssignCleanerDirectly = vi.fn(), initialFocus = null, isLoadingOffers = false, hasOffersError = false } = {}) {
  const cleaners = [{ id: "ana", name: "Ana Demo", active: true }, { id: "bia", name: "Bia Demo", active: true }, { id: "cris", name: "Cris Demo", active: true }];
  const detail = <JobDetail
    job={{ id: "job-fb03", schemaVersion: 2, propertyName: "Example Cottage", scheduledDate: "2026-11-20", scheduledStart: "10:00", operationalStatus: status, assignedCleanerIds: [], ...job }}
    property={null} knownCleaners={cleaners} availableCleaners={cleaners} offers={offers} isLoadingOffers={isLoadingOffers} hasOffersError={hasOffersError}
    assignments={assignments} isLoadingAssignments={false} hasAssignmentsError={false} issues={[]} checklistRun={null} checklistCapability={{ state: "NONE" }}
    initialFocus={initialFocus}
    onBack={noop} onOfferToCleaners={noop} onRefreshOffers={noop} onRefreshIssues={noop} onRefreshChecklistRun={noop} onCreateChecklistRun={noop} onOpenChecklistRun={noop}
    onRefreshChecklistCapability={noop} onIssueChecklistCapability={noop} onRevokeChecklistCapability={noop} onCreatePublicOfferLink={noop}
    onAssignCleaner={onAssignCleaner} onAssignCleanerDirectly={onAssignCleanerDirectly} onRemoveAssignment={noop} onReplaceAssignment={noop}
    onStartCleaning={noop} onCompleteCleaning={noop} onUpdatePrices={noop} onUpdateDetails={noop} onUpdateSchedule={noop} onSaveDataProvenance={noop} onArchive={noop} onRestore={noop} />;
  const view = render(<TranslationProvider>{detail}</TranslationProvider>);
  return { onAssignCleaner, onAssignCleanerDirectly,
    rerenderJob: (props) => view.rerender(<TranslationProvider>{cloneElement(detail, props)}</TranslationProvider>),
  };
}

beforeEach(() => localStorage.setItem("cleanflow-language", "en"));

describe("FB03 — interested cleaner decision", () => {
  it("zero interested: no decision panel and no generic 'Assign cleaner' primary", () => {
    renderJob({ offers: [pending("ana", "Ana Demo")] });
    expect(screen.queryByTestId("interest-decision")).toBeNull();
    expect(screen.getByRole("button", { name: "Next step: See offers awaiting replies" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Next step: Assign cleaner" })).toBeNull();
  });

  it("one interested: primary confirms through the same Offer assignment handler", () => {
    const { onAssignCleaner, onAssignCleanerDirectly } = renderJob({ offers: [interested("ana", "Ana Demo"), pending("bia", "Bia Demo")] });
    expect(screen.getByRole("button", { name: "Next step: Confirm interested cleaner" })).toBeVisible();
    const panel = screen.getByTestId("interest-decision");
    expect(panel).toHaveTextContent("1 cleaner(s) interested");
    expect(panel).toHaveTextContent("Interest does not assign the service.");
    expect(panel).not.toHaveTextContent("Bia Demo");
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm Ana Demo" }));
    expect(onAssignCleaner).toHaveBeenCalledWith(expect.objectContaining({ id: "offer-ana", status: "INTERESTED" }));
    expect(onAssignCleanerDirectly).not.toHaveBeenCalled();
  });

  it("several interested: lists each one; nothing is assigned until a click", () => {
    const { onAssignCleaner } = renderJob({ offers: [interested("ana", "Ana Demo"), interested("bia", "Bia Demo"), interested("cris", "Cris Demo")] });
    expect(screen.getByRole("button", { name: "Next step: Review interested cleaners" })).toBeVisible();
    const panel = screen.getByTestId("interest-decision");
    expect(within(panel).getAllByRole("button", { name: /^Confirm / })).toHaveLength(3);
    expect(onAssignCleaner).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next step: Review interested cleaners" }));
    expect(document.activeElement).toBe(panel);
  });

  it("manual assignment remains an explicit secondary exception", () => {
    const { onAssignCleanerDirectly } = renderJob({ offers: [interested("ana", "Ana Demo")] });
    fireEvent.click(within(screen.getByTestId("interest-decision")).getByRole("button", { name: "Assign someone else manually" }));
    expect(screen.getByRole("group", { name: "Matching cleaners" })).toBeVisible();
    expect(onAssignCleanerDirectly).not.toHaveBeenCalled();
  });

  it("an already assigned interested cleaner is not offered a second approval", () => {
    renderJob({ status: "ASSIGNED", job: { assignedCleanerIds: ["ana"] }, offers: [interested("ana", "Ana Demo")], assignments: [{ id: "a1", cleanerId: "ana", isActive: true }] });
    expect(screen.queryByTestId("interest-decision")).toBeNull();
  });

  it("an automatic first-accept batch (#86) never shows the manual decision", () => {
    renderJob({ job: { offerDistributionMode: "FIRST_ACCEPT_WINS" }, offers: [interested("ana", "Ana Demo")] });
    expect(screen.queryByTestId("interest-decision")).toBeNull();
  });

  it("opening from an interest notice focuses the decision", () => {
    renderJob({ offers: [interested("ana", "Ana Demo")], initialFocus: "interest" });
    expect(document.activeElement).toBe(screen.getByTestId("interest-decision"));
  });

  it("a notice with several current interested cleaners focuses the whole decision without assigning", () => {
    const { onAssignCleaner } = renderJob({ offers: [interested("ana", "Ana Demo"), interested("bia", "Bia Demo")], initialFocus: "interest" });
    expect(screen.getByTestId("interest-decision")).toHaveFocus();
    expect(within(screen.getByTestId("interest-decision")).getAllByRole("button", { name: /^Confirm / })).toHaveLength(2);
    expect(onAssignCleaner).not.toHaveBeenCalled();
  });

  it.each([
    ["no interested cleaners", { offers: [pending("ana", "Ana Demo")] }],
    ["an interest already assigned", { status: "ASSIGNED", job: { assignedCleanerIds: ["ana"] }, offers: [interested("ana", "Ana Demo")] }],
    ["a declined response", { offers: [{ ...interested("ana", "Ana Demo"), status: "DECLINED" }] }],
    ["an automatic batch", { job: { offerDistributionMode: "FIRST_ACCEPT_WINS" }, offers: [interested("ana", "Ana Demo")] }],
    ["an offers read failure", { hasOffersError: true, offers: [interested("ana", "Ana Demo")] }],
    ["an archived job", { job: { archivedAt: new Date() }, offers: [interested("ana", "Ana Demo")] }],
  ])("an interest notice falls back to current Offers for %s", (_label, props) => {
    const { onAssignCleaner } = renderJob({ ...props, initialFocus: "interest" });
    expect(screen.queryByTestId("interest-decision")).toBeNull();
    expect(screen.getByRole("region", { name: "Offers" })).toHaveFocus();
    expect(onAssignCleaner).not.toHaveBeenCalled();
  });

  it("waits for the current offers and applies initial focus only once", () => {
    const offers = [interested("ana", "Ana Demo")];
    const { rerenderJob } = renderJob({ offers, isLoadingOffers: true, initialFocus: "interest" });
    expect(screen.queryByTestId("interest-decision")).toBeNull();
    rerenderJob({ offers, isLoadingOffers: false });
    expect(screen.getByTestId("interest-decision")).toHaveFocus();
    const allReplies = within(screen.getByTestId("interest-decision")).getByRole("button", { name: "See all replies" });
    allReplies.focus();
    rerenderJob({ offers, isLoadingOffers: false });
    expect(allReplies).toHaveFocus();
  });

  it("focuses a new Job after switching from another interest notice", () => {
    const offers = [interested("ana", "Ana Demo")];
    const { rerenderJob } = renderJob({ offers, initialFocus: "interest" });
    expect(screen.getByTestId("interest-decision")).toHaveFocus();
    rerenderJob({ job: { id: "job-another", schemaVersion: 2, operationalStatus: "OFFERED", assignedCleanerIds: [] }, offers: [] });
    expect(screen.getByRole("region", { name: "Offers" })).toHaveFocus();
  });

  it("while offers load, nothing is claimed", () => {
    renderJob({ offers: [interested("ana", "Ana Demo")], isLoadingOffers: true });
    expect(screen.queryByTestId("interest-decision")).toBeNull();
    expect(screen.getByRole("button", { name: "Next step: See offers" })).toBeVisible();
  });

  it("availability mirrors the Offers Assign button rule (legacy Job)", () => {
    const base = { offers: [interested("ana", "A")], canManageOffers: true, canEditRoster: false, isLoadingOffers: false, hasOffersError: false };
    expect(decidableInterestedOffers({ ...base, job: {}, isAssignmentAware: false, isAssigned: false })).toHaveLength(1);
    expect(decidableInterestedOffers({ ...base, job: {}, isAssignmentAware: false, isAssigned: true })).toHaveLength(0);
    expect(decidableInterestedOffers({ ...base, job: {}, isAssignmentAware: true, isAssigned: false })).toHaveLength(0);
    expect(decidableInterestedOffers({ ...base, canManageOffers: false, job: {}, isAssignmentAware: false })).toHaveLength(0);
  });
});

describe("FB08/FB09 — closing answers and invitations", () => {
  it("declines one interested cleaner from the decision panel without assigning anyone", async () => {
    const { onAssignCleaner, rerenderJob } = renderJob({ offers: [interested("ana", "Ana Demo"), interested("bia", "Bia Demo")] });
    const onDecideOffer = vi.fn(async () => {});
    rerenderJob({ onDecideOffer, onReopenOffer: vi.fn(), onSetCleanerSpots: vi.fn() });
    const panel = screen.getByTestId("interest-decision");
    fireEvent.click(within(panel).getAllByRole("button", { name: "Decline interest" })[1]);
    await vi.waitFor(() => expect(onDecideOffer).toHaveBeenCalledWith(expect.objectContaining({ id: "offer-bia" }), "NOT_SELECTED"));
    expect(onAssignCleaner).not.toHaveBeenCalled();
  });

  it("after the only spot is filled, the other answer leaves the open decisions but stays in the history", () => {
    renderJob({ status: "ASSIGNED", job: { assignedCleanerIds: ["ana"] },
      offers: [interested("ana", "Ana Demo"), interested("bia", "Bia Demo"), pending("cris", "Cris Demo")],
      assignments: [{ id: "a1", cleanerId: "ana", isActive: true }] });
    expect(screen.queryByTestId("interest-decision")).toBeNull();
    expect(screen.getAllByText("Spot filled")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Create public link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline interest" })).toBeNull();
  });

  it("withdraws an unanswered invite and reopens a closed one", async () => {
    const { rerenderJob } = renderJob({ offers: [pending("cris", "Cris Demo"), { ...interested("bia", "Bia Demo"), managerDecision: "NOT_SELECTED" }] });
    const onDecideOffer = vi.fn(async () => {});
    const onReopenOffer = vi.fn(async () => {});
    rerenderJob({ onDecideOffer, onReopenOffer, onSetCleanerSpots: vi.fn() });
    expect(screen.getByText("Interest declined")).toBeInTheDocument();
    expect(screen.queryByTestId("interest-decision")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw invite" }));
    await vi.waitFor(() => expect(onDecideOffer).toHaveBeenCalledWith(expect.objectContaining({ id: "offer-cris" }), "WITHDRAWN"));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Reopen" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    await vi.waitFor(() => expect(onReopenOffer).toHaveBeenCalledWith(expect.objectContaining({ id: "offer-bia" })));
  });

  it("changes the number of spots but never below the confirmed cleaners", async () => {
    const onSetCleanerSpots = vi.fn(async () => {});
    const { rerenderJob } = renderJob({ status: "ASSIGNED", job: { assignedCleanerIds: ["ana"] }, offers: [interested("ana", "Ana Demo"), interested("bia", "Bia Demo")], assignments: [{ id: "a1", cleanerId: "ana", isActive: true }] });
    rerenderJob({ onSetCleanerSpots, onDecideOffer: vi.fn(), onReopenOffer: vi.fn() });
    expect(screen.getByRole("button", { name: "One cleaner fewer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "One more cleaner" }));
    await vi.waitFor(() => expect(onSetCleanerSpots).toHaveBeenCalledWith(2));
    rerenderJob({ job: { id: "job-fb03", schemaVersion: 2, propertyName: "Example Cottage", scheduledDate: "2026-11-20", operationalStatus: "ASSIGNED", assignedCleanerIds: ["ana"], requiredCleanerCount: 2 },
      onSetCleanerSpots, onDecideOffer: vi.fn(), onReopenOffer: vi.fn() });
    expect(screen.getByTestId("offer-spots")).toHaveTextContent("1 of 2 cleaners confirmed");
    expect(within(screen.getByTestId("interest-decision")).getByRole("button", { name: "Confirm Bia Demo" })).toBeVisible();
  });
});

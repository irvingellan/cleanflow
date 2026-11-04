// FB03 (Pilot feedback 2026-11-04): the interested-cleaner decision comes
// first; manual assignment stays as an explicit exception. Fictitious data.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JobDetail } from "./JobDetail.jsx";
import { TranslationProvider } from "../../i18n/translations.js";
import { decidableInterestedOffers } from "./InterestDecisionPanel.jsx";

beforeAll(() => { window.requestAnimationFrame = (callback) => { callback(); return 0; }; });

const noop = () => {};
const interested = (id, name) => ({ id: `offer-${id}`, cleanerId: id, cleanerName: name, status: "INTERESTED" });
const pending = (id, name) => ({ id: `offer-${id}`, cleanerId: id, cleanerName: name, status: "PENDING" });

function renderJob({ status = "OFFERED", offers = [], job = {}, assignments = [], onAssignCleaner = vi.fn(), onAssignCleanerDirectly = vi.fn(), initialFocus = null, isLoadingOffers = false } = {}) {
  const cleaners = [{ id: "ana", name: "Ana Demo", active: true }, { id: "bia", name: "Bia Demo", active: true }, { id: "cris", name: "Cris Demo", active: true }];
  render(<TranslationProvider><JobDetail
    job={{ id: "job-fb03", schemaVersion: 2, propertyName: "Example Cottage", scheduledDate: "2026-11-20", scheduledStart: "10:00", operationalStatus: status, assignedCleanerIds: [], ...job }}
    property={null} knownCleaners={cleaners} availableCleaners={cleaners} offers={offers} isLoadingOffers={isLoadingOffers} hasOffersError={false}
    assignments={assignments} isLoadingAssignments={false} hasAssignmentsError={false} issues={[]} checklistRun={null} checklistCapability={{ state: "NONE" }}
    initialFocus={initialFocus}
    onBack={noop} onOfferToCleaners={noop} onRefreshOffers={noop} onRefreshIssues={noop} onRefreshChecklistRun={noop} onCreateChecklistRun={noop} onOpenChecklistRun={noop}
    onRefreshChecklistCapability={noop} onIssueChecklistCapability={noop} onRevokeChecklistCapability={noop} onCreatePublicOfferLink={noop}
    onAssignCleaner={onAssignCleaner} onAssignCleanerDirectly={onAssignCleanerDirectly} onRemoveAssignment={noop} onReplaceAssignment={noop}
    onStartCleaning={noop} onCompleteCleaning={noop} onUpdatePrices={noop} onUpdateDetails={noop} onUpdateSchedule={noop} onSaveDataProvenance={noop} onArchive={noop} onRestore={noop} />
  </TranslationProvider>);
  return { onAssignCleaner, onAssignCleanerDirectly };
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

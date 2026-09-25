import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetail } from "./JobDetail.jsx";

function renderJobDetail(status, overrides = {}, callbacks = {}, checklist = {}, property = null) {
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
        property={property}
        knownCleaners={[]}
        offers={offers}
        isLoadingOffers={false}
        hasOffersError={false}
        assignments={checklist.assignments || []}
        isLoadingAssignments={false}
        hasAssignmentsError={false}
        issues={[]}
        isLoadingIssues={false}
        hasIssuesError={false}
        checklistRun={checklist.run || null}
        isLoadingChecklistRun={checklist.isLoading || false}
        hasChecklistRunError={checklist.hasLoadError || false}
        isCreatingChecklistRun={checklist.isCreating || false}
        hasCreateChecklistRunError={checklist.hasCreateError || false}
        checklistCapability={checklist.capability || { state: "NONE" }}
        isLoadingChecklistCapability={checklist.isCapabilityLoading || false}
        hasChecklistCapabilityError={checklist.hasCapabilityLoadError || false}
        isIssuingChecklistCapability={checklist.isIssuingCapability || false}
        hasIssueChecklistCapabilityError={checklist.hasIssueCapabilityError || false}
        isRevokingChecklistCapability={checklist.isRevokingCapability || false}
        hasRevokeChecklistCapabilityError={checklist.hasRevokeCapabilityError || false}
        onBack={noOp}
        onOfferToCleaners={callbacks.onOfferToCleaners || noOp}
        onRefreshOffers={callbacks.onRefreshOffers || noOp}
        onRefreshIssues={noOp}
        onRefreshChecklistRun={callbacks.onRefreshChecklistRun || noOp}
        onCreateChecklistRun={callbacks.onCreateChecklistRun || noOp}
        onOpenChecklistRun={callbacks.onOpenChecklistRun || noOp}
        onRefreshChecklistCapability={callbacks.onRefreshChecklistCapability || noOp}
        onIssueChecklistCapability={callbacks.onIssueChecklistCapability || noOp}
        onRevokeChecklistCapability={callbacks.onRevokeChecklistCapability || noOp}
        onCreatePublicOfferLink={callbacks.onCreatePublicOfferLink || noOp}
        onAssignCleaner={noOp}
        onRemoveAssignment={noOp}
        onReplaceAssignment={noOp}
        onStartCleaning={noOp}
        onCompleteCleaning={noOp}
        onUpdatePrices={callbacks.onUpdatePrices || noOp}
        onUpdateDetails={callbacks.onUpdateDetails || noOp}
        onSimulateAssignedCleaner={noOp}
        onResolveIssue={noOp}
      />
    </TranslationProvider>,
  );
}

describe("JobDetail lifecycle actions", () => {
  it("lets a manager edit only guest name and notes and reports the saved result", async () => {
    const onUpdateDetails = vi.fn().mockResolvedValue({
      guestName: "Updated guest",
      notes: "Text the cleaner at arrival.",
    });
    renderJobDetail("UNASSIGNED", { guestName: "Original guest", notes: "Old note" }, { onUpdateDetails });

    expect(screen.getByText("Old note")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit guest / notes" }));
    fireEvent.change(screen.getByLabelText("Guest name (optional)"), { target: { value: " Updated guest " } });
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: " Text the cleaner at arrival. " } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));

    await waitFor(() => {
      expect(onUpdateDetails).toHaveBeenCalledWith({
        guestName: "Updated guest",
        notes: "Text the cleaner at arrival.",
      });
      expect(screen.getByRole("status")).toHaveTextContent("Guest and notes updated.");
    });
  });

  it("preserves the edit form and shows an error when saving Job details fails", async () => {
    const onUpdateDetails = vi.fn().mockRejectedValue(new Error("offline"));
    renderJobDetail("UNASSIGNED", {}, { onUpdateDetails });

    fireEvent.click(screen.getByRole("button", { name: "Edit guest / notes" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "New note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unable to update guest and notes. Try again."));
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("New note");
  });

  it("keeps completed or archived Job detail edits disabled to preserve history", () => {
    const { rerender } = renderJobDetail("COMPLETED");

    expect(screen.getByRole("button", { name: "Edit guest / notes" })).toBeDisabled();
    expect(screen.getByText("Completed or archived service details are read-only to preserve history.")).toBeVisible();

    rerender(
      <TranslationProvider>
        <JobDetail
          job={{ id: "job-1", propertyName: "Pacific Beach Condo", operationalStatus: "ASSIGNED", archivedAt: { seconds: 1 } }}
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
          onUpdateDetails={vi.fn()}
        />
      </TranslationProvider>,
    );

    expect(screen.getByRole("button", { name: "Edit guest / notes" })).toBeDisabled();
  });

  it("shows derived gross margin only with both Job price snapshots and lets a manager edit only those prices", async () => {
    const onUpdatePrices = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderJobDetail("UNASSIGNED", {
      clientPrice: 350,
      cleanerPayout: 200,
    }, { onUpdatePrices });

    expect(screen.getByText("Gross margin")).toBeVisible();
    expect(screen.getByText("$150.00")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit prices" }));
    const clientPriceInputs = screen.getAllByLabelText("Client price");
    const cleanerPayoutInputs = screen.getAllByLabelText("Cleaner payout");
    fireEvent.change(clientPriceInputs.at(-1), { target: { value: "375" } });
    fireEvent.change(cleanerPayoutInputs.at(-1), { target: { value: "210" } });
    fireEvent.click(screen.getByRole("button", { name: "Save prices" }));

    await waitFor(() => {
      expect(onUpdatePrices).toHaveBeenCalledWith({ clientPrice: 375, cleanerPayout: 210 });
    });

    rerender(
      <TranslationProvider>
        <JobDetail
          job={{ id: "job-1", propertyName: "Pacific Beach Condo", operationalStatus: "UNASSIGNED" }}
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
          onCreatePublicOfferLink={vi.fn()}
          onAssignCleaner={vi.fn()}
          onRemoveAssignment={vi.fn()}
          onReplaceAssignment={vi.fn()}
          onStartCleaning={vi.fn()}
          onCompleteCleaning={vi.fn()}
          onUpdatePrices={vi.fn()}
          onSimulateAssignedCleaner={vi.fn()}
          onResolveIssue={vi.fn()}
        />
      </TranslationProvider>,
    );

    expect(screen.getAllByText("Not set")).toHaveLength(3);
  });

  it("previews assigned Property details and copies sensitive access only after explicit confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderJobDetail("ASSIGNED", {
      propertyId: "property-1",
      assignedCleanerId: "cleaner-a",
      assignedCleanerName: "Ana",
      scheduledDate: "2026-09-08",
      scheduledStart: "10:30",
      notes: "Internal manager note",
      clientPrice: 350,
      cleanerPayout: 200,
    }, {}, {}, {
      id: "property-1",
      garageParking: "Garage entrance",
      cleanerInstructions: "Please reset the thermostat.",
      accessInstructions: "Use side door code 8877.",
      keyCodeInfo: "Lockbox key 3921.",
      additionalNotes: "Internal property note",
      address: "Private street address",
      defaultClientPrice: 600,
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy message for Ana" }));
    expect(writeText).not.toHaveBeenCalled();

    const preview = screen.getByRole("region", { name: "Review reminder for Ana" });
    expect(within(preview).getByText(/Please reset the thermostat/)).toBeVisible();
    expect(within(preview).getByText(/Garage entrance/)).toBeVisible();
    expect(within(preview).getByText(/Use side door code 8877/)).toBeVisible();
    expect(within(preview).getByText(/Lockbox key 3921/)).toBeVisible();
    expect(within(preview).getByText(/Property access details — private/)).toBeVisible();

    const message = within(preview).getByText(/Hi Ana! 😊/);
    expect(message).toHaveTextContent("Date: Sep 8, 2026");
    expect(message).toHaveTextContent("Time: 10:30");
    expect(message).toHaveTextContent("Please reset the thermostat.");
    expect(message).not.toHaveTextContent("Garage entrance");
    expect(message).not.toHaveTextContent("8877");
    expect(message).not.toHaveTextContent("3921");
    expect(message).not.toHaveTextContent("Private street address");
    expect(message).not.toHaveTextContent("Internal manager note");
    expect(message).not.toHaveTextContent("Internal property note");
    expect(message).not.toHaveTextContent("350");
    expect(message).not.toHaveTextContent("200");

    fireEvent.click(within(preview).getByRole("checkbox", {
      name: "Include these sensitive access details in the copied message",
    }));
    const confirmedMessage = within(preview).getByText(/Hi Ana! 😊/);
    expect(confirmedMessage).toHaveTextContent("Sensitive access details:");
    expect(confirmedMessage).toHaveTextContent("Garage entrance");
    expect(confirmedMessage).toHaveTextContent("Use side door code 8877");
    expect(confirmedMessage).toHaveTextContent("Lockbox key 3921");

    fireEvent.click(within(preview).getByRole("button", { name: "Copy reminder" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Hi Ana! 😊"));
    });
    expect(writeText.mock.calls[0][0]).toContain("Time: 10:30");
    expect(writeText.mock.calls[0][0]).toContain("Use side door code 8877");
    expect(writeText.mock.calls[0][0]).not.toContain("Private street address");
    expect(writeText.mock.calls[0][0]).not.toContain("Internal property note");
    expect(writeText.mock.calls[0][0]).not.toContain("350");
    expect(screen.getByRole("button", { name: "Message copied" })).toBeVisible();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("uses only the active assigned cleaner and exact linked Property for schema-v2 reminders", () => {
    renderJobDetail("ASSIGNED", {
      schemaVersion: 2,
      propertyId: "property-1",
      assignedCleanerIds: ["cleaner-a"],
    }, {}, {
      assignments: [{
        id: "assignment-a",
        cleanerId: "cleaner-a",
        cleanerNameSnapshot: "Ana",
        isActive: true,
        executionStatus: "ASSIGNED",
      }],
    }, {
      id: "different-property",
      keyCodeInfo: "Must not be included",
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy message for Ana" }));

    expect(screen.getByRole("region", { name: "Review reminder for Ana" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy reminder" })).toBeEnabled();
    expect(screen.queryByText(/Must not be included/)).not.toBeInTheDocument();
  });

  it("shows a manager Create checklist action and prevents another click while creation is pending", () => {
    const onCreateChecklistRun = vi.fn();
    const { rerender } = renderJobDetail(
      "UNASSIGNED",
      {},
      { onCreateChecklistRun },
    );

    fireEvent.click(screen.getByRole("button", { name: "Create checklist" }));
    expect(onCreateChecklistRun).toHaveBeenCalledTimes(1);

    rerender(
      <TranslationProvider>
        <JobDetail
          job={{ id: "job-1", propertyName: "Pacific Beach Condo", operationalStatus: "UNASSIGNED" }}
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
          checklistRun={null}
          isLoadingChecklistRun={false}
          hasChecklistRunError={false}
          isCreatingChecklistRun
          hasCreateChecklistRunError={false}
          onBack={vi.fn()}
          onOfferToCleaners={vi.fn()}
          onRefreshOffers={vi.fn()}
          onRefreshIssues={vi.fn()}
          onRefreshChecklistRun={vi.fn()}
          onCreateChecklistRun={onCreateChecklistRun}
          onOpenChecklistRun={vi.fn()}
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

    const pendingButton = screen.getByRole("button", { name: "Creating checklist…" });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(onCreateChecklistRun).toHaveBeenCalledTimes(1);
  });

  it("uses Open checklist for an existing Run and exposes a creation error", () => {
    const onOpenChecklistRun = vi.fn();
    const existingRun = {
      id: "initial",
      status: "DRAFT",
      checklistItemCount: 28,
      inventoryItemCount: 13,
      requiredPhotoTypes: [],
    };
    const { rerender } = renderJobDetail(
      "UNASSIGNED",
      {},
      { onOpenChecklistRun },
      { run: existingRun },
    );

    expect(screen.queryByRole("button", { name: "Create checklist" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open checklist" }));
    expect(onOpenChecklistRun).toHaveBeenCalledTimes(1);

    rerender(
      <TranslationProvider>
        <JobDetail
          job={{ id: "job-1", propertyName: "Pacific Beach Condo", operationalStatus: "UNASSIGNED" }}
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
          checklistRun={null}
          isLoadingChecklistRun={false}
          hasChecklistRunError={false}
          isCreatingChecklistRun={false}
          hasCreateChecklistRunError
          onBack={vi.fn()}
          onOfferToCleaners={vi.fn()}
          onRefreshOffers={vi.fn()}
          onRefreshIssues={vi.fn()}
          onRefreshChecklistRun={vi.fn()}
          onCreateChecklistRun={vi.fn()}
          onOpenChecklistRun={vi.fn()}
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

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to create the checklist. Try again.");
  });

  it("creates, copies, replaces, and revokes a cleaner link only for an eligible Draft Run", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const onIssueChecklistCapability = vi.fn().mockResolvedValue("https://cleanflow.example/checklist?t=token");
    const onRevokeChecklistCapability = vi.fn();
    renderJobDetail("ASSIGNED", {
      schemaVersion: 2,
      assignedCleanerIds: ["cleaner-a"],
    }, { onIssueChecklistCapability, onRevokeChecklistCapability }, {
      run: { id: "initial", status: "DRAFT", checklistItemCount: 28, inventoryItemCount: 13 },
      capability: { state: "NONE" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create cleaner link" }));
    await waitFor(() => expect(onIssueChecklistCapability).toHaveBeenCalledWith("cleaner-a"));
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://cleanflow.example/checklist?t=token");
    expect(screen.queryByRole("button", { name: "Revoke link" })).not.toBeInTheDocument();
  });

  it("shows a Checklist Run load error with a retry action", () => {
    const onRefreshChecklistRun = vi.fn();
    renderJobDetail(
      "UNASSIGNED",
      {},
      { onRefreshChecklistRun },
      { hasLoadError: true },
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load the checklist.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRefreshChecklistRun).toHaveBeenCalledTimes(1);
  });

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

  it("keeps real public-offer actions and response statuses without exposing simulation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const onCreatePublicOfferLink = vi.fn().mockResolvedValue({
      url: "https://cleanflow.example/offer/test-token",
      offeredCompensation: 125,
    });
    renderJobDetail(
      "OFFERED",
      {
        schemaVersion: 1,
        scheduledDate: "2026-09-25",
        scheduledStart: "10:30",
        clientPrice: 400,
        cleanerPayout: 160,
        offers: [
          { id: "pending-offer", cleanerId: "cleaner-pending", cleanerName: "Ana", status: "PENDING" },
          { id: "interested-offer", cleanerId: "cleaner-interested", cleanerName: "Beatriz", status: "INTERESTED" },
          { id: "declined-offer", cleanerId: "cleaner-declined", cleanerName: "Carla", status: "DECLINED" },
        ],
      },
      { onCreatePublicOfferLink },
    );

    const pendingOffer = screen.getByText("Ana").closest("article");
    expect(pendingOffer).not.toBeNull();
    expect(pendingOffer).toHaveTextContent("Pending");
    fireEvent.click(within(pendingOffer).getByRole("button", { name: "Create public link" }));
    expect(screen.getByLabelText("Offered compensation (USD)")).toHaveValue(160);
    fireEvent.change(screen.getByLabelText("Offered compensation (USD)"), {
      target: { value: "125" },
    });
    fireEvent.click(within(pendingOffer).getByRole("button", { name: "Create public link" }));

    await waitFor(() => {
      expect(onCreatePublicOfferLink).toHaveBeenCalledWith(
        expect.objectContaining({ id: "pending-offer", status: "PENDING" }),
        125,
      );
    });
    expect(pendingOffer.querySelector(".offer-compensation-summary"))
      .toHaveTextContent("Offered compensation (USD): $125.00");
    expect(screen.getByRole("link", { name: "Open public cleaner offer" })).toBeVisible();
    expect(screen.getByText("Interested")).toBeVisible();
    expect(screen.getByText("Not available")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Simulate offer" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy offer message" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("Offered compensation: $125.00");
    expect(writeText.mock.calls[0][0]).toContain("https://cleanflow.example/offer/test-token");
    expect(writeText.mock.calls[0][0]).not.toContain("$400.00");
    expect(screen.getByRole("button", { name: "Offer message copied" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Create public link" }));
    expect(screen.getByLabelText("Offered compensation (USD)")).toHaveValue(125);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("keeps v2 Job totals out of per-cleaner offer suggestions and message when amount is unset", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const onCreatePublicOfferLink = vi.fn().mockResolvedValue({
      url: "https://cleanflow.example/offer/synthetic-v2",
      offeredCompensation: null,
    });

    renderJobDetail(
      "OFFERED",
      {
        schemaVersion: 2,
        assignedCleanerIds: [],
        cleanerPayout: 600,
        clientPrice: 900,
        offers: [
          { id: "pending-v2", cleanerId: "cleaner-v2", cleanerName: "Ana", status: "PENDING" },
        ],
      },
      { onCreatePublicOfferLink },
    );

    const pendingOffer = screen.getByText("Ana").closest("article");
    fireEvent.click(within(pendingOffer).getByRole("button", { name: "Create public link" }));
    expect(screen.getByLabelText("Offered compensation (USD)")).toHaveValue(null);
    expect(screen.getByRole("status")).toHaveTextContent("Amount not set");
    fireEvent.click(within(pendingOffer).getByRole("button", { name: "Create public link" }));

    await waitFor(() => {
      expect(onCreatePublicOfferLink).toHaveBeenCalledWith(
        expect.objectContaining({ id: "pending-v2" }),
        null,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy offer message" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("Amount not set / To be agreed");
    expect(writeText.mock.calls[0][0]).not.toContain("$600.00");
    expect(writeText.mock.calls[0][0]).not.toContain("$900.00");
    expect(screen.getByText("Amount not set. The cleaner will see ‘Amount not set / To be agreed.’")).toBeVisible();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
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

  it("creates a recipient-specific reminder for an assigned cleaner in a team Job", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <TranslationProvider>
        <JobDetail
          job={{
            id: "team-job",
            propertyName: "Team Property",
            scheduledDate: "2026-09-08",
            operationalStatus: "ASSIGNED",
            schemaVersion: 2,
            assignedCleanerIds: ["cleaner-a", "cleaner-b"],
          }}
          knownCleaners={[
            { id: "cleaner-a", name: "Ana" },
            { id: "cleaner-b", name: "Beatriz" },
          ]}
          offers={[]}
          isLoadingOffers={false}
          hasOffersError={false}
          assignments={[
            { id: "assignment-a", cleanerId: "cleaner-a", cleanerNameSnapshot: "Ana", isActive: true, executionStatus: "ASSIGNED" },
            { id: "assignment-b", cleanerId: "cleaner-b", cleanerNameSnapshot: "Beatriz", isActive: true, executionStatus: "ASSIGNED" },
          ]}
          isLoadingAssignments={false}
          hasAssignmentsError={false}
          issues={[]}
          isLoadingIssues={false}
          hasIssuesError={false}
          onBack={vi.fn()}
          onOfferToCleaners={vi.fn()}
          onRefreshOffers={vi.fn()}
          onRefreshIssues={vi.fn()}
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

    fireEvent.click(screen.getByRole("button", { name: "Copy message for Ana" }));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Review reminder for Ana" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Review reminder for Beatriz" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy reminder" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Hi Ana! 😊"));
    });
    expect(writeText).toHaveBeenCalledWith(expect.not.stringContaining("Beatriz"));

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });
});

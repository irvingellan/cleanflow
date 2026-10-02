import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetail } from "./JobDetail.jsx";

const cleanerService = vi.hoisted(() => ({ getCleanerContactsById: vi.fn().mockResolvedValue({}) }));

vi.mock("../cleaners/cleanerService.js", () => ({
  getCleanerContactsById: cleanerService.getCleanerContactsById,
}));

function renderJobDetail(status, overrides = {}, callbacks = {}, checklist = {}, property = null) {
  const noOp = vi.fn();
  const {
    offers = [],
    offersCreatedCount = null,
    isLoadingOffers = false,
    hasOffersError = false,
    ...jobOverrides
  } = overrides;

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
        knownCleaners={checklist.knownCleaners || []}
        availableCleaners={checklist.availableCleaners || []}
        isLoadingCleaners={checklist.isLoadingCleaners || false}
        hasCleanerError={checklist.hasCleanerError || false}
        offers={offers}
        isLoadingOffers={isLoadingOffers}
        hasOffersError={hasOffersError}
        offersCreatedCount={offersCreatedCount}
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
        onPrepareChecklistReminder={callbacks.onPrepareChecklistReminder || noOp}
        onRevokeChecklistCapability={callbacks.onRevokeChecklistCapability || noOp}
        onCreatePublicOfferLink={callbacks.onCreatePublicOfferLink || noOp}
        onAssignCleaner={noOp}
        onAssignCleanerDirectly={callbacks.onAssignCleanerDirectly || noOp}
        onRemoveAssignment={noOp}
        onReplaceAssignment={noOp}
        onStartCleaning={noOp}
        onCompleteCleaning={callbacks.onCompleteCleaning || noOp}
        onUpdatePrices={callbacks.onUpdatePrices || noOp}
        onUpdateDetails={callbacks.onUpdateDetails || noOp}
        onUpdateSchedule={callbacks.onUpdateSchedule || noOp}
        onSimulateAssignedCleaner={noOp}
        onResolveIssue={noOp}
        onArchive={callbacks.onArchive || noOp}
      />
    </TranslationProvider>,
  );
}

describe("JobDetail lifecycle actions", () => {
  it("has one schedule entry and no visual fixture controls in the real detail", () => {
    renderJobDetail("ASSIGNED");
    expect(screen.getAllByRole("button", { name: /Change date \/ time/ })).toHaveLength(1);
    expect(screen.queryByText("Local synthetic scenario")).not.toBeInTheDocument();
  });
  it("keeps deletion collapsed below operations and preserves its confirmation", () => {
    const archive = vi.fn();
    renderJobDetail("ASSIGNED", {}, { onArchive: archive });
    const summary = screen.getByText("Other service actions");
    expect(summary.parentElement).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeVisible();
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(archive).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Remove from view?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(archive).toHaveBeenCalledTimes(1);
  });
  it("UNASSIGNED next step opens the current direct-assignment form", () => {
    renderJobDetail("UNASSIGNED", { schemaVersion: 2, assignedCleanerIds: [] });
    fireEvent.click(screen.getByRole("button", { name: "Next step: Assign cleaner" }));
    expect(screen.getByRole("combobox")).toBeVisible();
    expect(screen.getByText("Assign an active cleaner without an Offer or interest response.")).toBeVisible();
  });
  it("ASSIGNED without Run prepares the current reminder without sending", () => {
    const complete = vi.fn();
    renderJobDetail("ASSIGNED", { schemaVersion: 2, assignedCleanerIds: ["cleaner-1"] }, { onCompleteCleaning: complete }, {
      knownCleaners: [{ id: "cleaner-1", name: "Demo Cleaner" }],
      assignments: [{ id: "a1", cleanerId: "cleaner-1", isActive: true }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Next step: Prepare reminder" }));
    expect(screen.getByRole("heading", { name: "Review reminder for Demo Cleaner" })).toBeVisible();
    expect(complete).not.toHaveBeenCalled();
  });
  it("DRAFT schedule intention explains protection and opens the existing Run", () => {
    const open = vi.fn();
    renderJobDetail("ASSIGNED", { schemaVersion: 2 }, { onOpenChecklistRun: open }, { run: { id: "initial", status: "DRAFT" } });
    expect(screen.getByRole("button", { name: "Next step: Open existing checklist" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    expect(within(screen.getByRole("region", { name: "What do you want to do?" })).getByRole("status")).toHaveTextContent(/Do not delete and recreate the service/);
    fireEvent.click(screen.getByRole("button", { name: "Open existing checklist →" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Save schedule" })).not.toBeInTheDocument();
  });
  it("READY suggests review through the existing open handler", () => {
    const open = vi.fn();
    renderJobDetail("ASSIGNED", {}, { onOpenChecklistRun: open }, { run: { status: "READY_FOR_REVIEW" } });
    fireEvent.click(screen.getByRole("button", { name: "Next step: Review checklist" }));
    expect(open).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    expect(screen.getByRole("button", { name: "Review checklist →" })).toBeVisible();
  });
  it("unknown Run state directs to existing retry/loading controls without creating", () => {
    const create = vi.fn();
    const open = vi.fn();
    renderJobDetail("ASSIGNED", {}, { onCreateChecklistRun: create, onOpenChecklistRun: open }, { isLoading: true });
    fireEvent.click(screen.getByRole("button", { name: "Next step: Checklist" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    expect(within(screen.getByRole("region", { name: "What do you want to do?" })).getByRole("status")).toHaveTextContent("Checking whether a checklist has been created…");
    expect(create).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
  it("multiple assigned cleaners require explicit recipient selection", () => {
    renderJobDetail("ASSIGNED", { schemaVersion: 2, assignedCleanerIds: ["c1", "c2"] }, {}, {
      knownCleaners: [{ id: "c1", name: "Demo One" }, { id: "c2", name: "Demo Two" }],
      assignments: [{ id: "a1", cleanerId: "c1", isActive: true }, { id: "a2", cleanerId: "c2", isActive: true }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Next step: Prepare reminder" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Choose the assigned cleaner below/);
    expect(screen.queryByRole("heading", { name: /Review reminder for/ })).not.toBeInTheDocument();
  });
  it("completed mutation intentions remain visible without invoking mutations", () => {
    const complete = vi.fn();
    renderJobDetail("COMPLETED", { schemaVersion: 2 }, { onCompleteCleaning: complete });
    for (const action of ["Assign / change cleaner", "Prepare reminder", "Complete service"]) {
      fireEvent.click(screen.getByRole("button", { name: `Choose intention: ${action}` }));
      expect(screen.getByRole("status")).toHaveTextContent(/historical or archived/);
    }
    expect(screen.getByRole("button", { name: "Next step: View saved service" })).toBeEnabled();
    expect(complete).not.toHaveBeenCalled();
  });
  it("completion intention opens confirmation, not an immediate mutation", () => {
    const complete = vi.fn();
    renderJobDetail("ASSIGNED", {}, { onCompleteCleaning: complete });
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Complete service" }));
    expect(complete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Complete service" }));
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("schedule intention uses the original edit/save handler and warning", async () => {
    const update = vi.fn().mockResolvedValue({ job: { scheduledDate: "2026-10-06", scheduledStart: "12:00" } });
    renderJobDetail("ASSIGNED", { scheduledDate: "2026-10-05", scheduledStart: "11:00" }, { onUpdateSchedule: update });
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    expect(screen.getByText(/resend the updated details/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Scheduled date"), { target: { value: "2026-10-06" } });
    fireEvent.change(screen.getByLabelText("Scheduled time"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    expect(screen.getByLabelText("Scheduled date")).toHaveValue("2026-10-06");
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ scheduledDate: "2026-10-06", scheduledStart: "12:00" }));
  });
  it("lets an eligible Job schedule change and warns that an external cleaner message may be stale", async () => {
    const onUpdateSchedule = vi.fn().mockResolvedValue({
      changed: true,
      job: { scheduledDate: "2026-10-02", scheduledStart: "14:30" },
    });
    renderJobDetail("OFFERED", {
      scheduledDate: "2026-10-01",
      scheduledStart: "10:00",
    }, { onUpdateSchedule });

    const scheduleAction = screen.getByRole("button", { name: "Choose intention: Change date / time" });
    const detailsAction = screen.getByRole("button", { name: "Edit guest / notes" });
    expect(scheduleAction.compareDocumentPosition(detailsAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(scheduleAction);
    expect(screen.getByLabelText("Scheduled date")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Scheduled time")).toHaveValue("10:00");
    fireEvent.change(screen.getByLabelText("Scheduled date"), { target: { value: "2026-10-02" } });
    fireEvent.change(screen.getByLabelText("Scheduled time"), { target: { value: "14:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => {
      expect(onUpdateSchedule).toHaveBeenCalledWith({
        scheduledDate: "2026-10-02",
        scheduledStart: "14:30",
      });
      expect(screen.getByRole("status")).toHaveTextContent("Schedule updated.");
      expect(screen.getByText(/please resend the updated details/i)).toBeVisible();
    });
  });

  it("rejects an invalid date before saving and allows leaving the time blank", async () => {
    const onUpdateSchedule = vi.fn();
    renderJobDetail("UNASSIGNED", { scheduledDate: "2026-10-01", scheduledStart: "09:00" }, { onUpdateSchedule });
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    fireEvent.change(screen.getByLabelText("Scheduled date"), { target: { value: "2026-02-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid calendar date.");
    expect(onUpdateSchedule).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Scheduled date"), { target: { value: "2026-10-02" } });
    fireEvent.change(screen.getByLabelText("Scheduled time"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(onUpdateSchedule).toHaveBeenCalledWith({
      scheduledDate: "2026-10-02",
      scheduledStart: "",
    }));
  });

  it("explains schedule unavailability without opening the form while Run state is unknown or frozen", () => {
    const { unmount } = renderJobDetail("ASSIGNED", {}, {}, { isLoading: true });
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    expect(screen.queryByRole("button", { name: "Save schedule" })).not.toBeInTheDocument();
    expect(screen.getByText("Checking whether a checklist has been created…")).toBeVisible();
    unmount();

    renderJobDetail("ASSIGNED", {}, {}, { run: { id: "initial", status: "DRAFT" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    expect(screen.queryByRole("button", { name: "Save schedule" })).not.toBeInTheDocument();
    expect(screen.getByText(/Do not delete and recreate the service/i)).toBeVisible();
  });

  it.each(["IN_PROGRESS", "COMPLETED"])("does not allow schedule edits for %s Jobs", (status) => {
    renderJobDetail(status, { scheduledDate: "2026-10-01" });
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    expect(screen.queryByRole("button", { name: "Save schedule" })).not.toBeInTheDocument();
    expect(screen.getByText(/only before work starts/i)).toBeVisible();
  });

  it("does not allow schedule edits on archived Jobs", () => {
    renderJobDetail("ASSIGNED", { archivedAt: { seconds: 1 } });
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    expect(screen.queryByRole("button", { name: "Save schedule" })).not.toBeInTheDocument();
  });

  it("keeps the schedule form open with a useful error after a callable failure", async () => {
    const onUpdateSchedule = vi.fn().mockRejectedValue(new Error("offline"));
    renderJobDetail("UNASSIGNED", { scheduledDate: "2026-10-01" }, { onUpdateSchedule });
    fireEvent.click(screen.getByRole("button", { name: "Choose intention: Change date / time" }));
    fireEvent.change(screen.getByLabelText("Scheduled date"), { target: { value: "2026-10-03" } });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to update the schedule.");
    expect(screen.getByLabelText("Scheduled date")).toHaveValue("2026-10-03");
  });

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
    }, {}, { knownCleaners: [{ id: "cleaner-a", name: "Ana", phone: "19495551234" }] }, {
      id: "property-1",
      garageParking: "Garage entrance",
      cleanerInstructions: "Please reset the thermostat.",
      accessInstructions: "Use side door code 8877.",
      keyCodeInfo: "Lockbox key 3921.",
      additionalNotes: "Internal property note",
      address: "Private street address",
      defaultClientPrice: 600,
    });

    fireEvent.click(screen.getByRole("button", { name: "Prepare message" }));
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

    const whatsappLink = within(preview).getByRole("link", { name: "Open in WhatsApp" });
    expect(new URL(whatsappLink.href).searchParams.get("text")).toBe(message.textContent);

    fireEvent.click(within(preview).getByRole("checkbox", {
      name: "Include these sensitive access details in the copied message",
    }));
    const confirmedMessage = within(preview).getByText(/Hi Ana! 😊/);
    expect(confirmedMessage).toHaveTextContent("Sensitive access details:");
    expect(confirmedMessage).toHaveTextContent("Garage entrance");
    expect(confirmedMessage).toHaveTextContent("Use side door code 8877");
    expect(confirmedMessage).toHaveTextContent("Lockbox key 3921");
    expect(new URL(whatsappLink.href).searchParams.get("text")).toBe(confirmedMessage.textContent);

    fireEvent.click(within(preview).getByRole("button", { name: "Copy reminder" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toBe(confirmedMessage.textContent);
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

  it.each([
    ["en", "Prepare message", "Review reminder for Ana", "Open in WhatsApp", "WhatsApp opens with a prefilled draft."],
    ["pt", "Preparar mensagem", "Revisar lembrete para Ana", "Abrir no WhatsApp", "O WhatsApp abrirá uma mensagem preenchida."],
    ["es", "Preparar mensaje", "Revisar recordatorio para Ana", "Abrir en WhatsApp", "WhatsApp abrirá un borrador con el mensaje."],
  ])("localizes the assigned-cleaner message action in %s", (language, prepareLabel, previewTitle, actionLabel, note) => {
    const previousLanguage = window.localStorage.getItem("cleanflow-language");
    window.localStorage.setItem("cleanflow-language", language);
    const { unmount } = renderJobDetail("ASSIGNED", {
      schemaVersion: 2,
      assignedCleanerIds: ["cleaner-a"],
      scheduledDate: "2026-09-08",
    }, {}, {
      knownCleaners: [{ id: "cleaner-a", name: "Ana", phone: "+19495551234" }],
      assignments: [{ id: "assignment-a", cleanerId: "cleaner-a", cleanerNameSnapshot: "Ana", isActive: true, executionStatus: "ASSIGNED" }],
    });
    try {
      fireEvent.click(screen.getByRole("button", { name: prepareLabel }));
      expect(screen.getByRole("region", { name: previewTitle })).toBeVisible();
      expect(screen.getByRole("link", { name: actionLabel })).toBeVisible();
      expect(screen.getByText(new RegExp(note))).toBeVisible();
    } finally {
      unmount();
      if (previousLanguage === null) window.localStorage.removeItem("cleanflow-language");
      else window.localStorage.setItem("cleanflow-language", previousLanguage);
    }
  });

  it("builds the assigned-cleaner reminder in the Cleaner language while keeping preview controls in manager English", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.localStorage.setItem("cleanflow-language", "en");
    renderJobDetail("ASSIGNED", {
      schemaVersion: 2,
      propertyId: "property-1",
      propertyName: "Harbor View Condo",
      assignedCleanerIds: ["cleaner-a"],
      scheduledDate: "2026-09-08",
      scheduledStart: "10:30",
    }, {}, {
      knownCleaners: [{ id: "cleaner-a", name: "Ana", phone: "+19495551234", preferredLanguage: "pt" }],
      assignments: [{ id: "assignment-a", cleanerId: "cleaner-a", cleanerNameSnapshot: "Ana", isActive: true, executionStatus: "ASSIGNED" }],
    }, {
      id: "property-1",
      cleanerInstructions: "Reinicie o termostato.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Prepare message" }));
    const preview = screen.getByRole("region", { name: "Review reminder for Ana" });
    expect(within(preview).getByText("Message for Ana · Portuguese")).toBeVisible();
    const message = within(preview).getByText(/Olá Ana! 😊/);
    expect(message).toHaveTextContent("Data:");
    expect(message).toHaveTextContent("Reinicie o termostato.");
    const whatsappLink = within(preview).getByRole("link", { name: "Open in WhatsApp" });
    expect(new URL(whatsappLink.href).searchParams.get("text")).toBe(message.textContent);
    fireEvent.click(within(preview).getByRole("button", { name: "Copy reminder" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toBe(message.textContent);
    expect(screen.getByRole("button", { name: "Message copied" })).toBeVisible();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it.each([
    ["en", "pt", "Olá, Ana!", "Message for Ana · Portuguese", "Copy offer message"],
    ["pt", "en", "Hi Ana,", "Mensagem para Ana · Inglês", "Copiar mensagem da oferta"],
    ["en", "es", "Hola, Ana:", "Message for Ana · Spanish", "Copy offer message"],
  ])("uses %s manager UI with %s Cleaner preference for the Offer message", async (
    managerLanguage,
    cleanerLanguage,
    expectedGreeting,
    expectedContext,
    managerCopyLabel,
  ) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.localStorage.setItem("cleanflow-language", managerLanguage);
    const onCreatePublicOfferLink = vi.fn().mockResolvedValue({
      url: "https://cleanflow.example/offer/target-language",
      offeredCompensation: 125,
    });

    renderJobDetail("OFFERED", {
      schemaVersion: 1,
      scheduledDate: "2026-09-08",
      cleanerPayout: 125,
      offers: [{ id: "offer-a", cleanerId: "cleaner-a", cleanerName: "Ana", status: "PENDING" }],
    }, { onCreatePublicOfferLink }, {
      knownCleaners: [{ id: "cleaner-a", name: "Ana", phone: "+19495551234", preferredLanguage: cleanerLanguage }],
    });

    fireEvent.click(screen.getByRole("button", {
      name: managerLanguage === "pt" ? "Criar link público" : "Create public link",
    }));
    fireEvent.click(screen.getByRole("button", {
      name: managerLanguage === "pt" ? "Criar link público" : "Create public link",
    }));
    await waitFor(() => expect(onCreatePublicOfferLink).toHaveBeenCalledOnce());

    expect(screen.getByText(expectedContext)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: managerCopyLabel }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain(expectedGreeting);
    expect(writeText.mock.calls[0][0]).toMatch(/125/);
    const whatsappLink = screen.getByRole("link", {
      name: managerLanguage === "pt" ? "Abrir no WhatsApp" : "Open in WhatsApp",
    });
    expect(new URL(whatsappLink.href).searchParams.get("text")).toBe(writeText.mock.calls[0][0]);
    expect(screen.getByRole("button", {
      name: managerLanguage === "pt" ? "Mensagem da oferta copiada" : "Offer message copied",
    })).toBeVisible();

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

    fireEvent.click(screen.getByRole("button", { name: "Prepare message" }));

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

  it("labels Draft, review-ready, and abandoned Runs accurately and exposes a creation error", () => {
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
    expect(screen.getByText("Checklist in progress — waiting for the cleaner to send it for review.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View checklist progress" }));
    expect(onOpenChecklistRun).toHaveBeenCalledTimes(1);

    rerender(
      <TranslationProvider><JobDetail
        job={{ id: "job-1", propertyName: "Pacific Beach Condo", operationalStatus: "ASSIGNED" }}
        knownCleaners={[]} offers={[]} assignments={[]} issues={[]}
        checklistRun={{ ...existingRun, status: "READY_FOR_REVIEW" }}
        onOpenChecklistRun={onOpenChecklistRun}
      /></TranslationProvider>,
    );
    expect(screen.getByText("Checklist ready for manager review.")).toBeVisible();
    expect(screen.getByText("The checklist is ready for manager review. Open it to approve and complete this service.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Open checklist" })).toBeVisible();

    rerender(
      <TranslationProvider><JobDetail
        job={{ id: "job-1", propertyName: "Pacific Beach Condo", operationalStatus: "COMPLETED" }}
        knownCleaners={[]} offers={[]} assignments={[]} issues={[]}
        checklistRun={{ ...existingRun, status: "ABANDONED" }}
        onOpenChecklistRun={onOpenChecklistRun}
      /></TranslationProvider>,
    );
    expect(screen.getByText("This checklist draft was abandoned when the service was completed.")).toBeVisible();
    expect(screen.getByRole("button", { name: "View abandoned checklist" })).toBeVisible();

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
    const capability = { state: "NONE" };
    const onIssueChecklistCapability = vi.fn().mockImplementation(async (cleanerId) => {
      Object.assign(capability, { state: "ACTIVE", cleanerId, issuedAt: "2026-09-29T12:00:00Z" });
      return { url: "https://cleanflow.example/checklist?t=token", capability: { ...capability } };
    });
    const onRevokeChecklistCapability = vi.fn();
    renderJobDetail("ASSIGNED", {
      schemaVersion: 2,
      assignedCleanerIds: ["cleaner-a"],
      offers: [{ id: "offer-a", cleanerId: "cleaner-a", status: "INTERESTED" }],
    }, { onIssueChecklistCapability, onRevokeChecklistCapability }, {
      run: { id: "initial", status: "DRAFT", checklistItemCount: 28, inventoryItemCount: 13 },
      capability,
    });

    fireEvent.click(screen.getByRole("button", { name: "Create cleaner link" }));
    await waitFor(() => expect(onIssueChecklistCapability).toHaveBeenCalledWith("cleaner-a"));
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://cleanflow.example/checklist?t=token");
    expect(screen.getByRole("button", { name: "Revoke link" })).toBeVisible();
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

  it("uses assignment intent without a duplicate top CTA and preserves the Offers controls", () => {
    const onOfferToCleaners = vi.fn();
    renderJobDetail(
      "UNASSIGNED",
      { schemaVersion: 2, assignedCleanerIds: [] },
      { onOfferToCleaners },
    );

    expect(screen.getByRole("button", { name: "Choose intention: Assign / change cleaner" })).toBeVisible();
    expect(document.querySelector(".job-detail__quick-action")).not.toBeInTheDocument();
    const offersSection = screen.getByRole("region", { name: "Offers" });
    const offerButton = within(offersSection).getByRole("button", { name: "Offer cleaning to cleaners" });
    expect(offerButton).toHaveClass("button--primary");
    expect(screen.getAllByRole("button", { name: "Offer cleaning to cleaners" })).toHaveLength(1);
    fireEvent.click(offerButton);

    expect(onOfferToCleaners).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Refresh offers" })).toBeVisible();
  });

  it("retains the offer CTA for a legacy unassigned Job", () => {
    renderJobDetail("UNASSIGNED");

    expect(
      screen.getByRole("button", { name: "Offer cleaning to cleaners" }),
    ).toBeVisible();
  });

  it.each([
    { reason: "offers are loading", status: "UNASSIGNED", overrides: { isLoadingOffers: true } },
    { reason: "offers failed to load", status: "UNASSIGNED", overrides: { hasOffersError: true } },
    { reason: "an Offer exists", status: "UNASSIGNED", overrides: { offers: [{ id: "offer-a", cleanerId: "cleaner-a", status: "PENDING" }] } },
    { reason: "the Job is archived", status: "UNASSIGNED", overrides: { archivedAt: { seconds: 1 } } },
    { reason: "the Job is already offered", status: "OFFERED", overrides: {} },
  ])("hides the top Offer shortcut when $reason", ({ status, overrides }) => {
    renderJobDetail(status, overrides);
    expect(document.querySelector(".job-detail__quick-action")).not.toBeInTheDocument();
  });

  it("announces created Offers and focuses their section once after loading", () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    const props = {
      job: { id: "job-1", propertyName: "Pacific Beach Condo", operationalStatus: "OFFERED" },
      knownCleaners: [],
      offers: [{ id: "offer-a", cleanerId: "cleaner-a", cleanerName: "Ana", status: "PENDING" }],
      offersCreatedCount: 1,
      hasOffersError: false,
      assignments: [],
      issues: [],
      checklistCapability: { state: "NONE" },
      onOfferToCleaners: vi.fn(),
      onRefreshOffers: vi.fn(),
    };
    const detail = (isLoadingOffers) => (
      <TranslationProvider>
        <JobDetail {...props} isLoadingOffers={isLoadingOffers} />
      </TranslationProvider>
    );

    try {
      const { rerender } = render(detail(true));
      expect(scrollIntoView).not.toHaveBeenCalled();

      rerender(detail(false));
      const offersSection = screen.getByRole("region", { name: "Offers" });
      expect(within(offersSection).getByRole("status")).toHaveTextContent("1");
      expect(offersSection).toHaveFocus();
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "start",
        behavior: "auto",
      });

      rerender(detail(false));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
      } else {
        delete HTMLElement.prototype.scrollIntoView;
      }
    }
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
        propertyId: "property-1",
        scheduledDate: "2026-09-25",
        scheduledStart: "10:30",
        clientPrice: 400,
        cleanerPayout: 160,
        notes: "Private manager note",
        offers: [
          { id: "pending-offer", cleanerId: "cleaner-pending", cleanerName: "Ana", status: "PENDING" },
          { id: "interested-offer", cleanerId: "cleaner-interested", cleanerName: "Beatriz", status: "INTERESTED" },
          { id: "declined-offer", cleanerId: "cleaner-declined", cleanerName: "Carla", status: "DECLINED" },
        ],
      },
      { onCreatePublicOfferLink },
      { knownCleaners: [{ id: "cleaner-pending", name: "Ana", phone: "+1 (949) 555-1234" }] },
      {
        id: "property-1",
        address: "Private property address",
        accessInstructions: "Private entry information",
        keyCodeInfo: "Private key code",
      },
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
    const whatsappLink = within(pendingOffer).getByRole("link", { name: "Open in WhatsApp" });
    expect(whatsappLink).toHaveAttribute("target", "_blank");
    expect(whatsappLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(new URL(whatsappLink.href).pathname).toBe("/19495551234");
    fireEvent.click(screen.getByRole("button", { name: "Copy offer message" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiedMessage = writeText.mock.calls[0][0];
    expect(copiedMessage).toContain("Offered compensation: $125.00");
    expect(copiedMessage).toContain("https://cleanflow.example/offer/test-token");
    expect(new URL(whatsappLink.href).searchParams.get("text")).toBe(copiedMessage);
    expect(copiedMessage).not.toContain("$400.00");
    expect(copiedMessage).not.toContain("$160.00");
    expect(copiedMessage).not.toContain("$240.00");
    expect(copiedMessage).not.toContain("Beatriz");
    expect(copiedMessage).not.toContain("Private manager note");
    expect(copiedMessage).not.toContain("Private property address");
    expect(copiedMessage).not.toContain("Private entry information");
    expect(copiedMessage).not.toContain("Private key code");
    expect(screen.getByRole("button", { name: "Offer message copied" })).toBeVisible();
    expect(onCreatePublicOfferLink).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Create public link" }));
    expect(screen.getByLabelText("Offered compensation (USD)")).toHaveValue(125);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("keeps Copy available and explains when a cleaner phone cannot make a safe WhatsApp target", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const onCreatePublicOfferLink = vi.fn().mockResolvedValue({
      url: "https://cleanflow.example/offer/synthetic-no-phone",
      offeredCompensation: 125,
    });
    renderJobDetail("OFFERED", {
      offers: [{ id: "pending", cleanerId: "cleaner-a", cleanerName: "Ana", status: "PENDING" }],
    }, { onCreatePublicOfferLink }, {
      knownCleaners: [{ id: "cleaner-a", name: "Ana", phone: "9495551234" }],
    });

    const offer = screen.getByText("Ana").closest("article");
    fireEvent.click(within(offer).getByRole("button", { name: "Create public link" }));
    fireEvent.click(within(offer).getByRole("button", { name: "Create public link" }));
    await waitFor(() => expect(onCreatePublicOfferLink).toHaveBeenCalledOnce());

    expect(within(offer).queryByRole("link", { name: "Open in WhatsApp" })).not.toBeInTheDocument();
    expect(within(offer).getByText("Add a valid international WhatsApp phone number for this Cleaner.")).toBeVisible();
    fireEvent.click(within(offer).getByRole("button", { name: "Copy offer message" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain("https://cleanflow.example/offer/synthetic-no-phone");
    expect(onCreatePublicOfferLink).toHaveBeenCalledOnce();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("uses a v2 Job payout as an editable proposal and copies only the confirmed Offer amount", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const onCreatePublicOfferLink = vi.fn().mockResolvedValue({
      url: "https://cleanflow.example/offer/synthetic-v2",
      offeredCompensation: 125,
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
      { knownCleaners: [{ id: "cleaner-v2", name: "Ana", phone: "+19495551234" }] },
    );

    const pendingOffer = screen.getByText("Ana").closest("article");
    fireEvent.click(within(pendingOffer).getByRole("button", { name: "Create public link" }));
    expect(screen.getByLabelText("Offered compensation (USD)")).toHaveValue(600);
    expect(onCreatePublicOfferLink).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Offered compensation (USD)"), {
      target: { value: "125" },
    });
    fireEvent.click(within(pendingOffer).getByRole("button", { name: "Create public link" }));

    await waitFor(() => {
      expect(onCreatePublicOfferLink).toHaveBeenCalledWith(
        expect.objectContaining({ id: "pending-v2" }),
        125,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy offer message" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("Offered compensation: $125.00");
    expect(writeText.mock.calls[0][0]).not.toContain("$600.00");
    expect(writeText.mock.calls[0][0]).not.toContain("$900.00");
    const v2WhatsAppLink = screen.getByRole("link", { name: "Open in WhatsApp" });
    expect(new URL(v2WhatsAppLink.href).searchParams.get("text")).toBe(writeText.mock.calls[0][0]);
    expect(screen.queryByText("Amount not set. The cleaner will see ‘Amount not set / To be agreed.’")).not.toBeInTheDocument();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("does not replace an explicitly unset v2 Offer snapshot with the Job payout", () => {
    const onCreatePublicOfferLink = vi.fn();
    renderJobDetail("OFFERED", {
      schemaVersion: 2,
      cleanerPayout: 600,
      offers: [{
        id: "pending-v2",
        cleanerId: "cleaner-v2",
        cleanerName: "Ana",
        status: "PENDING",
        offeredCompensation: null,
      }],
    }, { onCreatePublicOfferLink });

    const pendingOffer = screen.getByText("Ana").closest("article");
    fireEvent.click(within(pendingOffer).getByRole("button", { name: "Create public link" }));

    expect(screen.getByLabelText("Offered compensation (USD)")).toHaveValue(null);
    expect(screen.getByRole("status")).toHaveTextContent("Amount not set");
    expect(onCreatePublicOfferLink).not.toHaveBeenCalled();
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

    fireEvent.click(screen.getByRole("button", { name: "Offer to more cleaners" }));
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
      screen.queryByRole("button", { name: "Offer to more cleaners" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh offers" })).toBeVisible();
  });

  it("keeps Start cleaning and offers no-checklist completion for an assigned Job", () => {
    renderJobDetail("ASSIGNED");

    expect(screen.getByRole("button", { name: /start cleaning/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Complete service" })).toBeVisible();
  });

  it("confirms no-checklist completion for an in-progress Job", async () => {
    const onCompleteCleaning = vi.fn().mockResolvedValue({ operationalStatus: "COMPLETED" });
    renderJobDetail("IN_PROGRESS", {}, { onCompleteCleaning });

    fireEvent.click(screen.getByRole("button", { name: "Complete service" }));
    expect(screen.getByText("This service has no checklist. Mark it completed?")).toBeVisible();
    expect(onCompleteCleaning).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Complete service" }));
    await waitFor(() => expect(onCompleteCleaning).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /start cleaning/i })).not.toBeInTheDocument();
  });

  it("never offers bypass completion while a Checklist Run exists or its status is unknown", () => {
    const { unmount } = renderJobDetail("ASSIGNED", { schemaVersion: 2, assignedCleanerIds: ["cleaner-a"] }, {}, {
      run: { id: "initial", status: "DRAFT" },
    });
    expect(screen.queryByRole("button", { name: "Complete service" })).not.toBeInTheDocument();
    expect(screen.getByText(/this service has a checklist in progress/i)).toBeVisible();
    unmount();
    renderJobDetail("ASSIGNED", { schemaVersion: 2, assignedCleanerIds: ["cleaner-a"] }, {}, {
      hasLoadError: true,
    });
    expect(screen.queryByRole("button", { name: "Complete service" })).not.toBeInTheDocument();
  });

  it("assigns a searched active Cleaner directly without selecting an Offer", async () => {
    const onAssignCleanerDirectly = vi.fn().mockResolvedValue({ operationalStatus: "ASSIGNED" });
    renderJobDetail("UNASSIGNED", { schemaVersion: 2, assignedCleanerIds: [] },
      { onAssignCleanerDirectly }, {
        availableCleaners: [
          { id: "cleaner-a", name: "Ana", active: true },
          { id: "cleaner-b", name: "Beatriz", active: true },
          { id: "cleaner-c", name: "Clara", active: false },
        ],
      });
    fireEvent.click(screen.getByRole("button", { name: "Assign cleaner" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cleaners by name" }),
      { target: { value: "bea" } });
    expect(screen.getByRole("option", { name: "Beatriz" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Clara" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Assigned cleaner" }),
      { target: { value: "cleaner-b" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    await waitFor(() => expect(onAssignCleanerDirectly).toHaveBeenCalledWith("cleaner-b"));
  });

  it("marks a manager-direct Assignment truthfully without claiming link acknowledgment", () => {
    renderJobDetail("ASSIGNED", { schemaVersion: 2, assignedCleanerIds: ["cleaner-a"] }, {}, {
      assignments: [{ id: "assignment-a", cleanerId: "cleaner-a", cleanerNameSnapshot: "Ana",
        source: "MANAGER_DIRECT", isActive: true, executionStatus: "ASSIGNED" }],
    });
    expect(screen.getByTestId("assignment-acknowledgment-assignment-a"))
      .toHaveTextContent("Assigned directly");
    expect(screen.queryByText(/link response does not verify/i)).not.toBeInTheDocument();
  });

  it("adds a selected Cleaner's checklist link only after explicit preparation and uses the same message for Copy and WhatsApp", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const capability = { state: "NONE" };
    const url = "https://cleanflow.example/checklist?t=synthetic-token";
    const onPrepareChecklistReminder = vi.fn().mockImplementation(async (cleanerId) => {
      Object.assign(capability, { state: "ACTIVE", cleanerId, issuedAt: "2026-09-29T12:00:00Z" });
      return { url, capability: { ...capability } };
    });
    renderJobDetail("ASSIGNED", {
      schemaVersion: 2, propertyId: "property-a", assignedCleanerIds: ["cleaner-a"],
      scheduledDate: "2026-09-29",
    }, { onPrepareChecklistReminder }, {
      knownCleaners: [{ id: "cleaner-a", name: "Ana", phone: "+14155550123", preferredLanguage: "pt" }],
      assignments: [{ id: "assignment-a", cleanerId: "cleaner-a", cleanerNameSnapshot: "Ana",
        source: "MANAGER_DIRECT", isActive: true, executionStatus: "ASSIGNED" }],
      capability,
      run: { id: "initial", status: "DRAFT" },
    }, { id: "property-a", keyCodeInfo: "private-code" });

    fireEvent.click(screen.getByRole("button", { name: "Prepare message" }));
    expect(onPrepareChecklistReminder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Include checklist link" }));
    expect(screen.getByRole("button", { name: "Copy reminder" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Open in WhatsApp" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prepare checklist link" }));
    await waitFor(() => expect(onPrepareChecklistReminder).toHaveBeenCalledWith("cleaner-a"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy reminder" })).toBeEnabled());
    const whatsappLink = screen.getByRole("link", { name: "Open in WhatsApp" });
    const message = screen.getByText(/Checklist da limpeza:/).textContent;
    expect(message).toContain(url);
    expect(message).not.toContain("private-code");
    expect(decodeURIComponent(whatsappLink.getAttribute("href"))).toContain(message);
    fireEvent.click(screen.getByRole("button", { name: "Copy reminder" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(message));
  });

  it("keeps handoff disabled after checklist preparation fails", async () => {
    const onPrepareChecklistReminder = vi.fn().mockRejectedValue(new Error("unavailable"));
    renderJobDetail("ASSIGNED", { schemaVersion: 2, assignedCleanerIds: ["cleaner-a"] },
      { onPrepareChecklistReminder }, {
        knownCleaners: [{ id: "cleaner-a", name: "Ana" }],
        assignments: [{ id: "assignment-a", cleanerId: "cleaner-a", isActive: true }],
      });
    fireEvent.click(screen.getByRole("button", { name: "Prepare message" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include checklist link" }));
    fireEvent.click(screen.getByRole("button", { name: "Prepare checklist link" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nothing was sent"));
    expect(screen.getByRole("button", { name: "Copy reminder" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Open in WhatsApp" })).not.toBeInTheDocument();
  });

  it("does not enable a reminder link without a confirmed capability issuance identity", async () => {
    const capability = { state: "NONE" };
    const onPrepareChecklistReminder = vi.fn().mockImplementation(async (cleanerId) => {
      Object.assign(capability, { state: "ACTIVE", cleanerId });
      return { url: "https://cleanflow.example/checklist?t=synthetic-token", capability: { ...capability } };
    });
    renderJobDetail("ASSIGNED", { schemaVersion: 2, assignedCleanerIds: ["cleaner-a"] },
      { onPrepareChecklistReminder }, {
        knownCleaners: [{ id: "cleaner-a", name: "Ana" }],
        assignments: [{ id: "assignment-a", cleanerId: "cleaner-a", isActive: true }],
        capability,
        run: { id: "initial", status: "DRAFT" },
      });
    fireEvent.click(screen.getByRole("button", { name: "Prepare message" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include checklist link" }));
    fireEvent.click(screen.getByRole("button", { name: "Prepare checklist link" }));
    await waitFor(() => expect(onPrepareChecklistReminder).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Copy reminder" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Open in WhatsApp" })).not.toBeInTheDocument();
  });

  it("does not silently replace another assigned Cleaner's active checklist link", () => {
    const onPrepareChecklistReminder = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderJobDetail("ASSIGNED", { schemaVersion: 2, assignedCleanerIds: ["cleaner-a", "cleaner-b"] },
      { onPrepareChecklistReminder }, {
        knownCleaners: [{ id: "cleaner-a", name: "Ana" }, { id: "cleaner-b", name: "Beatriz" }],
        assignments: [
          { id: "assignment-a", cleanerId: "cleaner-a", isActive: true },
          { id: "assignment-b", cleanerId: "cleaner-b", isActive: true },
        ],
        capability: { state: "ACTIVE", cleanerId: "cleaner-a", issuedAt: "2026-09-29T12:00:00Z" },
      });
    fireEvent.click(within(screen.getByText("Beatriz").closest("article"))
      .getByRole("button", { name: "Prepare message" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include checklist link" }));
    fireEvent.click(screen.getByRole("button", { name: "Prepare checklist link" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onPrepareChecklistReminder).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy reminder" })).toBeDisabled();
    confirm.mockRestore();
  });

  it("shows no lifecycle mutation actions for a completed Job and handles optional data", () => {
    renderJobDetail("COMPLETED");

    expect(screen.queryByRole("button", { name: /start cleaning/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete service" })).not.toBeInTheDocument();
    expect(screen.getByText("No offers created yet.")).toBeVisible();
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
          assignments={[{ id: "assignment-a", cleanerId: "cleaner-a", cleanerNameSnapshot: "Ana", sourceOfferId: "offer-a", isActive: true, executionStatus: "ASSIGNED" }]}
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
    expect(screen.queryByText("Cleaners needed")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit cleaners needed" })).not.toBeInTheDocument();
    expect(screen.queryByText("Team is currently full.")).not.toBeInTheDocument();
    expect(screen.getByTestId("assignment-acknowledgment-assignment-a")).toHaveTextContent("Awaiting confirmation");
    expect(screen.getByText("A link response does not verify who is holding or using the link.")).toBeVisible();
    expect(screen.queryByText("Assigned cleaner")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Assign" })[0]);
    expect(onAssignCleaner).toHaveBeenCalledWith(expect.objectContaining({ id: "offer-b" }));
  });

  it("shows a cleaner acknowledgment as confirmed only on its matching Assignment", () => {
    renderJobDetail("ASSIGNED", {
      schemaVersion: 2,
      assignedCleanerIds: ["cleaner-a"],
      offers: [{ id: "offer-a", cleanerId: "cleaner-a", status: "INTERESTED" }],
    }, {}, {
      assignments: [{
        id: "assignment-a",
        cleanerId: "cleaner-a",
        cleanerNameSnapshot: "Ana",
        sourceOfferId: "offer-a",
        cleanerAcknowledgedOfferId: "offer-a",
        cleanerAcknowledgedAt: { seconds: 10 },
        isActive: true,
        executionStatus: "ASSIGNED",
      }],
    });

    expect(screen.getByTestId("assignment-acknowledgment-assignment-a")).toHaveTextContent("Confirmed through link");
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

    fireEvent.click(within(screen.getByText("Ana").closest("article")).getByRole("button", { name: "Prepare message" }));
    expect(writeText).not.toHaveBeenCalled();
    const reminderPreview = screen.getByRole("region", { name: "Review reminder for Ana" });
    expect(reminderPreview).toBeVisible();
    expect(within(reminderPreview).queryByRole("link", { name: "Open in WhatsApp" })).not.toBeInTheDocument();
    expect(within(reminderPreview).getByText("Add a valid international WhatsApp phone number for this Cleaner.")).toBeVisible();
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

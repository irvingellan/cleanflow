import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ChecklistRunDetail } from "./ChecklistRunDetail.jsx";

const { getClientReportCapability, createClientReport } = vi.hoisted(() => ({
  getClientReportCapability: vi.fn(),
  createClientReport: vi.fn(),
}));
vi.mock("./clientReportService.js", () => ({
  getClientReportCapability,
  createClientReport,
  revokeClientReport: vi.fn(),
  updateClientReport: vi.fn(),
}));

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => getClientReportCapability.mockResolvedValue({ state: "NONE" }));

function renderChecklistRun(runOverrides = {}) {
  return render(
    <TranslationProvider>
      <ChecklistRunDetail
        job={{ id: "job-1", propertyName: "Job Property", scheduledDate: "2026-09-20" }}
        checklistRun={{
          id: "initial",
          status: "DRAFT",
          definitionVersion: 1,
          property: { id: "property-1", name: "Snapshot Property" },
          checklistItemCount: 28,
          inventoryItemCount: 13,
          requiredPhotoTypes: [{ id: "balcony", label: "Balcony", maximum: 2 }],
          requiredPhotoCount: 2,
          cleanerInstructions: "Check the balcony.",
          createdAt: "2026-09-20T17:00:00.000Z",
          // Deliberately unrendered server-only data must not appear in the manager summary.
          propertyChecklistSettingsSnapshot: { accessCode: "private-code" },
          ...runOverrides,
        }}
        onBack={vi.fn()}
      />
    </TranslationProvider>,
  );
}

describe("ChecklistRunDetail", () => {
  it("shows twenty photos as a grid, loads only what is near the screen and opens a swipeable viewer", async () => {
    const pending = [];
    const loadEvidence = vi.fn(() => new Promise((resolve) => pending.push(resolve)));
    let n = 0;
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => `blob:photo-${++n}`, revokeObjectURL: vi.fn() });
    const observed = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback) { this.callback = callback; }
      observe(element) { observed.push({ element, callback: this.callback }); }
      disconnect() {}
    });
    render(<TranslationProvider><ChecklistRunDetail job={{ id: "job-1" }} checklistRun={{ id: "initial", status: "DRAFT", evidence: Array.from({ length: 20 }, (_, i) => ({ evidenceId: `opaque-${i}`, requirementId: i ? "additional" : "living-belongings" })) }} loadEvidence={loadEvidence} /></TranslationProvider>);
    const tiles = screen.getAllByRole("button", { name: /^Open photo \d+:/ });
    expect(tiles).toHaveLength(20);
    expect(loadEvidence).not.toHaveBeenCalled();

    // The first five tiles come near the screen: at most three load at once.
    act(() => observed.slice(0, 5).forEach(({ element, callback }) => callback([{ isIntersecting: true, target: element }])));
    expect(loadEvidence).toHaveBeenCalledTimes(3);

    // Opening photo 11 puts it (and its neighbours) ahead of the queue.
    fireEvent.click(tiles[10]);
    expect(screen.getByRole("dialog", { name: "Photo 11 of 20" })).toBeVisible();
    await act(async () => { pending.splice(0).forEach((resolve) => resolve(new Blob(["x"], { type: "image/jpeg" }))); });
    expect(loadEvidence.mock.calls.slice(0, 3).every((call) => call[3]?.variant === "thumbnail")).toBe(true);
    expect(loadEvidence.mock.calls.slice(3, 6).map((call) => [call[2], call[3].variant])).toEqual([["opaque-9", "full"], ["opaque-11", "full"], ["opaque-10", "full"]]);
    await act(async () => { pending.splice(0).forEach((resolve) => resolve(new Blob(["x"], { type: "image/jpeg" }))); });
    expect(screen.getByAltText("Saved checklist photo")).toHaveAttribute("src", expect.stringMatching(/^blob:photo-/));

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("dialog", { name: "Photo 12 of 20" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByRole("dialog", { name: "Photo 13 of 20" })).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(new Set(loadEvidence.mock.calls.map((call) => call[2])).size).toBe(loadEvidence.mock.calls.length);
  });
  it("shows the cleaner from the existing Assignment snapshot, with a localized unassigned fallback", () => {
    const { rerender } = render(
      <TranslationProvider>
        <ChecklistRunDetail
          job={{ id: "job-1", propertyName: "Job Property", scheduledDate: "2026-09-20", schemaVersion: 2 }}
          assignments={[{ id: "assignment-1", isActive: true, cleanerNameSnapshot: "Ana" }]}
          checklistRun={{ id: "initial", status: "DRAFT", property: { name: "Snapshot Property" }, checklistItemCount: 28, inventoryItemCount: 13 }}
          onBack={vi.fn()}
        />
      </TranslationProvider>,
    );

    expect(screen.getByText("Assigned cleaner")).toBeVisible();
    expect(screen.getByText("Ana")).toBeVisible();

    rerender(
      <TranslationProvider>
        <ChecklistRunDetail
          job={{ id: "job-1", propertyName: "Job Property", scheduledDate: "2026-09-20" }}
          checklistRun={{ id: "initial", status: "DRAFT", property: { name: "Snapshot Property" }, checklistItemCount: 28, inventoryItemCount: 13 }}
          onBack={vi.fn()}
        />
      </TranslationProvider>,
    );

    expect(screen.getByText("Not assigned")).toBeVisible();
  });

  it("renders the persisted manager snapshot summary without server-only configuration", () => {
    renderChecklistRun();

    expect(screen.getByRole("heading", { name: "Checklist run" })).toBeVisible();
    expect(screen.getByText("Snapshot Property")).toBeVisible();
    expect(screen.getByText("28 items")).toBeVisible();
    expect(screen.getByText("13 items")).toBeVisible();
    expect(screen.getByText("2 types")).toBeVisible();
    expect(screen.getByText("Balcony · up to 2")).toBeVisible();
    expect(screen.getByText("Check the balcony.")).toBeVisible();
    expect(screen.getByText("Draft")).toBeVisible();
    expect(screen.queryByText("private-code")).not.toBeInTheDocument();
    expect(screen.queryByText("propertyChecklistSettingsSnapshot")).not.toBeInTheDocument();
  });

  it("shows only acknowledged cleaner draft progress and notes read-only", () => {
    renderChecklistRun({
      draft: {
        revision: 3,
        progress: {
          checklist: { done: 4, unanswered: 24 },
          inventory: { answered: 2, needsRestock: 1 },
        },
        issueNotes: "Replace a burned-out bulb.",
        generalNotes: "Everything else looks good.",
        lastSavedAt: "2026-09-20T18:00:00.000Z",
      },
    });

    expect(screen.getByRole("heading", { name: "Saved progress" })).toBeVisible();
    expect(screen.getByText("Checklist: 4 done, 24 unanswered")).toBeVisible();
    expect(screen.getByText("Inventory: 2 checked, 1 need restock")).toBeVisible();
    expect(screen.getByText("Replace a burned-out bulb.")).toBeVisible();
    expect(screen.getByText("Everything else looks good.")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("puts named restock, unanswered items, answer states, and cautious notes before the full answers", () => {
    const { container } = renderChecklistRun({
      sections: [{
        id: "bathroom",
        title: "Bathrooms",
        items: [
          { id: "done", label: "Sanitize sink", answer: "DONE" },
          { id: "na", label: "Check hot tub", answer: "NOT_APPLICABLE" },
          { id: "unanswered", label: "Check mirror", answer: "UNANSWERED" },
        ],
      }],
      inventoryItems: [
        { id: "soap", label: "Hand soap", answer: "NEEDS_RESTOCK" },
        { id: "tissue", label: "Tissues", answer: "UNANSWERED" },
      ],
      draft: { issueNotes: "  ", generalNotes: "" },
    });

    expect(screen.getByText("Checklist: 1 done · 1 not applicable · 1 unanswered")).toBeVisible();
    expect(screen.getAllByText("Hand soap").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Check mirror").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Tissues").length).toBeGreaterThan(1);
    expect(screen.getByText("No observations recorded. This does not prove there were no problems.")).toBeVisible();
    expect(container.querySelector("#checklist-attention-title").compareDocumentPosition(
      container.querySelector("#run-section-bathroom"),
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps draft actions unavailable and technical identifiers closed by default", () => {
    const { container } = renderChecklistRun({ jobId: "job-technical", draft: { revision: 5, lastSavedAt: "2026-09-20T18:00:00.000Z" } });

    expect(screen.getByText("This Checklist Run is a draft and has not been sent for manager review.")).toBeVisible();
    expect(screen.getByText("Report and approval actions become available here after the cleaner sends this checklist for review.")).toBeVisible();
    expect(screen.getByText("Last saved")).toBeVisible();
    const technicalDetails = container.querySelector(".checklist-run__technical-details");
    expect(technicalDetails.open).toBe(false);
    expect(technicalDetails).toHaveTextContent("job-technical");
    expect(technicalDetails).toHaveTextContent("5");
  });

  it("lets the manager explicitly refresh only the server-acknowledged progress", () => {
    const onRefresh = vi.fn();
    render(
      <TranslationProvider>
        <ChecklistRunDetail
          job={{ id: "job-1", propertyName: "Job Property", scheduledDate: "2026-09-20" }}
          checklistRun={{ id: "initial", status: "DRAFT", property: { name: "Snapshot Property" }, checklistItemCount: 28, inventoryItemCount: 13 }}
          isRefreshing={false}
          onRefresh={onRefresh}
          onBack={vi.fn()}
        />
      </TranslationProvider>,
    );

    screen.getByRole("button", { name: "Refresh saved progress" }).click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("lets the manager correct a cleaner's answer on a Run sent for review, and undo it", async () => {
    const correctAnswer = vi.fn().mockResolvedValue({ corrected: true });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const run = (soap) => ({ id: "initial", status: "READY_FOR_REVIEW", property: { id: "p", name: "P" }, sections: [],
      inventoryItems: [{ id: "hand-soap", label: "Hand soap", ...soap }, { id: "tea", label: "Tea", answer: "LOW" }] });
    const view = (soap, extra = {}) => <TranslationProvider>
      <ChecklistRunDetail job={{ id: "job-1", propertyName: "Job Property", scheduledDate: "2026-09-20" }} checklistRun={{ ...run(soap), ...extra }}
        onBack={vi.fn()} onRefresh={onRefresh} correctAnswer={correctAnswer} />
    </TranslationProvider>;
    const { rerender } = render(view({ answer: "NEEDS_RESTOCK" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Correct" })[0]);
    const group = screen.getByRole("group", { name: "Correct the answer for Hand soap" });
    expect(within(group).queryByRole("button", { name: "Needs restock" })).not.toBeInTheDocument();
    fireEvent.click(within(group).getByRole("button", { name: "High" }));
    await waitFor(() => expect(correctAnswer).toHaveBeenCalledWith("job-1", "inventory", "hand-soap", "HIGH"));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    rerender(view({ answer: "HIGH", correctedByManager: true, cleanerAnswer: "NEEDS_RESTOCK" }));
    expect(screen.getByText("Corrected by you. The cleaner answered: Needs restock")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Correct" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Undo correction" }));
    await waitFor(() => expect(correctAnswer).toHaveBeenLastCalledWith("job-1", "inventory", "hand-soap", null));

    // A checklist the cleaner is still filling offers no correction.
    rerender(view({ answer: "NEEDS_RESTOCK" }, { status: "DRAFT" }));
    expect(screen.queryByRole("button", { name: "Correct" })).not.toBeInTheDocument();
  });
  it("shows a cleaner-ready Run and its acknowledged draft without manager editing controls", () => {
    renderChecklistRun({
      status: "READY_FOR_REVIEW",
      readyForReviewAt: "2026-09-20T18:30:00.000Z",
      draft: {
        revision: 4,
        progress: {
          checklist: { done: 5, unanswered: 23 },
          inventory: { answered: 1, needsRestock: 1 },
        },
        issueNotes: "Manager should check the lamp.",
      },
    });

    expect(screen.getAllByText("Ready for manager review").length).toBeGreaterThan(0);
    expect(screen.getByText("The cleaner sent this saved checklist for manager review. This does not complete the job.")).toBeVisible();
    expect(screen.getByText("Manager should check the lamp.")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to report and approval actions" })).toHaveAttribute("href", "#checklist-manager-actions");
  });

  it("lets the manager confirm completion only after a Run is ready for review", async () => {
    const onApproveAndComplete = vi.fn().mockResolvedValue(undefined);
    render(
      <TranslationProvider>
        <ChecklistRunDetail
          job={{ id: "job-1", operationalStatus: "ASSIGNED" }}
          checklistRun={{ id: "initial", status: "READY_FOR_REVIEW", property: { name: "Snapshot Property" }, checklistItemCount: 28, inventoryItemCount: 13 }}
          onApproveAndComplete={onApproveAndComplete}
          onBack={vi.fn()}
        />
      </TranslationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve and complete service" }));
    expect(screen.getByText("This marks the service completed. It does not mark any payment as paid.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Approve and complete service" }));
    await waitFor(() => expect(onApproveAndComplete).toHaveBeenCalledTimes(1));
  });

  it("does not expose manager completion for a Draft Run", () => {
    renderChecklistRun();
    expect(screen.queryByRole("button", { name: "Approve and complete service" })).not.toBeInTheDocument();
  });

  it("requires explicit confirmation before abandoning a Draft and completing the Job", async () => {
    const onAbandonAndComplete = vi.fn().mockResolvedValue(undefined);
    render(<TranslationProvider><ChecklistRunDetail
      job={{ id: "job-1", operationalStatus: "IN_PROGRESS" }}
      checklistRun={{ id: "initial", status: "DRAFT", checklistItemCount: 28, inventoryItemCount: 13 }}
      onAbandonAndComplete={onAbandonAndComplete} onBack={vi.fn()}
    /></TranslationProvider>);

    expect(screen.getByText("This Checklist Run is a draft and has not been sent for manager review.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Abandon draft and complete service" }));
    expect(screen.getByText(/This checklist contains saved progress/)).toHaveTextContent(
      "Saved answers, evidence, and history remain available to the manager",
    );
    expect(onAbandonAndComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAbandonAndComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Abandon draft and complete service" }));
    fireEvent.click(screen.getByRole("button", { name: "Abandon draft and complete service" }));
    await waitFor(() => expect(onAbandonAndComplete).toHaveBeenCalledTimes(1));
  });

  it("shows a failed Draft abandonment and leaves the action available", async () => {
    const onAbandonAndComplete = vi.fn().mockRejectedValue(new Error("server rejected"));
    render(<TranslationProvider><ChecklistRunDetail
      job={{ id: "job-1", operationalStatus: "ASSIGNED" }}
      checklistRun={{ id: "initial", status: "DRAFT", checklistItemCount: 28, inventoryItemCount: 13 }}
      onAbandonAndComplete={onAbandonAndComplete} onBack={vi.fn()}
    /></TranslationProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Abandon draft and complete service" }));
    fireEvent.click(screen.getByRole("button", { name: "Abandon draft and complete service" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to complete with an abandoned draft.");
    expect(screen.getByRole("button", { name: "Abandon draft and complete service" })).toBeEnabled();
  });

  it("labels an abandoned Run accurately and offers neither approval nor report issuance", () => {
    renderChecklistRun({ status: "ABANDONED", abandonedAt: "2026-09-21T17:00:00.000Z" });
    expect(screen.getByText("Abandoned")).toBeVisible();
    expect(screen.getByText("Abandoned at")).toBeVisible();
    expect(screen.getByText(/It was not sent for review or approved/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve and complete service" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create client report" })).not.toBeInTheDocument();
  });

  it("keeps saved answers and evidence visible after abandonment", async () => {
    const loadEvidence = vi.fn().mockResolvedValue(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }));
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:abandoned-photo"), revokeObjectURL: vi.fn() });
    render(<TranslationProvider><ChecklistRunDetail
      job={{ id: "job-1", operationalStatus: "COMPLETED" }}
      checklistRun={{
        id: "initial", status: "ABANDONED", checklistItemCount: 1, inventoryItemCount: 0,
        sections: [{ id: "bathrooms", title: "Bathroom", items: [{ id: "sink", label: "Sink", answer: "DONE" }] }],
        evidence: [{ requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 3 }],
      }}
      loadEvidence={loadEvidence} onBack={vi.fn()}
    /></TranslationProvider>);

    expect(screen.getByText("Sink")).toBeVisible();
    expect(screen.getByText("Done")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^Open photo 1:/ }));
    expect(await screen.findByAltText("Saved checklist photo")).toHaveAttribute("src", "blob:abandoned-photo");
    expect(loadEvidence).toHaveBeenCalledWith("job-1", "living-belongings", undefined, { variant: "full" });
  });

  it("shows only a server-retrieved saved photo for the frozen requirement", async () => {
    const loadEvidence = vi.fn().mockResolvedValue(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }));
    const createObjectUrl = vi.fn(() => "blob:manager-photo");
    vi.stubGlobal("URL", { ...URL, createObjectURL: createObjectUrl, revokeObjectURL: vi.fn() });
    render(
      <TranslationProvider>
        <ChecklistRunDetail
          job={{ id: "job-1", propertyName: "Job Property", scheduledDate: "2026-09-20" }}
          checklistRun={{ id: "initial", status: "READY_FOR_REVIEW", property: { name: "Snapshot Property" }, checklistItemCount: 28, inventoryItemCount: 13, evidence: [{ requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 3 }] }}
          loadEvidence={loadEvidence}
          onBack={vi.fn()}
        />
      </TranslationProvider>,
    );

    expect(await screen.findByText("Saved evidence")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^Open photo 1:/ }));
    expect(loadEvidence).toHaveBeenCalledWith("job-1", "living-belongings", undefined, { variant: "full" });
    expect(await screen.findByAltText("Saved checklist photo")).toHaveAttribute("src", "blob:manager-photo");
  });

  it("shows saved answer details and allows a manager to create a client report when ready", async () => {
    getClientReportCapability.mockResolvedValue({ state: "NONE" });
    createClientReport.mockResolvedValue({
      created: true,
      capability: { state: "ACTIVE" },
      url: "https://cleanflow.example/client-report?t=one-time-token",
    });
    renderChecklistRun({
      status: "READY_FOR_REVIEW",
      serviceDate: "2026-09-20",
      sections: [{
        id: "bathrooms",
        titleKey: "checklistPreview.bathrooms",
        items: [{ id: "bathroom-sanitize", labelKey: "checklistPreview.bathroomSanitize", answer: "DONE" }],
      }],
      inventoryItems: [{ id: "hand-soap", labelKey: "checklistPreview.handSoap", answer: "NEEDS_RESTOCK" }],
    });

    expect(await screen.findByText("Sanitize toilet, sink, and shower")).toBeVisible();
    expect(screen.getByText("Done")).toBeVisible();
    expect(screen.getAllByText("Hand soap").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Needs restock").length).toBeGreaterThan(1);
    fireEvent.click(await screen.findByRole("button", { name: "Create client report" }));
    await waitFor(() => expect(createClientReport).toHaveBeenCalledWith("job-1", expect.objectContaining({ replaceExisting: false })));
    expect(await screen.findByRole("link", { name: "Open report" })).toHaveAttribute(
      "href", "https://cleanflow.example/client-report?t=one-time-token",
    );
  });
});

describe("section 8 — what keeps a draft from review", () => {
  const job = { id: "job-s8", operationalStatus: "ASSIGNED", propertyName: "Example House" };
  const run = (answers) => ({
    status: "DRAFT", checklistItemCount: 2, inventoryItemCount: 0, requiredPhotoCount: 0, inventoryItems: [], evidence: [],
    sections: [{ id: "s", title: "Rooms", items: [{ id: "a", label: "Beds made", answer: answers[0] }, { id: "b", label: "Trash out", answer: answers[1] }] }],
    draft: { revision: 2, progress: {} },
  });
  const renderRun = (checklistRun, onSubmitForReview) => render(<TranslationProvider>
    <ChecklistRunDetail job={job} checklistRun={checklistRun} onRefresh={() => {}} onBack={() => {}}
      onAbandonAndComplete={async () => {}} onSubmitForReview={onSubmitForReview} />
  </TranslationProvider>);

  it("names each missing item instead of offering only abandon", () => {
    renderRun(run(["DONE", "UNANSWERED"]), vi.fn());
    const block = screen.getByTestId("checklist-submit-for-review");
    expect(block).toHaveTextContent("It cannot be sent yet. Still missing (1):");
    expect(block).toHaveTextContent("Trash out");
    expect(within(block).queryByRole("button")).toBeNull();
  });

  it("sends a complete draft for review with the revision the manager saw", async () => {
    const onSubmitForReview = vi.fn(async () => {});
    renderRun(run(["DONE", "DONE"]), onSubmitForReview);
    fireEvent.click(screen.getByRole("button", { name: "Send for review on her behalf" }));
    await waitFor(() => expect(onSubmitForReview).toHaveBeenCalledWith(2));
  });
});

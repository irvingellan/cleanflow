import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(loadEvidence).toHaveBeenCalledWith("job-1", "living-belongings");
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
    expect(screen.getByText("Hand soap")).toBeVisible();
    expect(screen.getByText("Needs restock")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "Create client report" }));
    await waitFor(() => expect(createClientReport).toHaveBeenCalledWith("job-1", { replaceExisting: false }));
    expect(await screen.findByRole("link", { name: "Open report" })).toHaveAttribute(
      "href", "https://cleanflow.example/client-report?t=one-time-token",
    );
  });
});

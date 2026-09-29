import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { ChecklistCapabilityControls } from "./ChecklistCapabilityControls.jsx";

describe("ChecklistCapabilityControls", () => {
  it.each(["STALE", "REVOKED", "EXPIRED", "UNAVAILABLE"])("explains how to recover a %s cleaner link without automatic reissue", (state) => {
    render(<TranslationProvider><ChecklistCapabilityControls
      job={{ id: "job-a", schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a"] }}
      checklistRun={{ id: "initial", status: "DRAFT" }} capability={{ state }}
      onIssue={vi.fn()} onRevoke={vi.fn()} onRefresh={vi.fn()}
    /></TranslationProvider>);

    expect(screen.getByText(/Confirm the current assignment, create a new cleaner link, and resend it/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Create cleaner link" })).toBeVisible();
  });

  it("does not describe a never-issued link as stale", () => {
    render(<TranslationProvider><ChecklistCapabilityControls
      job={{ id: "job-a", schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a"] }}
      checklistRun={{ id: "initial", status: "DRAFT" }} capability={{ state: "NONE" }}
      onIssue={vi.fn()} onRevoke={vi.fn()} onRefresh={vi.fn()}
    /></TranslationProvider>);

    expect(screen.getByText("No cleaner link has been created.")).toBeVisible();
    expect(screen.queryByText(/Do not reuse the previous link/)).not.toBeInTheDocument();
  });

  it("hides a locally issued URL after another action rotates its capability", async () => {
    const issued = { state: "ACTIVE", cleanerId: "cleaner-a", issuedAt: "2026-09-29T12:00:00Z" };
    const onIssue = vi.fn().mockResolvedValue({
      url: "https://cleanflow.example/checklist?t=synthetic-token",
      capability: issued,
    });
    const common = {
      job: { id: "job-a", schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a"] },
      checklistRun: { id: "initial", status: "DRAFT" },
      onIssue,
      onRevoke: vi.fn(),
      onRefresh: vi.fn(),
    };
    const view = (capability) => (
      <TranslationProvider><ChecklistCapabilityControls {...common} capability={capability} /></TranslationProvider>
    );
    const { rerender } = render(view({ state: "NONE" }));
    fireEvent.click(screen.getByRole("button", { name: "Create cleaner link" }));
    await waitFor(() => expect(onIssue).toHaveBeenCalledWith("cleaner-a"));
    rerender(view(issued));
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();

    rerender(view({ ...issued, issuedAt: "2026-09-29T12:01:00Z" }));
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
  });

  it("does not show Cleaner A's link after the manager selects Cleaner B", async () => {
    const issued = { state: "ACTIVE", cleanerId: "cleaner-a", issuedAt: "2026-09-29T12:00:00Z" };
    const onIssue = vi.fn().mockResolvedValue({
      url: "https://cleanflow.example/checklist?t=synthetic-token",
      capability: issued,
    });
    const { rerender } = render(<TranslationProvider><ChecklistCapabilityControls
      job={{ id: "job-a", schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a", "cleaner-b"] }}
      checklistRun={{ id: "initial", status: "DRAFT" }} capability={{ state: "NONE" }}
      onIssue={onIssue} onRevoke={vi.fn()} onRefresh={vi.fn()}
    /></TranslationProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Create cleaner link" }));
    await waitFor(() => expect(onIssue).toHaveBeenCalledWith("cleaner-a"));
    rerender(<TranslationProvider><ChecklistCapabilityControls
      job={{ id: "job-a", schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a", "cleaner-b"] }}
      checklistRun={{ id: "initial", status: "DRAFT" }} capability={issued}
      onIssue={onIssue} onRevoke={vi.fn()} onRefresh={vi.fn()}
    /></TranslationProvider>);
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cleaner-b" } });
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
  });

  it("never carries Job A's bearer link into Job B even with the same cleaner and issuance time", async () => {
    const issued = { state: "ACTIVE", cleanerId: "cleaner-a", issuedAt: "2026-09-29T12:00:00Z" };
    const onIssue = vi.fn().mockResolvedValue({
      url: "https://cleanflow.example/checklist?t=synthetic-token",
      capability: issued,
    });
    const view = (jobId, capability) => <TranslationProvider><ChecklistCapabilityControls
      job={{ id: jobId, schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner-a"] }}
      checklistRun={{ id: "initial", status: "DRAFT" }} capability={capability}
      onIssue={onIssue} onRevoke={vi.fn()} onRefresh={vi.fn()}
    /></TranslationProvider>;
    const { rerender } = render(view("job-a", { state: "NONE" }));
    fireEvent.click(screen.getByRole("button", { name: "Create cleaner link" }));
    await waitFor(() => expect(onIssue).toHaveBeenCalledWith("cleaner-a"));
    rerender(view("job-a", issued));
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
    rerender(view("job-b", issued));
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
  });
});

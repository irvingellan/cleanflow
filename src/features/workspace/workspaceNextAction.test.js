import { describe, expect, it } from "vitest";
import { deriveWorkspaceNextAction } from "./workspaceNextAction.js";

const baseJob = {
  id: "synthetic-job",
  schemaVersion: 2,
  operationalStatus: "ASSIGNED",
  assignedCleanerIds: ["synthetic-cleaner"],
};
const loaded = {
  job: baseJob,
  assignments: [{ cleanerId: "synthetic-cleaner", isActive: true }],
  checklistRun: null,
  checklistCapability: { state: "NONE" },
  isLoadingChecklistRun: false,
  isLoadingChecklistCapability: false,
  isLoadingAssignments: false,
};

function ids(result) {
  return [result.primaryAction, ...result.secondaryActions].filter(Boolean).map((entry) => entry.id);
}

describe("workspace next-action presentation", () => {
  it("waits for selection without inventing actions", () => {
    expect(deriveWorkspaceNextAction()).toEqual({
      messageKey: "workspace.selectJob", primaryAction: null, secondaryActions: [], pending: false,
    });
  });

  it.each(["UNASSIGNED", "OFFERED"])("prioritizes existing direct Assignment entry for %s", (operationalStatus) => {
    const result = deriveWorkspaceNextAction({ ...loaded, job: { ...baseJob, operationalStatus } });
    expect(result.primaryAction).toEqual({ id: "assign", labelKey: "jobs.assignCleanerDirectly" });
    expect(ids(result)).toContain("offers");
  });

  it("never suggests direct Assignment until the roster read settles", () => {
    const job = { ...baseJob, operationalStatus: "UNASSIGNED" };
    const pending = deriveWorkspaceNextAction({ job });
    expect(ids(pending)).not.toContain("assign");
    expect(pending.pending).toBe(true);
    const failed = deriveWorkspaceNextAction({ ...loaded, job, hasAssignmentsError: true });
    expect(ids(failed)).not.toContain("assign");
    expect(failed.messageKey).toBe("workspace.nextActionReadError");
  });

  it("keeps legacy Offer entry instead of inventing direct legacy Assignment", () => {
    const result = deriveWorkspaceNextAction({ ...loaded, job: { operationalStatus: "UNASSIGNED" } });
    expect(result.primaryAction.id).toBe("offers");
    expect(ids(result)).not.toContain("assign");
  });

  it("does not assume future schemas support the current direct Assignment service", () => {
    const result = deriveWorkspaceNextAction({ ...loaded,
      job: { ...baseJob, schemaVersion: 3, operationalStatus: "UNASSIGNED" } });
    expect(ids(result)).not.toContain("assign");
    expect(result.primaryAction.id).toBe("offers");
  });

  it("prioritizes reminder for assigned Jobs and keeps optional checklist/completion entry points", () => {
    const result = deriveWorkspaceNextAction(loaded);
    expect(result.primaryAction.id).toBe("reminder");
    expect(ids(result)).toEqual(["reminder", "checklist", "completion", "offers", "history"]);
  });

  it.each(["isLoadingChecklistRun", "hasChecklistRunError"])("does not interpret %s as no Run", (flag) => {
    const result = deriveWorkspaceNextAction({ ...loaded, [flag]: true });
    expect(ids(result)).not.toContain("completion");
    expect(ids(result)).not.toContain("checklist");
    expect(result.primaryAction.id).toBe("reminder");
  });

  it.each(["isLoadingAssignments", "hasAssignmentsError"])("never uses retained Assignment data after %s", (flag) => {
    const result = deriveWorkspaceNextAction({ ...loaded, [flag]: true });
    expect(ids(result)).not.toContain("reminder");
    expect(result.primaryAction.id).toBe("checklist");
  });

  it("uses only an active Assignment belonging to the current Job roster for reminders", () => {
    for (const assignments of [
      [{ cleanerId: "synthetic-cleaner", isActive: false }],
      [{ cleanerId: "other-cleaner", isActive: true }],
    ]) {
      expect(ids(deriveWorkspaceNextAction({ ...loaded, assignments }))).not.toContain("reminder");
    }
  });

  it("preserves the existing legacy assigned-name reminder entry", () => {
    const result = deriveWorkspaceNextAction({ ...loaded, job: {
      operationalStatus: "ASSIGNED", assignedCleanerName: "Fixture Cleaner",
    } });
    expect(result.primaryAction.id).toBe("reminder");
  });

  it("opens saved DRAFT progress without pretending it has been submitted", () => {
    const result = deriveWorkspaceNextAction({ ...loaded, checklistRun: { status: "DRAFT" } });
    expect(result.messageKey).toBe("checklists.existingDraft");
    expect(result.primaryAction).toEqual({ id: "checklist", labelKey: "checklists.cleanerLink" });
    expect(ids(result)).not.toContain("review");
    expect(ids(result)).not.toContain("completion");
  });

  it.each(["STALE", "REVOKED", "EXPIRED", "UNAVAILABLE"])("explains explicit %s capability recovery", (state) => {
    const result = deriveWorkspaceNextAction({ ...loaded,
      checklistRun: { status: "DRAFT" }, checklistCapability: { state } });
    expect(result.messageKey).toBe("checklists.linkRecoveryGuidance");
    expect(result.primaryAction.id).toBe("checklist");
  });

  it.each(["isLoadingChecklistCapability", "hasChecklistCapabilityError"])("does not claim stale-link recovery before %s settles", (flag) => {
    const result = deriveWorkspaceNextAction({ ...loaded, checklistRun: { status: "DRAFT" },
      checklistCapability: { state: "STALE" }, [flag]: true });
    expect(result.messageKey).toBe("checklists.existingDraft");
    expect(result.primaryAction.id).toBe("checklist");
  });

  it("prioritizes server-confirmed review and never offers no-Run completion", () => {
    const result = deriveWorkspaceNextAction({ ...loaded, checklistRun: { status: "READY_FOR_REVIEW" } });
    expect(result.primaryAction.id).toBe("review");
    expect(ids(result)).not.toContain("completion");
  });

  it("keeps in-progress entry points but no reminder or roster operations", () => {
    const result = deriveWorkspaceNextAction({ ...loaded, job: { ...baseJob, operationalStatus: "IN_PROGRESS" } });
    expect(ids(result)).toEqual(["checklist", "completion", "history"]);
  });

  it.each(["COMPLETED", "ASSIGNED"])("exposes only historical navigation for archived %s", (operationalStatus) => {
    const result = deriveWorkspaceNextAction({ ...loaded,
      job: { ...baseJob, operationalStatus, archivedAt: "2026-09-01T00:00:00Z" },
      checklistRun: { status: "READY_FOR_REVIEW" } });
    expect(ids(result)).toEqual(["checklist", "history"]);
    expect(result.messageKey).toBe("workspace.nextActionArchived");
  });

  it("retains completed Run/report viewing without execution actions", () => {
    const result = deriveWorkspaceNextAction({ ...loaded,
      job: { ...baseJob, operationalStatus: "COMPLETED" }, checklistRun: { status: "READY_FOR_REVIEW" } });
    expect(ids(result)).toEqual(["checklist", "history"]);
    expect(result.messageKey).toBe("workspace.nextActionCompleted");
  });

  it.each(["ABANDONED", "UNKNOWN_STATE"])("does not fabricate completion eligibility for a %s Run", (status) => {
    const result = deriveWorkspaceNextAction({ ...loaded, checklistRun: { status } });
    expect(ids(result)).toEqual(["checklist", "history"]);
  });

  it("has no execution suggestion for unknown Job lifecycle states", () => {
    const result = deriveWorkspaceNextAction({ ...loaded, job: { ...baseJob, operationalStatus: "UNKNOWN_STATE" } });
    expect(ids(result)).toEqual(["history"]);
    const readyRun = deriveWorkspaceNextAction({ ...loaded,
      job: { ...baseJob, operationalStatus: "UNKNOWN_STATE" },
      checklistRun: { status: "READY_FOR_REVIEW" } });
    expect(ids(readyRun)).toEqual(["checklist", "history"]);
  });

  it("does not mutate or copy domain content into action presentation", () => {
    const input = structuredClone({ ...loaded, checklistRun: { status: "DRAFT", draft: { generalNotes: "Fixture note" } } });
    const before = structuredClone(input);
    const result = deriveWorkspaceNextAction(input);
    expect(input).toEqual(before);
    expect(JSON.stringify(result)).not.toContain("Fixture note");
    expect(JSON.stringify(result)).not.toContain("synthetic-job");
  });
});

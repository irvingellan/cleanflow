import { describe, expect, it } from "vitest";
import { serviceLifecyclePresentation } from "./serviceLifecyclePresentation.js";

const stages = ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"];
const draft = {
  status: "DRAFT",
  checklistItemCount: 18,
  draft: {
    progress: { checklist: { total: 18, done: 5, notApplicable: 2, unanswered: 11 } },
    lastSavedAt: "2026-10-03T14:36:00.000Z",
  },
};

describe("serviceLifecyclePresentation", () => {
  it.each(stages)("uses only authoritative Job operational state %s for the five-stage rail", (operationalStatus) => {
    const { lifecycle } = serviceLifecyclePresentation({ job: { operationalStatus }, checklistRun: draft });
    expect(lifecycle.stages.map((stage) => stage.status)).toEqual(stages);
    expect(lifecycle.stages.map((stage) => stage.state)).toEqual(stages.map((_, index) =>
      index < stages.indexOf(operationalStatus) ? "completed" : index === stages.indexOf(operationalStatus) ? "current" : "future"));
    expect(lifecycle.statusKey).toBe(`lifecycle.stage.${operationalStatus}`);
  });

  it.each([undefined, "", "READY_FOR_REVIEW", "CANCELLED", "COMPLETED "])("unknown Job state %s never fabricates a current stage", (operationalStatus) => {
    const { lifecycle } = serviceLifecyclePresentation({ job: { operationalStatus }, checklistRun: { status: "READY_FOR_REVIEW" } });
    expect(lifecycle.statusKey).toBe("lifecycle.unknown");
    expect(lifecycle.stages.every((stage) => stage.state === "future")).toBe(true);
  });

  it("keeps archive a parallel label rather than another lifecycle stage", () => {
    const { lifecycle } = serviceLifecyclePresentation({ job: { operationalStatus: "COMPLETED", archivedAt: "server-time" } });
    expect(lifecycle.archived).toBe(true);
    expect(lifecycle.stages).toHaveLength(5);
    expect(lifecycle.stages.at(-1)).toMatchObject({ status: "COMPLETED", state: "current" });
  });

  it.each(["DRAFT", "READY_FOR_REVIEW", "ABANDONED"])("does not turn checklist %s into a Job state or infer complete progress", (status) => {
    const { lifecycle, checklist } = serviceLifecyclePresentation({
      job: { operationalStatus: "IN_PROGRESS" }, checklistRun: { ...draft, status }, capability: { state: "ACTIVE" },
    });
    expect(lifecycle.statusKey).toBe("lifecycle.stage.IN_PROGRESS");
    expect(checklist.state).toBe(status);
    expect(checklist.progress).toEqual({ saved: 7, total: 18, percent: 39 });
    expect(checklist.lastSavedAt).toBe("2026-10-03T14:36:00.000Z");
  });

  it("distinguishes known absence from unloaded, failed or unsupported Run data", () => {
    expect(serviceLifecyclePresentation({ checklistRun: null }).checklist.state).toBe("NONE");
    expect(serviceLifecyclePresentation({}).checklist.state).toBe("UNKNOWN");
    expect(serviceLifecyclePresentation({ checklistRun: null, runLoading: true }).checklist.state).toBe("LOADING");
    expect(serviceLifecyclePresentation({ checklistRun: draft, runError: true }).checklist).toMatchObject({ state: "UNKNOWN", progress: null, lastSavedAt: null });
    expect(serviceLifecyclePresentation({ checklistRun: { ...draft, status: "COMPLETED" } }).checklist.progress).toBeNull();
  });

  it.each([
    null,
    { total: 18, done: 7, unanswered: 11 },
    { total: 18, done: "5", notApplicable: 2, unanswered: 11 },
    { total: 18, done: -1, notApplicable: 2, unanswered: 17 },
    { total: 18, done: 5.5, notApplicable: 2, unanswered: 10.5 },
    { total: 18, done: 5, notApplicable: 2, unanswered: 9 },
    { total: 18, done: 19, notApplicable: 0, unanswered: 0 },
    { total: Number.MAX_SAFE_INTEGER + 1, done: 0, notApplicable: 0, unanswered: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects missing/malformed saved-count evidence without treating it as zero: %j", (checklist) => {
    const run = { ...draft, draft: { progress: { checklist } } };
    expect(serviceLifecyclePresentation({ checklistRun: run }).checklist.progress).toBeNull();
  });

  it("rejects counts inconsistent with the frozen item count and preserves valid zero", () => {
    expect(serviceLifecyclePresentation({ checklistRun: { ...draft, checklistItemCount: 28 } }).checklist.progress).toBeNull();
    const zeroSaved = { ...draft, draft: { progress: { checklist: { total: 18, done: 0, notApplicable: 0, unanswered: 18 } } } };
    expect(serviceLifecyclePresentation({ checklistRun: zeroSaved }).checklist.progress).toEqual({ saved: 0, total: 18, percent: 0 });
    expect(serviceLifecyclePresentation({ checklistRun: zeroSaved }).checklist.lastSavedAt).toBeNull();
  });

  it("100% means saved checklist answers only, not submission/photo requirements", () => {
    const run = { ...draft, requiredPhotoCount: 1, evidence: null, draft: { progress: { checklist: { total: 18, done: 18, notApplicable: 0, unanswered: 0 } } } };
    const model = serviceLifecyclePresentation({ job: { operationalStatus: "ASSIGNED" }, checklistRun: run });
    expect(model.checklist.progress.percent).toBe(100);
    expect(model.checklist.state).toBe("DRAFT");
    expect(model.attention).toEqual([]);
    expect(model.lifecycle.statusKey).toBe("lifecycle.stage.ASSIGNED");
  });

  it.each(["NONE", "ACTIVE", "STALE", "REVOKED", "EXPIRED", "UNAVAILABLE"])("uses authoritative capability state %s without recalculating revision or expiry", (state) => {
    const model = serviceLifecyclePresentation({
      job: { operationalStatus: "COMPLETED", checklistContextRevision: 99 }, checklistRun: draft,
      capability: { state, contextRevision: 0, expiresAt: "2000-01-01T00:00:00.000Z" },
    });
    expect(model.checklist.capabilityState).toBe(state);
    expect(model.checklist.capabilityKey).toBe(`lifecycle.link.${state}`);
  });

  it("masks failed/loading capability states instead of showing an initial NONE or cached ACTIVE as proof", () => {
    expect(serviceLifecyclePresentation({ capability: { state: "NONE" }, capabilityLoading: true }).checklist.capabilityState).toBe("LOADING");
    expect(serviceLifecyclePresentation({ capability: { state: "ACTIVE" }, capabilityError: true }).checklist.capabilityState).toBe("UNKNOWN");
    expect(serviceLifecyclePresentation({}).checklist.capabilityState).toBe("UNKNOWN");
    expect(serviceLifecyclePresentation({ capability: { state: "EXTRA" } }).checklist.capabilityState).toBe("UNKNOWN");
  });

  it("does not call an initial NONE capability authoritative when Run data is failed, loading or unverified", () => {
    expect(serviceLifecyclePresentation({ checklistRun: null, runError: true, capability: { state: "NONE" } }).checklist.capabilityState).toBe("UNKNOWN");
    expect(serviceLifecyclePresentation({ checklistRun: null, runLoading: true, capability: { state: "NONE" } }).checklist.capabilityState).toBe("LOADING");
    expect(serviceLifecyclePresentation({ capability: { state: "NONE" } }).checklist.capabilityState).toBe("UNKNOWN");
    expect(serviceLifecyclePresentation({ checklistRun: null, capability: { state: "NONE" } }).checklist.capabilityState).toBe("NONE");
  });

  it("shows only stale-link, confirmed review, and known OPEN issues as parallel attention", () => {
    const { attention } = serviceLifecyclePresentation({
      checklistRun: { ...draft, status: "READY_FOR_REVIEW" }, capability: { state: "STALE" },
      issues: [{ status: "OPEN" }, { status: "RESOLVED" }, { status: "OPEN" }, { status: "UNKNOWN" }],
    });
    expect(attention).toEqual([
      { kind: "stale-link", key: "lifecycle.attention.staleLink" },
      { kind: "review", key: "lifecycle.attention.review" },
      { kind: "issues", key: "lifecycle.attention.openIssues", count: 2 },
    ]);
  });

  it.each([{ issuesLoading: true }, { issuesError: true }])("does not create issues attention from unavailable data %j", (flags) => {
    expect(serviceLifecyclePresentation({ issues: [{ status: "OPEN" }], ...flags }).attention).toEqual([]);
  });

  it.each([{ operationalStatus: "COMPLETED" }, { operationalStatus: "ASSIGNED", archivedAt: "2026-10-03" }])(
    "preserves saved READY history without claiming another review is pending for %j", (job) => {
      const model = serviceLifecyclePresentation({ job, checklistRun: { ...draft, status: "READY_FOR_REVIEW" } });
      expect(model.checklist.state).toBe("READY_FOR_REVIEW");
      expect(model.attention.some((item) => item.kind === "review")).toBe(false);
    },
  );

  it("does not promote expired/revoked/unknown links, schedule protection or price data to lifecycle blockers", () => {
    const model = serviceLifecyclePresentation({ job: { operationalStatus: "ASSIGNED", clientPrice: null }, checklistRun: draft, capability: { state: "EXPIRED" }, issues: [] });
    expect(model.attention).toEqual([]);
  });

  it("returns only safe presentation fields, does not copy IDs, tokens, notes, finance or raw records, and never mutates inputs", () => {
    const run = structuredClone(draft);
    const input = {
      job: { id: "private-job", operationalStatus: "ASSIGNED", clientPrice: 987, accessInstructions: "private-access" },
      checklistRun: run,
      capability: { state: "ACTIVE", token: "private-token", tokenHash: "private-hash", cleanerId: "private-cleaner" },
      issues: [{ status: "OPEN", description: "private-notes" }],
    };
    const before = structuredClone(input);
    const serialized = JSON.stringify(serviceLifecyclePresentation(input));
    expect(input).toEqual(before);
    for (const value of ["private-job", "987", "private-access", "private-token", "private-hash", "private-cleaner", "private-notes"]) expect(serialized).not.toContain(value);
  });
});

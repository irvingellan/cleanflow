import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChecklistRun: vi.fn(),
  createChecklistRun: vi.fn(),
  completeJobWithoutChecklist: vi.fn(),
  abandonChecklistRunAndCompleteJob: vi.fn(),
  getChecklistCapability: vi.fn(),
  issueChecklistCapability: vi.fn(),
  getJobById: vi.fn(),
  getCleaners: vi.fn(),
  getJobIssues: vi.fn(),
  resolveIssue: vi.fn(),
  getJobOffers: vi.fn(),
  getJobAssignments: vi.fn(),
  archiveJob: vi.fn(),
  restoreJob: vi.fn(),
  rescheduleJob: vi.fn(),
  createManagerPageVisitId: vi.fn(),
  createManagerOperationTracker: vi.fn(),
  trackers: [],
}));

vi.mock("../telemetry/managerOperationTelemetryService.js", () => ({
  createManagerPageVisitId: mocks.createManagerPageVisitId,
  createManagerOperationTracker: mocks.createManagerOperationTracker,
}));

vi.mock("../checklists/checklistRunService.js", () => ({
  getChecklistRun: mocks.getChecklistRun,
  createChecklistRun: mocks.createChecklistRun,
  completeJobWithoutChecklist: mocks.completeJobWithoutChecklist,
  abandonChecklistRunAndCompleteJob: mocks.abandonChecklistRunAndCompleteJob,
  approveChecklistRun: vi.fn(),
}));

vi.mock("../checklists/checklistCapabilityService.js", () => ({
  getChecklistCapability: mocks.getChecklistCapability,
  issueChecklistCapability: mocks.issueChecklistCapability,
  revokeChecklistCapability: vi.fn(),
}));

vi.mock("../cleaners/cleanerService.js", () => ({
  getCleaners: mocks.getCleaners,
}));

vi.mock("../issues/issueService.js", () => ({
  getJobIssues: mocks.getJobIssues,
  resolveIssue: mocks.resolveIssue,
}));

vi.mock("./jobOfferService.js", () => ({
  getJobOffers: mocks.getJobOffers,
  createPublicOfferLink: vi.fn(),
}));

vi.mock("./assignmentService.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getJobAssignments: mocks.getJobAssignments,
}));

vi.mock("./jobService.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getJobById: mocks.getJobById,
  archiveJob: mocks.archiveJob,
  restoreJob: mocks.restoreJob,
}));

vi.mock("./jobScheduleService.js", () => ({
  rescheduleJob: mocks.rescheduleJob,
}));

import { useJobDetailController } from "./useJobDetailController.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getChecklistRun.mockResolvedValue(null);
  mocks.getChecklistCapability.mockResolvedValue({ state: "NONE" });
  mocks.getCleaners.mockResolvedValue([]);
  mocks.getJobIssues.mockResolvedValue([]);
  mocks.getJobOffers.mockResolvedValue([]);
  mocks.getJobAssignments.mockResolvedValue([]);
  mocks.trackers.length = 0;
  mocks.createManagerPageVisitId.mockImplementation(
    () => `visit-${mocks.createManagerPageVisitId.mock.calls.length}`,
  );
  mocks.createManagerOperationTracker.mockImplementation((options) => {
    const tracker = { options, track: vi.fn((_operation, task) => task()) };
    mocks.trackers.push(tracker);
    return tracker;
  });
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useJobDetailController workspace composition and selection safety", () => {
  const jobA = { id: "job-a", schemaVersion: 2, operationalStatus: "ASSIGNED" };
  const jobB = { ...jobA, id: "job-b" };

  function openController(view = "job-detail") {
    const onJobUpdated = vi.fn();
    const hook = renderHook(() => useJobDetailController({
      view, onJobUpdated, actorUid: "manager-1",
    }));
    act(() => hook.result.current.openJob(jobA));
    return { ...hook, onJobUpdated };
  }

  it("uses an explicitly shared cleaner source without another cleaner read", async () => {
    const cleaners = [{ id: "cleaner-a", name: "Synthetic cleaner" }];
    const { result, rerender } = renderHook(({ cleanerSource }) => useJobDetailController({
      view: "job-detail", onJobUpdated: vi.fn(), actorUid: "manager-1", cleanerSource,
    }), { initialProps: { cleanerSource: { cleaners: [], isLoading: true, hasError: false } } });
    act(() => result.current.openJob(jobA));
    expect(result.current.offerFlow.isLoadingCleaners).toBe(true);
    rerender({ cleanerSource: { cleaners, isLoading: false, hasError: false } });
    expect(result.current.offerFlow.availableCleaners).toEqual(cleaners);
    expect(result.current.offerFlow.isLoadingCleaners).toBe(false);
    expect(mocks.getCleaners).not.toHaveBeenCalled();
    expect(mocks.trackers[0].track.mock.calls.map(([operation]) => operation))
      .not.toContain("cleaners");
  });

  it.each([
    ["offers", "getJobOffers", "isLoadingOffers"],
    ["issues", "getJobIssues", "isLoadingIssues"],
    ["assignments", "getJobAssignments", "isLoadingAssignments"],
  ])("keeps new Job %s pending while an old Job response settles", async (field, mockName, loadingField) => {
    const first = deferred();
    const second = deferred();
    mocks[mockName].mockImplementation((jobId) => jobId === jobA.id ? first.promise : second.promise);
    const { result } = openController();
    await waitFor(() => expect(mocks[mockName]).toHaveBeenCalledWith(jobA.id));
    act(() => result.current.openJob(jobB));
    await waitFor(() => expect(mocks[mockName]).toHaveBeenCalledWith(jobB.id));
    await act(async () => { first.resolve([{ id: "old-row" }]); });
    expect(result.current.detail[field]).toEqual([]);
    expect(result.current.detail[loadingField]).toBe(true);
    await act(async () => { second.resolve([{ id: "current-row" }]); });
    expect(result.current.detail[field]).toEqual([{ id: "current-row" }]);
    expect(result.current.detail[loadingField]).toBe(false);
  });

  it("rejects obsolete errors after switching A to B and back to A", async () => {
    const first = deferred();
    const reopened = deferred();
    mocks.getJobOffers.mockReturnValueOnce(first.promise).mockResolvedValueOnce([])
      .mockReturnValueOnce(reopened.promise);
    const { result } = openController();
    await waitFor(() => expect(mocks.getJobOffers).toHaveBeenCalledTimes(1));
    act(() => result.current.openJob(jobB));
    await waitFor(() => expect(mocks.getJobOffers).toHaveBeenCalledTimes(2));
    act(() => result.current.openJob(jobA));
    await waitFor(() => expect(mocks.getJobOffers).toHaveBeenCalledTimes(3));
    await act(async () => { first.reject(new Error("obsolete read failed")); });
    expect(result.current.detail.hasOffersError).toBe(false);
    expect(result.current.detail.isLoadingOffers).toBe(true);
    await act(async () => { reopened.resolve([{ id: "reopened-row" }]); });
    expect(result.current.detail.offers).toEqual([{ id: "reopened-row" }]);
  });

  it("keeps the latest refresh result when two reads target the same selection", async () => {
    const first = deferred();
    const latest = deferred();
    mocks.getJobOffers.mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise);
    const { result } = openController();
    await waitFor(() => expect(mocks.getJobOffers).toHaveBeenCalledTimes(1));
    act(() => { result.current.detail.refreshOffers(); });
    await waitFor(() => expect(mocks.getJobOffers).toHaveBeenCalledTimes(2));
    await act(async () => { latest.resolve([{ id: "latest" }]); });
    await act(async () => { first.resolve([{ id: "old" }]); });
    expect(result.current.detail.offers).toEqual([{ id: "latest" }]);
  });

  it.each([
    ["archive", "archiveJob", { archivedAt: true }],
    ["restore", "restoreJob", { archivedAt: null }],
    ["saveJobSchedule", "rescheduleJob", {
      scheduledDate: "2026-10-01", scheduledStart: "12:00", scheduleRevision: 1,
      checklistContextRevision: 1, changed: true,
    }],
  ])("does not reselect an old Job when %s confirms after switching Jobs", async (action, mockName, updates) => {
    const pending = deferred();
    mocks[mockName].mockReturnValue(pending.promise);
    const { result, onJobUpdated } = openController("checklist-run");
    let completion;
    act(() => { completion = result.current.actions[action]({ scheduledDate: "2026-10-01", scheduledStart: "12:00" }); });
    act(() => result.current.openJob(jobB));
    await act(async () => { pending.resolve(updates); await completion; });
    expect(result.current.job).toEqual(jobB);
    expect(onJobUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: jobA.id }));
    expect(mocks.getChecklistCapability).not.toHaveBeenCalled();
  });

  it("does not apply an old issue mutation to a new selection", async () => {
    const pending = deferred();
    mocks.getJobIssues.mockResolvedValue([{ id: "same-issue-id", status: "OPEN" }]);
    mocks.resolveIssue.mockReturnValue(pending.promise);
    const { result } = openController();
    await waitFor(() => expect(result.current.detail.issues).toHaveLength(1));
    let resolution;
    act(() => { resolution = result.current.actions.resolveJobIssue({ issueId: "same-issue-id", resolutionNote: "Synthetic resolution" }); });
    act(() => result.current.openJob(jobB));
    await waitFor(() => expect(result.current.detail.issues).toHaveLength(1));
    await act(async () => { pending.resolve({ id: "same-issue-id", status: "RESOLVED" }); await resolution; });
    expect(result.current.detail.issues[0].status).toBe("OPEN");
  });

  it("updates the worklist but does not select an old offer-creation result", () => {
    const { result, onJobUpdated } = openController("checklist-run");
    act(() => result.current.openJob(jobB));
    const offeredA = { ...jobA, operationalStatus: "OFFERED" };
    act(() => result.current.offerFlow.recordOffersCreated(1, offeredA));
    expect(result.current.job).toEqual(jobB);
    expect(result.current.offerFlow.offersCreatedCount).toBeNull();
    expect(onJobUpdated).toHaveBeenCalledWith(offeredA);
  });

  it("does not apply an earlier offer-creation callback after reopening the same Job", () => {
    const { result, onJobUpdated } = openController("checklist-run");
    const earlierCallback = result.current.offerFlow.recordOffersCreated;
    act(() => result.current.openJob(jobB));
    const reopenedA = { ...jobA, notes: "Current context" };
    act(() => result.current.openJob(reopenedA));
    const earlierResult = { ...jobA, operationalStatus: "OFFERED" };
    act(() => earlierCallback(1, earlierResult));
    expect(result.current.job).toEqual(reopenedA);
    expect(result.current.offerFlow.offersCreatedCount).toBeNull();
    expect(onJobUpdated).toHaveBeenCalledWith(earlierResult);
  });
});

describe("useJobDetailController checklist refresh", () => {
  it("does not let a stale manager refresh overwrite a different Job's checklist run", async () => {
    const first = deferred();
    const second = deferred();
    mocks.getChecklistRun.mockImplementation((jobId) => (jobId === "job-a" ? first.promise : second.promise));
    const { result } = renderHook(() => useJobDetailController({
      view: "checklist-run",
      onJobUpdated: vi.fn(),
      actorUid: "manager-1",
    }));
    const jobA = { id: "job-a", operationalStatus: "UNASSIGNED" };
    const jobB = { id: "job-b", operationalStatus: "UNASSIGNED" };

    act(() => result.current.openJob(jobA));
    act(() => { result.current.detail.refreshChecklistRun(jobA, { manual: true }); });
    await waitFor(() => expect(mocks.getChecklistRun).toHaveBeenCalledWith("job-a"));

    act(() => result.current.openJob(jobB));
    act(() => { result.current.detail.refreshChecklistRun(jobB, { manual: true }); });
    await waitFor(() => expect(mocks.getChecklistRun).toHaveBeenCalledWith("job-b"));

    await act(async () => { second.resolve({ id: "initial", property: { name: "Job B" }, draft: { revision: 3 } }); });
    await waitFor(() => expect(result.current.detail.checklistRun?.property?.name).toBe("Job B"));
    expect(result.current.detail.checklistRun?.draft?.revision).toBe(3);
    await act(async () => { first.resolve({ id: "initial", property: { name: "Job A" } }); });

    expect(result.current.detail.checklistRun?.property?.name).toBe("Job B");
  });
});

describe("useJobDetailController operation telemetry", () => {
  const job = { id: "synthetic-job-1", schemaVersion: 2, operationalStatus: "ASSIGNED" };

  it("tracks six independent initial reads in one visit and refreshes without serializing them", async () => {
    const pending = Object.fromEntries(
      ["offers", "issues", "assignments", "checklist-run", "checklist-capability", "cleaners"]
        .map((operation) => [operation, deferred()]),
    );
    mocks.getJobOffers.mockReturnValue(pending.offers.promise);
    mocks.getJobIssues.mockReturnValue(pending.issues.promise);
    mocks.getJobAssignments.mockReturnValue(pending.assignments.promise);
    mocks.getChecklistRun.mockReturnValue(pending["checklist-run"].promise);
    mocks.getChecklistCapability.mockReturnValue(pending["checklist-capability"].promise);
    mocks.getCleaners.mockReturnValue(pending.cleaners.promise);

    const { result, rerender } = renderHook(({ view }) => useJobDetailController({
      view, onJobUpdated: vi.fn(), actorUid: "manager-1",
    }), { initialProps: { view: "dashboard" } });
    act(() => result.current.openJob(job));
    rerender({ view: "job-detail" });
    await waitFor(() => expect(mocks.trackers).toHaveLength(1));
    const tracker = mocks.trackers[0];
    await waitFor(() => expect(tracker.track).toHaveBeenCalledTimes(6));
    expect(tracker.options).toEqual({ uid: "manager-1", pageVisitId: "visit-1" });
    expect(tracker.track.mock.calls.map(([operation]) => operation).sort()).toEqual([
      "assignments", "checklist-capability", "checklist-run", "cleaners", "issues", "offers",
    ]);
    // All six requests started before any response was released.
    expect(mocks.getJobOffers).toHaveBeenCalledOnce();
    expect(mocks.getJobIssues).toHaveBeenCalledOnce();
    expect(mocks.getJobAssignments).toHaveBeenCalledOnce();
    expect(mocks.getChecklistRun).toHaveBeenCalledOnce();
    expect(mocks.getChecklistCapability).toHaveBeenCalledOnce();
    expect(mocks.getCleaners).toHaveBeenCalledOnce();

    await act(async () => {
      pending.offers.resolve([]);
      pending.issues.resolve([]);
      pending.assignments.resolve([]);
      pending["checklist-run"].resolve(null);
      pending["checklist-capability"].resolve({ state: "NONE" });
      pending.cleaners.resolve([]);
      await Promise.all(Object.values(pending).map((entry) => entry.promise));
    });
    await act(async () => { await result.current.detail.refreshOffers(); });
    expect(tracker.track.mock.calls.filter(([operation]) => operation === "offers")).toHaveLength(2);
    expect(mocks.createManagerPageVisitId).toHaveBeenCalledOnce();
  });

  it("uses a fresh opaque visit after Job switch and does not instrument other views", async () => {
    const { result, rerender } = renderHook(({ view }) => useJobDetailController({
      view, onJobUpdated: vi.fn(), actorUid: "manager-1",
    }), { initialProps: { view: "dashboard" } });
    act(() => result.current.openJob(job));
    rerender({ view: "job-detail" });
    await waitFor(() => expect(mocks.trackers).toHaveLength(1));
    act(() => result.current.openJob({ ...job, id: "synthetic-job-2" }));
    await waitFor(() => expect(mocks.trackers).toHaveLength(2));
    expect(mocks.trackers[1].options.pageVisitId).not.toBe(mocks.trackers[0].options.pageVisitId);
    rerender({ view: "checklist-run" });
    await act(async () => { await result.current.detail.refreshChecklistRun(); });
    expect(mocks.trackers[1].track.mock.calls.filter(([operation]) => operation === "checklist-run"))
      .toHaveLength(1);
    rerender({ view: "job-detail" });
    await waitFor(() => expect(mocks.trackers).toHaveLength(3));
    expect(mocks.trackers[2].options.pageVisitId).not.toBe(mocks.trackers[1].options.pageVisitId);
  });

  it("loads a Draft and stale link in one visit, then reissues without creating another Run", async () => {
    const draft = { id: "initial", status: "DRAFT" };
    const stale = { state: "STALE", cleanerId: "cleaner-1" };
    mocks.getChecklistRun.mockResolvedValue(draft);
    mocks.getChecklistCapability.mockResolvedValue(stale);
    const { result, rerender } = renderHook(({ view }) => useJobDetailController({
      view, onJobUpdated: vi.fn(), actorUid: "manager-1",
    }), { initialProps: { view: "dashboard" } });
    act(() => result.current.openJob(job));
    rerender({ view: "job-detail" });

    await waitFor(() => expect(result.current.detail.checklistRun).toEqual(draft));
    await waitFor(() => expect(result.current.detail.checklistCapability).toEqual(stale));
    const tracker = mocks.trackers[0];
    expect(tracker.track.mock.calls.map(([operation]) => operation)).toContain("checklist-run");
    expect(tracker.track.mock.calls.map(([operation]) => operation)).toContain("checklist-capability");

    const issued = { capability: { state: "ACTIVE", cleanerId: "cleaner-1" }, url: "synthetic-link" };
    mocks.issueChecklistCapability.mockResolvedValue(issued);
    await act(async () => {
      await result.current.actions.issueChecklistCapability("cleaner-1");
    });
    expect(mocks.createChecklistRun).not.toHaveBeenCalled();
    expect(result.current.detail.checklistRun).toEqual(draft);
    expect(result.current.detail.checklistCapability).toEqual(issued.capability);
  });

  it("refreshes Run and capability in parallel after a confirmed Draft abandonment", async () => {
    mocks.getChecklistRun.mockResolvedValue({ id: "initial", status: "DRAFT" });
    mocks.getChecklistCapability.mockResolvedValue({ state: "ACTIVE" });
    const { result, rerender } = renderHook(({ view }) => useJobDetailController({
      view, onJobUpdated: vi.fn(), actorUid: "manager-1",
    }), { initialProps: { view: "dashboard" } });
    act(() => result.current.openJob(job));
    rerender({ view: "job-detail" });
    await waitFor(() => expect(result.current.detail.isLoadingChecklistRun).toBe(false));
    await waitFor(() => expect(result.current.detail.isLoadingChecklistCapability).toBe(false));

    const completedJob = { ...job, operationalStatus: "COMPLETED" };
    const runRead = deferred();
    const capabilityRead = deferred();
    mocks.abandonChecklistRunAndCompleteJob.mockResolvedValue({ completed: true });
    mocks.getJobById.mockResolvedValue(completedJob);
    mocks.getChecklistRun.mockReturnValue(runRead.promise);
    mocks.getChecklistCapability.mockReturnValue(capabilityRead.promise);
    let completion;
    act(() => { completion = result.current.actions.abandonChecklistRunAndCompleteJob(); });
    await waitFor(() => expect(mocks.getChecklistRun.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(mocks.getChecklistCapability.mock.calls.length).toBeGreaterThan(1));
    // A pending Run read must not hold up capability state or vice versa.
    await act(async () => {
      runRead.resolve({ id: "initial", status: "ABANDONED" });
      capabilityRead.resolve({ state: "REVOKED" });
      await completion;
    });
    expect(result.current.job).toEqual(completedJob);
    expect(result.current.detail.checklistRun?.status).toBe("ABANDONED");
    expect(result.current.detail.checklistCapability.state).toBe("REVOKED");
    expect(mocks.trackers[0].track.mock.calls.map(([operation]) => operation))
      .toEqual(expect.arrayContaining(["checklist-run", "checklist-capability"]));
  });
});

describe("useJobDetailController manager fast path", () => {
  const job = { id: "job-1", operationalStatus: "IN_PROGRESS" };
  const draftRun = { id: "initial", status: "DRAFT" };
  const issued = {
    capability: { state: "ACTIVE", cleanerId: "cleaner-2" },
    url: "https://example.test/checklist?t=fictional-token",
  };

  function openController(onJobUpdated = vi.fn(), view = "checklist-run") {
    const hook = renderHook(() => useJobDetailController({
      view,
      onJobUpdated,
      actorUid: "manager-1",
    }));
    act(() => hook.result.current.openJob(job));
    return { ...hook, onJobUpdated };
  }

  it("creates a Draft only when the manager prepares a reminder, then issues for the selected cleaner", async () => {
    const { result } = openController(vi.fn(), "job-detail");
    await waitFor(() => expect(result.current.detail.isLoadingChecklistRun).toBe(false));
    expect(mocks.getChecklistRun).toHaveBeenCalledExactlyOnceWith("job-1");
    expect(result.current.detail.checklistRun).toBeNull();
    expect(mocks.createChecklistRun).not.toHaveBeenCalled();
    expect(mocks.issueChecklistCapability).not.toHaveBeenCalled();

    mocks.createChecklistRun.mockResolvedValue(draftRun);
    mocks.issueChecklistCapability.mockResolvedValue(issued);
    let reminder;
    await act(async () => {
      reminder = await result.current.actions.prepareChecklistReminder("cleaner-2");
    });

    expect(mocks.createChecklistRun).toHaveBeenCalledExactlyOnceWith("job-1");
    expect(mocks.issueChecklistCapability).toHaveBeenCalledExactlyOnceWith({
      jobId: "job-1", cleanerId: "cleaner-2",
    });
    expect(mocks.createChecklistRun.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.issueChecklistCapability.mock.invocationCallOrder[0]);
    expect(reminder).toEqual(issued);
    expect(result.current.detail.checklistRun).toEqual(draftRun);
  });

  it("reuses an existing Draft Run when preparing a reminder", async () => {
    mocks.getChecklistRun.mockResolvedValue(draftRun);
    mocks.issueChecklistCapability.mockResolvedValue(issued);
    const { result } = openController();
    await act(async () => {
      await result.current.detail.refreshChecklistRun(job);
    });

    let reminder;
    await act(async () => {
      reminder = await result.current.actions.prepareChecklistReminder("cleaner-2");
    });

    expect(mocks.createChecklistRun).not.toHaveBeenCalled();
    expect(mocks.issueChecklistCapability).toHaveBeenCalledExactlyOnceWith({
      jobId: "job-1", cleanerId: "cleaner-2",
    });
    expect(reminder).toEqual(issued);
  });

  it("does not issue a reminder for a Run that is no longer a Draft", async () => {
    mocks.getChecklistRun.mockResolvedValue({ id: "initial", status: "READY_FOR_REVIEW" });
    const { result } = openController();
    await act(async () => {
      await result.current.detail.refreshChecklistRun(job);
    });

    await act(async () => {
      await expect(result.current.actions.prepareChecklistReminder("cleaner-2"))
        .rejects.toThrow("A Draft Checklist Run is required.");
    });

    expect(mocks.createChecklistRun).not.toHaveBeenCalled();
    expect(mocks.issueChecklistCapability).not.toHaveBeenCalled();
  });

  it("propagates Run creation failure without issuing a link or reporting success", async () => {
    mocks.createChecklistRun.mockRejectedValue(new Error("create failed"));
    const { result } = openController();

    await act(async () => {
      await expect(result.current.actions.prepareChecklistReminder("cleaner-2"))
        .rejects.toThrow("create failed");
    });

    expect(mocks.issueChecklistCapability).not.toHaveBeenCalled();
    expect(result.current.detail.checklistRun).toBeNull();
    expect(result.current.detail.hasCreateChecklistRunError).toBe(true);
  });

  it("propagates capability issuance failure without reporting a reminder", async () => {
    mocks.getChecklistRun.mockResolvedValue(draftRun);
    mocks.issueChecklistCapability.mockRejectedValue(new Error("issue failed"));
    const { result } = openController();
    await act(async () => {
      await result.current.detail.refreshChecklistRun(job);
    });

    await act(async () => {
      await expect(result.current.actions.prepareChecklistReminder("cleaner-2"))
        .rejects.toThrow("issue failed");
    });

    expect(mocks.createChecklistRun).not.toHaveBeenCalled();
    expect(result.current.detail.hasIssueChecklistCapabilityError).toBe(true);
    expect(result.current.detail.checklistCapability).toEqual({ state: "NONE" });
  });

  it("rejects an issued link that is not active for the selected cleaner", async () => {
    mocks.getChecklistRun.mockResolvedValue(draftRun);
    mocks.issueChecklistCapability.mockResolvedValue({
      ...issued,
      capability: { state: "ACTIVE", cleanerId: "another-cleaner" },
    });
    const { result } = openController();
    await act(async () => {
      await result.current.detail.refreshChecklistRun(job);
    });

    await act(async () => {
      await expect(result.current.actions.prepareChecklistReminder("cleaner-2"))
        .rejects.toThrow("Cleaner checklist link is unavailable.");
    });
  });

  it("completes through the server and publishes the authoritative Job readback", async () => {
    const persistedJob = {
      ...job,
      operationalStatus: "COMPLETED",
      completedAt: "server-timestamp",
    };
    mocks.completeJobWithoutChecklist.mockResolvedValue({ operationalStatus: "COMPLETED" });
    mocks.getJobById.mockResolvedValue(persistedJob);
    const { result, onJobUpdated } = openController();

    let returnedJob;
    await act(async () => {
      returnedJob = await result.current.actions.completeCleaning();
    });

    expect(mocks.completeJobWithoutChecklist).toHaveBeenCalledExactlyOnceWith("job-1");
    expect(mocks.getJobById).toHaveBeenCalledExactlyOnceWith("job-1");
    expect(mocks.completeJobWithoutChecklist.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.getJobById.mock.invocationCallOrder[0]);
    expect(returnedJob).toBe(persistedJob);
    expect(result.current.job).toBe(persistedJob);
    expect(onJobUpdated).toHaveBeenCalledExactlyOnceWith(persistedJob);
  });

  it("abandons a Draft through the server, then refreshes the authoritative Job and Run", async () => {
    const completedJob = { ...job, operationalStatus: "COMPLETED", completedAt: "server-timestamp" };
    const abandonedRun = { ...draftRun, status: "ABANDONED" };
    mocks.abandonChecklistRunAndCompleteJob.mockResolvedValue({ completed: true, operationalStatus: "COMPLETED" });
    mocks.getJobById.mockResolvedValue(completedJob);
    mocks.getChecklistRun.mockResolvedValue(abandonedRun);
    const { result, onJobUpdated } = openController();

    await act(async () => {
      await result.current.actions.abandonChecklistRunAndCompleteJob();
    });

    expect(mocks.abandonChecklistRunAndCompleteJob).toHaveBeenCalledExactlyOnceWith("job-1");
    expect(mocks.getJobById).toHaveBeenCalledExactlyOnceWith("job-1");
    expect(mocks.abandonChecklistRunAndCompleteJob.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.getJobById.mock.invocationCallOrder[0]);
    expect(result.current.job).toBe(completedJob);
    expect(result.current.detail.checklistRun).toEqual(abandonedRun);
    expect(onJobUpdated).toHaveBeenCalledExactlyOnceWith(completedJob);
  });

  it("does not report draft abandonment or completion when the server rejects it", async () => {
    mocks.abandonChecklistRunAndCompleteJob.mockRejectedValue(new Error("abandon failed"));
    const { result, onJobUpdated } = openController();

    await act(async () => {
      await expect(result.current.actions.abandonChecklistRunAndCompleteJob()).rejects.toThrow("abandon failed");
    });

    expect(mocks.getJobById).not.toHaveBeenCalled();
    expect(result.current.job).toEqual(job);
    expect(onJobUpdated).not.toHaveBeenCalled();
  });

  it("does not report completion when the server callable fails", async () => {
    mocks.completeJobWithoutChecklist.mockRejectedValue(new Error("completion failed"));
    const { result, onJobUpdated } = openController();

    await act(async () => {
      await expect(result.current.actions.completeCleaning()).rejects.toThrow("completion failed");
    });

    expect(mocks.getJobById).not.toHaveBeenCalled();
    expect(result.current.job).toEqual(job);
    expect(onJobUpdated).not.toHaveBeenCalled();
  });

  it("does not invent a completed Job if the authoritative readback fails", async () => {
    mocks.completeJobWithoutChecklist.mockResolvedValue({ operationalStatus: "COMPLETED" });
    mocks.getJobById.mockRejectedValue(new Error("readback failed"));
    const { result, onJobUpdated } = openController();

    await act(async () => {
      await expect(result.current.actions.completeCleaning()).rejects.toThrow("readback failed");
    });

    expect(result.current.job).toEqual(job);
    expect(onJobUpdated).not.toHaveBeenCalled();
  });

  it("does not reselect an old Job when its completion finishes after a Job switch", async () => {
    const pending = deferred();
    mocks.completeJobWithoutChecklist.mockReturnValue(pending.promise);
    mocks.getJobById.mockResolvedValue({ ...job, operationalStatus: "COMPLETED" });
    const { result, onJobUpdated } = openController();
    let completion;
    act(() => { completion = result.current.actions.completeCleaning(); });
    await waitFor(() => expect(mocks.completeJobWithoutChecklist).toHaveBeenCalledWith("job-1"));
    const otherJob = { id: "job-2", operationalStatus: "ASSIGNED" };
    act(() => result.current.openJob(otherJob));
    await act(async () => { pending.resolve({ operationalStatus: "COMPLETED" }); await completion; });
    expect(result.current.job).toEqual(otherJob);
    expect(onJobUpdated).toHaveBeenCalledWith({ ...job, operationalStatus: "COMPLETED" });
  });

  it("does not let an old capability response clear a new Job's pending issue", async () => {
    const first = deferred();
    const second = deferred();
    mocks.issueChecklistCapability.mockImplementation(({ jobId }) => jobId === "job-1"
      ? first.promise : second.promise);
    const { result } = openController();
    let oldIssue;
    act(() => { oldIssue = result.current.actions.issueChecklistCapability("cleaner-1"); });
    await waitFor(() => expect(mocks.issueChecklistCapability).toHaveBeenCalledWith({
      jobId: "job-1", cleanerId: "cleaner-1",
    }));
    act(() => result.current.openJob({ id: "job-2", operationalStatus: "ASSIGNED" }));
    let newIssue;
    act(() => { newIssue = result.current.actions.issueChecklistCapability("cleaner-2"); });
    await waitFor(() => expect(result.current.detail.isIssuingChecklistCapability).toBe(true));
    await act(async () => {
      first.resolve({ capability: { state: "ACTIVE", cleanerId: "cleaner-1" }, url: "old-url" });
      await oldIssue;
    });
    expect(result.current.job.id).toBe("job-2");
    expect(result.current.detail.isIssuingChecklistCapability).toBe(true);
    expect(result.current.detail.checklistCapability).toEqual({ state: "NONE" });
    await act(async () => {
      second.resolve({ capability: { state: "ACTIVE", cleanerId: "cleaner-2" }, url: "new-url" });
      await newIssue;
    });
    expect(result.current.detail.checklistCapability.cleanerId).toBe("cleaner-2");
    expect(result.current.detail.isIssuingChecklistCapability).toBe(false);
  });

  it("does not issue a second rotating capability for the same Job after reopening while pending", async () => {
    const pending = deferred();
    mocks.issueChecklistCapability.mockReturnValue(pending.promise);
    const { result } = openController();
    let first;
    act(() => { first = result.current.actions.issueChecklistCapability("cleaner-1"); });
    act(() => result.current.openJob({ ...job }));
    let duplicate;
    await act(async () => { duplicate = await result.current.actions.issueChecklistCapability("cleaner-1"); });
    expect(duplicate).toBeNull();
    expect(mocks.issueChecklistCapability).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({ capability: { state: "ACTIVE", cleanerId: "cleaner-1" }, url: "old-url" });
      await first;
    });
    expect(result.current.detail.checklistCapability).toEqual({ state: "NONE" });
  });
});

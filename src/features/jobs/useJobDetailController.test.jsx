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
  getJobOffers: vi.fn(),
  getJobAssignments: vi.fn(),
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
  resolveIssue: vi.fn(),
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
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

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

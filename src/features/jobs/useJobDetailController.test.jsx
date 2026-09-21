import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChecklistRun: vi.fn(),
}));

vi.mock("../checklists/checklistRunService.js", () => ({
  getChecklistRun: mocks.getChecklistRun,
  createChecklistRun: vi.fn(),
}));

import { useJobDetailController } from "./useJobDetailController.js";

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

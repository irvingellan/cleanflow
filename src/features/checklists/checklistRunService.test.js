import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({ httpsCallable: vi.fn() }));

vi.mock("firebase/functions", () => ({ httpsCallable: firebase.httpsCallable }));
vi.mock("../../services/firebase/client.js", () => ({ functions: {} }));

describe("checklistRunService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses manager callables for the Run summary rather than browser Firestore access", async () => {
    const createCall = vi.fn().mockResolvedValue({ data: { run: { id: "initial", status: "DRAFT" } } });
    const getCall = vi.fn().mockResolvedValue({ data: { run: null } });
    firebase.httpsCallable
      .mockReturnValueOnce(createCall)
      .mockReturnValueOnce(getCall);

    const service = await import("./checklistRunService.js");

    await expect(service.createChecklistRun("job-1")).resolves.toEqual({ id: "initial", status: "DRAFT" });
    await expect(service.getChecklistRun("job-1")).resolves.toBeNull();
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(1, {}, "createChecklistRun");
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(2, {}, "getChecklistRun");
    expect(createCall).toHaveBeenCalledWith({ jobId: "job-1" });
    expect(getCall).toHaveBeenCalledWith({ jobId: "job-1" });
  });
});

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
    const approveCall = vi.fn().mockResolvedValue({ data: { completed: true, operationalStatus: "COMPLETED" } });
    const evidenceCall = vi.fn().mockResolvedValue({ data: { contentType: "image/jpeg", base64: "AQID" } });
    firebase.httpsCallable
      .mockReturnValueOnce(createCall)
      .mockReturnValueOnce(getCall)
      .mockReturnValueOnce(approveCall)
      .mockReturnValueOnce(evidenceCall);

    const service = await import("./checklistRunService.js");

    await expect(service.createChecklistRun("job-1")).resolves.toEqual({ id: "initial", status: "DRAFT" });
    await expect(service.getChecklistRun("job-1")).resolves.toBeNull();
    await expect(service.approveChecklistRun("job-1")).resolves.toEqual({ completed: true, operationalStatus: "COMPLETED" });
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(1, {}, "createChecklistRun");
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(2, {}, "getChecklistRun");
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(3, {}, "approveChecklistRun");
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(4, {}, "getChecklistEvidence");
    expect(createCall).toHaveBeenCalledWith({ jobId: "job-1" });
    expect(getCall).toHaveBeenCalledWith({ jobId: "job-1" });
    expect(approveCall).toHaveBeenCalledWith({ jobId: "job-1" });
    const evidence = await service.getChecklistEvidence("job-1", "living-belongings");
    expect(evidence).toBeInstanceOf(Blob);
    expect(evidence.type).toBe("image/jpeg");
    expect(evidenceCall).toHaveBeenCalledWith({ jobId: "job-1", requirementId: "living-belongings" });
  });
});

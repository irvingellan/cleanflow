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
    const completeCall = vi.fn().mockResolvedValue({ data: { completed: true, operationalStatus: "COMPLETED" } });
    const abandonCall = vi.fn().mockResolvedValue({ data: { completed: true, operationalStatus: "COMPLETED" } });
    const evidenceCall = vi.fn().mockResolvedValue({ data: { contentType: "image/jpeg", base64: "AQID" } });
    firebase.httpsCallable
      .mockReturnValueOnce(createCall)
      .mockReturnValueOnce(getCall)
      .mockReturnValueOnce(approveCall)
      .mockReturnValueOnce(completeCall)
      .mockReturnValueOnce(abandonCall)
      .mockReturnValueOnce(evidenceCall);

    const service = await import("./checklistRunService.js");

    await expect(service.createChecklistRun("job-1")).resolves.toEqual({ id: "initial", status: "DRAFT" });
    await expect(service.getChecklistRun("job-1")).resolves.toBeNull();
    await expect(service.approveChecklistRun("job-1")).resolves.toEqual({ completed: true, operationalStatus: "COMPLETED" });
    await expect(service.completeJobWithoutChecklist("job-1"))
      .resolves.toEqual({ completed: true, operationalStatus: "COMPLETED" });
    await expect(service.abandonChecklistRunAndCompleteJob("job-1"))
      .resolves.toEqual({ completed: true, operationalStatus: "COMPLETED" });
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(1, {}, "createChecklistRun");
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(2, {}, "getChecklistRun");
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(3, {}, "approveChecklistRun");
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(4, {}, "completeJobWithoutChecklist");
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(5, {}, "abandonChecklistRunAndCompleteJob");
    expect(firebase.httpsCallable).toHaveBeenNthCalledWith(6, {}, "getChecklistEvidence");
    expect(createCall).toHaveBeenCalledWith({ jobId: "job-1" });
    expect(getCall).toHaveBeenCalledWith({ jobId: "job-1" });
    expect(approveCall).toHaveBeenCalledWith({ jobId: "job-1" });
    expect(completeCall).toHaveBeenCalledWith({ jobId: "job-1" });
    expect(abandonCall).toHaveBeenCalledWith({ jobId: "job-1" });
    const evidence = await service.getChecklistEvidence("job-1", "living-belongings");
    expect(evidence).toBeInstanceOf(Blob);
    expect(evidence.type).toBe("image/jpeg");
    expect(evidenceCall).toHaveBeenCalledWith({ jobId: "job-1", requirementId: "living-belongings" });
    await service.getChecklistEvidence("job-1", "additional", "opaque-photo");
    expect(evidenceCall).toHaveBeenLastCalledWith({ jobId: "job-1", evidenceId: "opaque-photo" });
  });
});

describe("base64ToBlob", () => {
  it("decodes a photo with the browser decoder and keeps the content type", async () => {
    const { base64ToBlob } = await import("./checklistRunService.js");
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 250]);
    const base64 = btoa(String.fromCharCode(...bytes));
    const blob = await base64ToBlob(base64, "image/jpeg");
    expect(blob.type).toBe("image/jpeg");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it("falls back to the manual decoder for an unexpected type or a failing fetch", async () => {
    const { base64ToBlob } = await import("./checklistRunService.js");
    const base64 = btoa("abc");
    expect(new Uint8Array(await (await base64ToBlob(base64, "application/octet-stream")).arrayBuffer())).toEqual(new Uint8Array([97, 98, 99]));
    const original = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("blocked"));
    try {
      const blob = await base64ToBlob(base64, "image/png");
      expect(blob.type).toBe("image/png");
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([97, 98, 99]));
    } finally {
      globalThis.fetch = original;
    }
  });
});

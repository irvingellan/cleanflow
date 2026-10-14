import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useChecklistPhotoGallery } from "./useChecklistPhotoGallery.js";

const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const photo = (id, requirementId = "additional") => ({ evidenceId: id, requirementId, contentType: "image/jpeg", sizeBytes: 3 });
const file = (size = 8) => new File([new Uint8Array(size)], "private-name.jpg", { type: "image/jpeg" });
const checklist = { status: "DRAFT", evidencePolicy: { version: 2, maxPhotos: 20 }, evidenceRevision: 0, evidence: [] };

function setup(overrides = {}) {
  let revision = 0; const saved = [];
  const options = { token: "synthetic-token", checklist, onEvidence: vi.fn(),
    optimize: async () => ({ blob: new Blob(["abc"], { type: "image/jpeg" }) }),
    upload: async ({ requirementId }) => { const item = photo(String(++revision), requirementId); saved.push(item); return { evidenceId: item.evidenceId, evidenceRevision: revision, evidence: [...saved] }; },
    refresh: async () => ({ checklist: { ...checklist, evidenceRevision: revision, evidence: [...saved] } }),
    remove: async () => ({ removed: true, evidenceRevision: ++revision, evidence: [] }), ...overrides };
  return { ...renderHook((props) => useChecklistPhotoGallery(props), { initialProps: options }), options };
}

describe("sequential bounded photo gallery", () => {
  it("a removed required photo cannot be restored by its late upload acknowledgement", async () => {
    const held = deferred(); const required = photo("required", "living-belongings");
    const { result } = setup({ upload: async () => held.promise,
      refresh: async () => ({ checklist: { ...checklist, evidenceRevision: 1, evidence: [required] } }),
      remove: async () => ({ removed: true, evidenceRevision: 2, evidence: [] }) });
    act(() => result.current.append([file()]));
    await waitFor(() => expect(result.current.local[0]?.state).toBe("UPLOADING"));
    await act(async () => result.current.refreshSaved());
    await act(async () => result.current.removeSaved("required"));
    await act(async () => held.resolve({ evidenceId: "required", evidenceRevision: 1, evidence: [required] }));
    expect(result.current.saved).toEqual([]);
    expect(result.current.pendingCount).toBe(0);
  });
  it("releases optimized originals so retry blobs share the retained 50MiB budget", async () => {
    const held = deferred(); let n = 0;
    const { result } = setup({ optimize: async () => ++n === 1 ? { blob: new Blob(["abc"], { type: "image/jpeg" }) } : held.promise,
      upload: async () => { throw new TypeError("network"); } });
    act(() => result.current.append([file(20 * 1024 * 1024)]));
    await waitFor(() => expect(result.current.local[0]?.state).toBe("FAILED"));
    act(() => result.current.append([file(20 * 1024 * 1024), file(20 * 1024 * 1024)]));
    expect(result.current.local).toHaveLength(3);
    expect(result.current.error).toBeNull();
  });
  it("discard of an uncertain upload refreshes saved gallery without claiming deletion", async () => {
    const { result } = setup({ upload: async () => { throw new TypeError("lost response"); },
      refresh: async () => ({ checklist: { ...checklist, evidenceRevision: 1, evidence: [photo("accepted", "living-belongings")] } }) });
    act(() => result.current.append([file()]));
    await waitFor(() => expect(result.current.local[0]?.state).toBe("FAILED"));
    await act(async () => result.current.discard(result.current.local[0].id));
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.saved.map((p) => p.evidenceId)).toEqual(["accepted"]);
  });
  it("uses the same removal mutation identity after a lost receipt", async () => {
    const ids = []; let n = 0;
    const { result } = setup({ checklist: { ...checklist, evidenceRevision: 1, evidence: [photo("required", "living-belongings")] },
      remove: async ({ mutationId }) => { ids.push(mutationId); if (++n === 1) throw new TypeError("lost receipt"); return { duplicate: true, removed: true, evidenceRevision: 2, evidence: [] }; } });
    await act(async () => result.current.removeSaved("required"));
    expect(result.current.saved).toHaveLength(1);
    await act(async () => result.current.removeSaved("required"));
    expect(result.current.saved).toHaveLength(0);
    expect(ids[0]).toBe(ids[1]);
  });
  it("appends selections, claims one required slot and processes only one image at a time", async () => {
    const first = deferred(); let optimizing = 0; let peak = 0; let n = 0;
    const { result } = setup({ optimize: async () => { peak = Math.max(peak, ++optimizing); if (++n === 1) await first.promise; optimizing--; return { blob: new Blob(["abc"], { type: "image/jpeg" }) }; } });
    act(() => result.current.append([file(), file()]));
    act(() => result.current.append([file()]));
    expect(result.current.local).toHaveLength(3);
    expect(result.current.pendingCount).toBe(3);
    expect(result.current.local.map((p) => p.requirementId)).toEqual(["living-belongings", "additional", "additional"]);
    await act(async () => first.resolve());
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(result.current.saved).toHaveLength(3);
    expect(peak).toBe(1);
    expect(JSON.stringify(result.current.local)).not.toContain("private-name");
  });

  it("retries the exact optimized Blob after a lost response, reconciling one saved identity", async () => {
    const optimized = new Blob(["abc"], { type: "image/jpeg" }); const sent = []; let attempts = 0;
    const { result } = setup({ optimize: async () => ({ blob: optimized }), upload: async ({ file: blob }) => { sent.push(blob); if (++attempts === 1) throw new TypeError("network"); return { duplicate: true, evidenceId: "accepted", evidenceRevision: 1, evidence: [photo("accepted", "living-belongings")] }; } });
    act(() => result.current.append([file()]));
    await waitFor(() => expect(result.current.local[0]?.state).toBe("FAILED"));
    const id = result.current.local[0].id;
    expect(result.current.pendingCount).toBe(1);
    act(() => result.current.retry(id));
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(sent).toEqual([optimized, optimized]);
    expect(result.current.saved.map((p) => p.evidenceId)).toEqual(["accepted"]);
  });

  it("does not call a different required photo saved without the accepted identity", async () => {
    const { result } = setup({ upload: async () => ({ evidenceId: "absent", evidenceRevision: 1, evidence: [photo("other", "living-belongings")] }) });
    act(() => result.current.append([file()]));
    await waitFor(() => expect(result.current.local[0]?.state).toBe("FAILED"));
    expect(result.current.pendingCount).toBe(1);
  });

  it("keeps authoritative removal and ignores a late lower gallery revision", async () => {
    const { result, rerender, options } = setup({ checklist: { ...checklist, evidenceRevision: 5, evidence: [photo("required", "living-belongings")] }, remove: async () => ({ removed: true, evidenceRevision: 6, evidence: [] }) });
    await act(async () => result.current.removeSaved("required"));
    expect(result.current.saved).toEqual([]);
    rerender({ ...options, checklist: { ...checklist, evidenceRevision: 4, evidence: [photo("required", "living-belongings")] } });
    expect(result.current.saved).toEqual([]);
    act(() => result.current.append([file()]));
    expect(result.current.local[0].requirementId).toBe("living-belongings");
  });

  it("caps retained selection bytes and count without starting rejected native decodes", async () => {
    const held = deferred(); const { result } = setup({ checklist: { ...checklist, evidencePolicy: { version: 2, maxPhotos: 4 } }, optimize: async () => held.promise });
    act(() => result.current.append([file(20 * 1024 * 1024), file(20 * 1024 * 1024), file(11 * 1024 * 1024)]));
    expect(result.current.local).toHaveLength(2);
    expect(result.current.error).toBe("checklist_photo_queue_limit");
    act(() => result.current.append([file(), file(), file()]));
    expect(result.current.local).toHaveLength(4);
    expect(result.current.error).toBe("checklist_photo_limit");
  });

  it("aborts disposed optimization and never uploads its late result into another token", async () => {
    const held = deferred(); let signal; let uploads = 0;
    const { result, rerender, options } = setup({ optimize: async (_file, opts) => { signal = opts.signal; return held.promise; }, upload: async () => { uploads++; } });
    act(() => result.current.append([file()]));
    rerender({ ...options, token: "another-token" });
    expect(signal.aborted).toBe(true);
    await act(async () => held.resolve({ blob: new Blob(["abc"]) }));
    expect(uploads).toBe(0);
    expect(result.current.pendingCount).toBe(0);
  });
});

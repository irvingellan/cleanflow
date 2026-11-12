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
    remove: async () => ({ removed: true, evidenceRevision: ++revision, evidence: [] }),
    uploadRetryDelays: [], reportFailure: vi.fn(), ...overrides };
  return { ...renderHook((props) => useChecklistPhotoGallery(props), { initialProps: options }), options };
}

describe("sequential bounded photo gallery", () => {
  it("sends a photo again by itself after a weak-signal failure", async () => {
    let calls = 0;
    const { result } = setup({ uploadRetryDelays: [0, 0],
      upload: async ({ requirementId }) => {
        if (++calls < 3) throw Object.assign(new Error("slow"), { code: "checklist_request_timeout" });
        return { evidenceId: "1", evidenceRevision: 1, evidence: [photo("1", requirementId)] };
      } });
    act(() => result.current.append([file()]));
    await waitFor(() => expect(result.current.saved).toHaveLength(1));
    expect(calls).toBe(3);
    expect(result.current.local).toHaveLength(0);
  });
  it("stops retrying by itself when the server refuses the photo", async () => {
    const upload = vi.fn(async () => { throw Object.assign(new Error("full"), { code: "checklist_photo_limit" }); });
    const { result } = setup({ uploadRetryDelays: [0, 0], upload });
    act(() => result.current.append([file()]));
    await waitFor(() => expect(result.current.local[0]?.state).toBe("FAILED"));
    expect(upload).toHaveBeenCalledOnce();
  });
  it("reports a photo the phone could not prepare and retries all failed photos together", async () => {
    let broken = true;
    const reportFailure = vi.fn();
    const { result } = setup({ reportFailure, optimize: async () => {
      if (broken) throw Object.assign(new Error("big"), { code: "checklist_photo_pixels_exceeded" });
      return { blob: new Blob(["abc"], { type: "image/jpeg" }) };
    } });
    act(() => result.current.append([file(), file()]));
    await waitFor(() => expect(result.current.local.map((p) => p.state)).toEqual(["FAILED", "FAILED"]));
    expect(reportFailure).toHaveBeenCalledTimes(2);
    expect(reportFailure.mock.calls[0][1]).toHaveProperty("code", "checklist_photo_pixels_exceeded");
    broken = false;
    act(() => result.current.retryAll());
    await waitFor(() => expect(result.current.saved).toHaveLength(2));
    expect(result.current.local).toHaveLength(0);
  });
  it("saves every photo even when the small picture never becomes ready", async () => {
    const { result } = setup({ preview: () => new Promise(() => {}) });
    act(() => result.current.append([file(), file(), file()]));
    await waitFor(() => expect(result.current.saved).toHaveLength(3));
    expect(result.current.local).toHaveLength(0);
    expect(result.current.pendingCount).toBe(0);
  });
  it("shows the small picture when it becomes ready after the photo was saved", async () => {
    const pending = deferred();
    const { result } = setup({ preview: () => pending.promise });
    act(() => result.current.append([file()]));
    await waitFor(() => expect(result.current.saved).toHaveLength(1));
    expect(result.current.previewFor(result.current.saved[0].evidenceId)).toBeNull();
    await act(async () => pending.resolve("blob:picture"));
    expect(result.current.previewFor(result.current.saved[0].evidenceId)).toBe("blob:picture");
  });
  it("discards every failed photo in one step and keeps the saved ones", async () => {
    let calls = 0;
    const { result } = setup({ optimize: async () => {
      if (++calls > 1) throw Object.assign(new Error("no"), { code: "checklist_photo_invalid_image" });
      return { blob: new Blob(["abc"], { type: "image/jpeg" }) };
    } });
    act(() => result.current.append([file(), file(), file()]));
    await waitFor(() => expect(result.current.local.map((p) => p.state)).toEqual(["FAILED", "FAILED"]));
    await act(async () => result.current.discardFailed());
    expect(result.current.local).toHaveLength(0);
    expect(result.current.saved).toHaveLength(1);
    expect(result.current.pendingCount).toBe(0);
  });
  it("continues after one batch upload fails and retries only that retained photo", async () => {
    const optimized = ["first", "second", "third"].map((value) => new Blob([value], { type: "image/jpeg" }));
    const accepted = [];
    const sent = [];
    let encodeIndex = 0;
    let revision = 0;
    let failedOnce = false;
    const { result } = setup({
      optimize: async () => ({ blob: optimized[encodeIndex++] }),
      upload: async ({ file: blob, requirementId }) => {
        sent.push(blob);
        if (blob === optimized[1] && !failedOnce) {
          failedOnce = true;
          throw new TypeError("synthetic transient network failure");
        }
        const item = photo(String(optimized.indexOf(blob) + 1), requirementId);
        accepted.push(item);
        return { evidenceId: item.evidenceId, evidenceRevision: ++revision, evidence: [...accepted] };
      },
    });
    act(() => result.current.append([file(), file(), file()]));
    await waitFor(() => expect(result.current.saved.map((p) => p.evidenceId)).toEqual(["1", "3"]));
    expect(result.current.local).toHaveLength(1);
    expect(result.current.local[0].state).toBe("FAILED");
    expect(result.current.pendingCount).toBe(1);
    act(() => result.current.retry(result.current.local[0].id));
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(result.current.saved.map((p) => p.evidenceId)).toEqual(["1", "3", "2"]);
    expect(sent).toEqual([optimized[0], optimized[1], optimized[2], optimized[1]]);
    expect(encodeIndex).toBe(3);
  });

  it("rejects selection twenty-one without starting another optimization or losing the twenty saved photos", async () => {
    const optimize = vi.fn();
    const saved = Array.from({ length: 20 }, (_, index) => photo(String(index), index ? "additional" : "living-belongings"));
    const { result } = setup({ checklist: { ...checklist, evidenceRevision: 20, evidence: saved }, optimize });
    act(() => result.current.append([file()]));
    expect(result.current.error).toBe("checklist_photo_limit");
    expect(result.current.saved).toEqual(saved);
    expect(result.current.pendingCount).toBe(0);
    expect(optimize).not.toHaveBeenCalled();
  });

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

  it("caps the selection by photo count, not by the size of the phone's original files", async () => {
    const held = deferred(); const { result } = setup({ checklist: { ...checklist, evidencePolicy: { version: 2, maxPhotos: 4 } }, optimize: async () => held.promise });
    act(() => result.current.append([file(20 * 1024 * 1024), file(20 * 1024 * 1024), file(11 * 1024 * 1024)]));
    expect(result.current.local).toHaveLength(3);
    expect(result.current.error).toBeNull();
    act(() => result.current.append([file(), file(), file()]));
    expect(result.current.local).toHaveLength(4);
    expect(result.current.error).toBe("checklist_photo_limit");
  });

  it("FB05: queues a 20-photo selection of 3 MB originals that used to stop at 16", async () => {
    const held = deferred(); const { result } = setup({ checklist: { ...checklist, evidencePolicy: { version: 2, maxPhotos: 60 } }, optimize: async () => held.promise });
    const phonePhoto = () => file(Math.round(3.1 * 1024 * 1024));
    act(() => result.current.append(Array.from({ length: 20 }, phonePhoto)));
    expect(result.current.local).toHaveLength(20);
    expect(result.current.error).toBeNull();
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

import { useEffect, useRef, useState } from "react";
import { optimizeChecklistImage } from "./checklistImageOptimizer.js";
import { getPublicChecklist, removePublicChecklistEvidence, uploadPublicChecklistEvidence } from "./checklistCapabilityService.js";

const retainedByteLimit = 50 * 1024 * 1024;
const sourceByteLimit = 20 * 1024 * 1024;
const requiredPurpose = "living-belongings";
const noop = () => {};

/** Owns only transient inputs, one encoder/uploader, and revisioned safe evidence. */
export function useChecklistPhotoGallery({ token, checklist, disabled = false, onEvidence = noop,
  optimize = optimizeChecklistImage, upload = uploadPublicChecklistEvidence,
  refresh = getPublicChecklist, remove = removePublicChecklistEvidence }) {
  const [, render] = useState(0);
  const scope = useRef(null);
  const options = useRef(null);
  options.current = { checklist, disabled, onEvidence, optimize, upload, refresh, remove };
  const notify = (current) => { if (scope.current === current && !current.disposed) render((n) => n + 1); };
  const apply = (current, result) => {
    if (scope.current !== current || current.disposed || !Array.isArray(result?.evidence)
      || !Number.isInteger(result.evidenceRevision) || result.evidenceRevision < current.revision) return false;
    current.saved = result.evidence;
    current.revision = result.evidenceRevision;
    options.current.onEvidence({ evidence: current.saved, evidenceRevision: current.revision });
    notify(current);
    return true;
  };

  useEffect(() => {
    const current = { token, local: [], saved: checklist?.evidence || [], revision: checklist?.evidenceRevision || 0,
      error: null, busy: false, refreshing: false, removing: new Map(), removalIds: new Map(), controller: new AbortController(), disposed: false };
    scope.current = current;
    notify(current);
    return () => {
      current.disposed = true;
      current.controller.abort();
      for (const item of current.local) { item.file = null; item.blob = null; }
      current.local = [];
    };
  }, [token]);

  useEffect(() => {
    const current = scope.current;
    if (current) apply(current, checklist);
  }, [checklist?.evidence, checklist?.evidenceRevision, token]);

  const editable = (current) => current && !current.disposed && !options.current.disabled
    && options.current.checklist?.status === "DRAFT" && options.current.checklist?.evidencePolicy?.version === 2;
  const pump = async (current) => {
    if (!editable(current) || current.busy) return;
    current.busy = true;
    try {
      let item;
      while (editable(current) && (item = current.local.find((p) => p.state === "READY"))) {
        try {
          if (!item.blob) {
            item.state = "OPTIMIZING"; notify(current);
            const optimized = await options.current.optimize(item.file, { signal: current.controller.signal });
            if (scope.current !== current || current.disposed) return;
            item.file = null;
            item.blob = optimized.blob;
            if (!(item.blob instanceof Blob)) throw { code: "checklist_photo_invalid_image" };
          }
          if (!editable(current) || current.controller.signal.aborted) return;
          item.state = "UPLOADING"; notify(current);
          const result = await options.current.upload({ token: current.token, requirementId: item.requirementId,
            file: item.blob, version: 2, signal: current.controller.signal });
          if (scope.current !== current || current.disposed) return;
          if (!Number.isInteger(result?.evidenceRevision) || !result?.evidence?.some((photo) =>
            photo.evidenceId === result.evidenceId && photo.requirementId === item.requirementId)) throw { code: "checklist_response_invalid" };
          apply(current, result);
          item.blob = null; item.file = null;
          current.local = current.local.filter((p) => p !== item);
        } catch (error) {
          if (scope.current !== current || current.disposed) return;
          item.state = "FAILED";
          item.error = error?.code || "checklist_photo_unavailable";
        }
        notify(current);
      }
    } finally { current.busy = false; notify(current); }
  };

  const current = scope.current;
  return {
    getSnapshot: () => ({ saved: scope.current?.saved || [], pendingCount: (scope.current?.local.length || 0) + (scope.current?.removing.size || 0) }),
    saved: current?.saved || [],
    local: (current?.local || []).map(({ id, requirementId, state, error }) => ({ id, requirementId, state, error })),
    pendingCount: (current?.local.length || 0) + (current?.removing.size || 0),
    error: current?.error, refreshing: current?.refreshing || false,
    removing: new Set(current?.removing.keys() || []),
    append(files) {
      const state = scope.current;
      if (!editable(state)) return;
      state.error = null;
      for (const file of Array.from(files)) {
        // FB05: a selected File is a lazy handle to the phone's file; only an
        // optimized photo waiting to upload holds memory. Counting original
        // sizes stopped a 16-photo selection at the 50 MB queue limit.
        const retained = state.local.reduce((sum, p) => sum + (p.blob?.size || 0), 0);
        if (state.saved.length + state.local.length >= Math.min(60, options.current.checklist.evidencePolicy.maxPhotos)) { state.error = "checklist_photo_limit"; break; }
        if (file.size > sourceByteLimit) { state.error = "checklist_photo_source_too_large"; continue; }
        if (retained + file.size > retainedByteLimit) { state.error = "checklist_photo_queue_limit"; break; }
        const occupied = [...state.saved, ...state.local].some((p) => p.requirementId === requiredPurpose);
        state.local.push({ id: crypto.randomUUID(), requirementId: occupied ? "additional" : requiredPurpose, state: "READY", file, blob: null });
      }
      notify(state); pump(state);
    },
    retry(id) {
      const state = scope.current; const item = state?.local.find((p) => p.id === id);
      if (!editable(state) || item?.state !== "FAILED") return;
      item.state = "READY"; item.error = null; notify(state); pump(state);
    },
    async discard(id) {
      const state = scope.current; const item = state?.local.find((p) => p.id === id);
      if (!editable(state) || !["FAILED", "READY"].includes(item?.state)) return;
      item.file = null; item.blob = null;
      state.local = state.local.filter((p) => p !== item);
      notify(state);
      // An uncertain upload may already be saved. Discard releases local bytes,
      // never claims server deletion; refresh reveals the persisted gallery.
      await refreshSaved();
    },
    refreshSaved,
    async removeSaved(evidenceId) {
      const state = scope.current;
      if (!editable(state) || state.removing.has(evidenceId) || !state.saved.some((p) => p.evidenceId === evidenceId)) return;
      const mutationId = state.removalIds.get(evidenceId) || crypto.randomUUID().replaceAll("-", "");
      state.removalIds.set(evidenceId, mutationId);
      state.removing.set(evidenceId, mutationId); state.error = null; notify(state);
      try { const result = await options.current.remove({ token: state.token, evidenceId, mutationId, signal: state.controller.signal });
        if (result?.removed !== true || result.evidence?.some((p) => p.evidenceId === evidenceId)) throw { code: "checklist_response_invalid" };
        apply(state, result);
        state.removalIds.delete(evidenceId);
      } catch (error) { if (scope.current === state && !state.disposed) state.error = error?.code || "checklist_photo_unavailable"; }
      finally { state.removing.delete(evidenceId); notify(state); }
    },
  };
  async function refreshSaved() {
      const state = scope.current;
      if (!state || state.disposed || state.refreshing) return false;
      state.refreshing = true; state.error = null; notify(state);
      try { const result = await options.current.refresh(state.token); return apply(state, result?.checklist); }
      catch (error) { if (scope.current === state && !state.disposed) state.error = error?.code || "checklist_photo_unavailable"; return false; }
      finally { state.refreshing = false; notify(state); }
  }
}

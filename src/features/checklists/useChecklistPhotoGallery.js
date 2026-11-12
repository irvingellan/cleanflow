import { useEffect, useRef, useState } from "react";
import { optimizeChecklistImage } from "./checklistImageOptimizer.js";
import { createChecklistPhotoPreview, releaseChecklistPhotoPreview } from "./checklistPhotoPreview.js";
import { getPublicChecklist, removePublicChecklistEvidence, uploadPublicChecklistEvidence } from "./checklistCapabilityService.js";
import {
  buildPublicChecklistPhotoUploadDiagnostic, createPublicChecklistDiagnosticId, getPublicChecklistSessionId,
  publicChecklistPhotoFileType, publicChecklistPhotoSizeBucket, recordPublicChecklistPhotoUploadDiagnostic,
} from "./publicChecklistLoadDiagnostics.js";

const retainedByteLimit = 50 * 1024 * 1024;
const sourceByteLimit = 40 * 1024 * 1024;
// A weak signal is the usual reason an upload fails. The server recognizes a
// photo it already saved, so sending the same photo again is always safe.
const transientUploadErrors = new Set(["checklist_request_timeout", "checklist_photo_unavailable", "checklist_conflict"]);
const defaultUploadRetryDelays = [2_500, 6_000];
const optimizationDiagnosticCodes = {
  checklist_photo_invalid_type: "unsupported_type", checklist_photo_source_too_large: "file_too_large",
  checklist_photo_pixels_exceeded: "file_too_large", checklist_photo_optimization_too_large: "file_too_large",
  checklist_photo_optimization_timeout: "timeout",
};
/** A photo rejected on the phone never reaches the server, so report why. */
function reportOptimizationFailure(file, error, startedAt) {
  if (error?.code === "checklist_photo_optimization_cancelled") return;
  recordPublicChecklistPhotoUploadDiagnostic(buildPublicChecklistPhotoUploadDiagnostic({
    sessionId: getPublicChecklistSessionId(), requestId: createPublicChecklistDiagnosticId(), result: "error",
    durationMs: Date.now() - startedAt, fileType: publicChecklistPhotoFileType(file?.type),
    sizeBucket: publicChecklistPhotoSizeBucket(file?.size), stage: "preflight",
    errorCode: optimizationDiagnosticCodes[error?.code] || "invalid_file",
  }));
}
function pause(milliseconds, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); }
    signal.addEventListener("abort", done, { once: true });
  });
}
const requiredPurpose = "living-belongings";
const noop = () => {};

/** Owns only transient inputs, one encoder/uploader, and revisioned safe evidence. */
export function useChecklistPhotoGallery({ token, checklist, disabled = false, onEvidence = noop,
  optimize = optimizeChecklistImage, upload = uploadPublicChecklistEvidence,
  refresh = getPublicChecklist, remove = removePublicChecklistEvidence,
  uploadRetryDelays = defaultUploadRetryDelays, reportFailure = reportOptimizationFailure,
  preview = createChecklistPhotoPreview }) {
  const [, render] = useState(0);
  const scope = useRef(null);
  const options = useRef(null);
  options.current = { checklist, disabled, onEvidence, optimize, upload, refresh, remove, uploadRetryDelays, reportFailure, preview };
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
      error: null, busy: false, refreshing: false, removing: new Map(), removalIds: new Map(), previews: new Map(), controller: new AbortController(), disposed: false };
    scope.current = current;
    notify(current);
    return () => {
      current.disposed = true;
      current.controller.abort();
      for (const item of current.local) { item.file = null; item.blob = null; releaseChecklistPhotoPreview(item.preview); }
      for (const url of current.previews.values()) releaseChecklistPhotoPreview(url);
      current.previews.clear();
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
            const startedAt = Date.now();
            let optimized;
            try { optimized = await options.current.optimize(item.file, { signal: current.controller.signal }); }
            catch (error) { options.current.reportFailure(item.file, error, startedAt); throw error; }
            if (scope.current !== current || current.disposed) return;
            item.file = null;
            item.blob = optimized.blob;
            if (!(item.blob instanceof Blob)) throw { code: "checklist_photo_invalid_image" };
            // The small picture is a convenience. It is made in the background and
            // never holds the upload back, even if the browser never answers.
            const pictured = item;
            Promise.resolve().then(() => options.current.preview(pictured.blob)).catch(() => null).then((picture) => {
              if (!picture) return;
              if (scope.current !== current || current.disposed || pictured.discarded) return releaseChecklistPhotoPreview(picture);
              if (pictured.savedId) {
                if (!current.saved.some((photo) => photo.evidenceId === pictured.savedId)) return releaseChecklistPhotoPreview(picture);
                releaseChecklistPhotoPreview(current.previews.get(pictured.savedId)); current.previews.set(pictured.savedId, picture);
              } else pictured.preview = picture;
              notify(current);
            });
          }
          if (!editable(current) || current.controller.signal.aborted) return;
          item.state = "UPLOADING"; notify(current);
          let result;
          for (let attempt = 0; ; attempt++) {
            try {
              result = await options.current.upload({ token: current.token, requirementId: item.requirementId,
                file: item.blob, version: 2, signal: current.controller.signal });
              break;
            } catch (error) {
              const delay = options.current.uploadRetryDelays[attempt];
              if (delay === undefined || !transientUploadErrors.has(error?.code || "checklist_photo_unavailable")
                || scope.current !== current || current.disposed) throw error;
              await pause(delay, current.controller.signal);
              if (!editable(current) || current.controller.signal.aborted) return;
            }
          }
          if (scope.current !== current || current.disposed) return;
          if (!Number.isInteger(result?.evidenceRevision) || !result?.evidence?.some((photo) =>
            photo.evidenceId === result.evidenceId && photo.requirementId === item.requirementId)) throw { code: "checklist_response_invalid" };
          apply(current, result);
          item.savedId = result.evidenceId;
          if (item.preview) { releaseChecklistPhotoPreview(current.previews.get(result.evidenceId)); current.previews.set(result.evidenceId, item.preview); item.preview = null; }
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
    local: (current?.local || []).map(({ id, requirementId, state, error, preview: picture }) => ({ id, requirementId, state, error, preview: picture || null })),
    previewFor: (evidenceId) => scope.current?.previews.get(evidenceId) || null,
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
    retryAll() {
      const state = scope.current;
      if (!editable(state)) return;
      for (const item of state.local) if (item.state === "FAILED") { item.state = "READY"; item.error = null; }
      notify(state); pump(state);
    },
    async discard(id) {
      const state = scope.current; const item = state?.local.find((p) => p.id === id);
      if (!editable(state) || !["FAILED", "READY"].includes(item?.state)) return;
      item.file = null; item.blob = null; item.discarded = true; releaseChecklistPhotoPreview(item.preview);
      state.local = state.local.filter((p) => p !== item);
      notify(state);
      // An uncertain upload may already be saved. Discard releases local bytes,
      // never claims server deletion; refresh reveals the persisted gallery.
      await refreshSaved();
    },
    /** Drops every photo that failed, in one step, so the checklist can be sent. */
    async discardFailed() {
      const state = scope.current;
      if (!editable(state) || !state.local.some((p) => p.state === "FAILED")) return;
      for (const item of state.local) if (item.state === "FAILED") { item.file = null; item.blob = null; item.discarded = true; releaseChecklistPhotoPreview(item.preview); }
      state.local = state.local.filter((p) => p.state !== "FAILED");
      notify(state);
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
        releaseChecklistPhotoPreview(state.previews.get(evidenceId)); state.previews.delete(evidenceId);
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

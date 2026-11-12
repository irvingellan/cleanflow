import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const createChecklistRunCall = httpsCallable(functions, "createChecklistRun");
const getChecklistRunCall = httpsCallable(functions, "getChecklistRun");
const approveChecklistRunCall = httpsCallable(functions, "approveChecklistRun");
const completeJobWithoutChecklistCall = httpsCallable(functions, "completeJobWithoutChecklist");
const abandonChecklistRunAndCompleteJobCall = httpsCallable(functions, "abandonChecklistRunAndCompleteJob");
const getChecklistEvidenceCall = httpsCallable(functions, "getChecklistEvidence");

export async function getChecklistRun(jobId) {
  const result = await getChecklistRunCall({ jobId });
  return result.data?.run || null;
}

export async function createChecklistRun(jobId) {
  const result = await createChecklistRunCall({ jobId });
  return result.data?.run || null;
}

export async function approveChecklistRun(jobId) {
  const result = await approveChecklistRunCall({ jobId });
  return result.data;
}

/** The manager sends a filled draft for review when the cleaner did not (section 8). */
export async function submitChecklistRunForReview(jobId, baseRevision) {
  const result = await httpsCallable(functions, "submitChecklistRunForReview")({ jobId, baseRevision });
  return result.data;
}

/** Correct one answer the cleaner got wrong; `answer: null` undoes the correction. */
export async function correctChecklistAnswer(jobId, kind, itemId, answer) {
  const result = await httpsCallable(functions, "correctChecklistAnswer")({ jobId, kind, itemId, answer });
  return result.data;
}

/** FB07: hide one saved photo from the client report (or show it again). It stays as evidence. */
export async function setReportPhotoVisibility(jobId, evidenceId, hidden, reason = "") {
  const result = await httpsCallable(functions, "setReportPhotoVisibility")({ jobId, evidenceId, hidden, reason });
  return result.data;
}

export async function completeJobWithoutChecklist(jobId) {
  const result = await completeJobWithoutChecklistCall({ jobId });
  return result.data;
}

export async function abandonChecklistRunAndCompleteJob(jobId) {
  const result = await abandonChecklistRunAndCompleteJobCall({ jobId });
  return result.data;
}

/** The manager receives image bytes only through the authorized server callable. */
const imageContentType = /^image\/(jpeg|png|webp|heic|heif|gif)$/;

/**
 * Turns the callable's base64 photo into a Blob. The browser's own data-URL
 * decoder runs off the main thread; decoding character by character in
 * JavaScript froze slower laptops while a 40-photo grid loaded.
 */
export async function base64ToBlob(base64, contentType) {
  if (typeof fetch === "function" && imageContentType.test(contentType)) {
    try {
      const response = await fetch(`data:${contentType};base64,${base64}`);
      if (response.ok) return new Blob([await response.arrayBuffer()], { type: contentType });
    } catch {
      // Fall back to the manual decoder below.
    }
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}

/** Saved photo bytes; `variant: "thumbnail"` returns a small cached preview for grids. */
export async function getChecklistEvidence(jobId, requirementId, evidenceId, { variant } = {}) {
  const result = await getChecklistEvidenceCall({
    jobId, ...(evidenceId ? { evidenceId } : { requirementId }), ...(variant === "thumbnail" ? { variant } : {}),
  });
  const { base64, contentType } = result.data || {};
  if (typeof base64 !== "string" || typeof contentType !== "string") {
    throw new Error("Checklist photo is unavailable.");
  }
  return base64ToBlob(base64, contentType);
}

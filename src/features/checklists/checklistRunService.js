import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const createChecklistRunCall = httpsCallable(functions, "createChecklistRun");
const getChecklistRunCall = httpsCallable(functions, "getChecklistRun");
const approveChecklistRunCall = httpsCallable(functions, "approveChecklistRun");
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

/** The manager receives image bytes only through the authorized server callable. */
export async function getChecklistEvidence(jobId, requirementId) {
  const result = await getChecklistEvidenceCall({ jobId, requirementId });
  const { base64, contentType } = result.data || {};
  if (typeof base64 !== "string" || typeof contentType !== "string") {
    throw new Error("Checklist photo is unavailable.");
  }
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: contentType });
}

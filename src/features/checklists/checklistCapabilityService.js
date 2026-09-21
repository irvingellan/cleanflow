import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const getChecklistCapabilityCall = httpsCallable(functions, "getChecklistCapability");
const issueChecklistCapabilityCall = httpsCallable(functions, "issueChecklistCapability");
const revokeChecklistCapabilityCall = httpsCallable(functions, "revokeChecklistCapability");
const publicChecklistApiPath = "/api/public-checklist";
export const publicChecklistRequestTimeoutMilliseconds = 15_000;
export const maximumChecklistEvidenceSizeBytes = 5 * 1024 * 1024;
export const acceptedChecklistEvidenceContentTypes = ["image/jpeg", "image/png", "image/webp"];

export class PublicChecklistRequestError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function buildPublicChecklistUrl(token) {
  return `${window.location.origin}/checklist?t=${encodeURIComponent(token)}`;
}

export async function getChecklistCapability(jobId) {
  const result = await getChecklistCapabilityCall({ jobId });
  return result.data?.capability || { state: "NONE" };
}

export async function issueChecklistCapability({ jobId, cleanerId }) {
  const result = await issueChecklistCapabilityCall({ jobId, cleanerId });
  const token = result.data?.token;
  if (typeof token !== "string" || !token) throw new Error("Checklist capability token is missing.");
  return { capability: result.data.capability, url: buildPublicChecklistUrl(token) };
}

export async function revokeChecklistCapability(jobId) {
  const result = await revokeChecklistCapabilityCall({ jobId });
  return result.data?.capability || { state: "REVOKED" };
}

async function fetchPublicChecklist(input, init = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), publicChecklistRequestTimeoutMilliseconds);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PublicChecklistRequestError("checklist_request_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestPublicChecklist(token) {
  const response = await fetchPublicChecklist(`${publicChecklistApiPath}?${new URLSearchParams({ token })}`, {
    headers: { Accept: "application/json" },
    credentials: "omit",
  });
  let body = {};
  try { body = await response.json(); } catch { /* response status is sufficient */ }
  if (!response.ok) throw new PublicChecklistRequestError(body.error || "checklist_unavailable", response.status);
  if (!body.checklist || typeof body.checklist !== "object" || !body.draft || typeof body.draft !== "object") {
    throw new PublicChecklistRequestError("checklist_unavailable");
  }
  return body;
}

export { requestPublicChecklist as getPublicChecklist };

export function publicChecklistEvidenceUrl(token, requirementId) {
  return `${publicChecklistApiPath}?${new URLSearchParams({ token, evidenceItem: requirementId })}`;
}

export function validateChecklistEvidenceFile(file) {
  if (!file || !acceptedChecklistEvidenceContentTypes.includes(file.type)) {
    throw new PublicChecklistRequestError("checklist_photo_invalid_type");
  }
  if (file.size <= 0 || file.size > maximumChecklistEvidenceSizeBytes) {
    throw new PublicChecklistRequestError("checklist_photo_too_large");
  }
}

export async function uploadPublicChecklistEvidence({ token, requirementId, file }) {
  validateChecklistEvidenceFile(file);
  const response = await fetchPublicChecklist(`${publicChecklistApiPath}?${new URLSearchParams({ token })}`, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      "X-CleanFlow-Checklist-Item": requirementId,
      Accept: "application/json",
    },
    credentials: "omit",
    body: file,
  });
  let body = {};
  try { body = await response.json(); } catch { /* response status maps to a safe generic error */ }
  if (!response.ok) throw new PublicChecklistRequestError(body.error || "checklist_photo_unavailable", response.status);
  if (!Array.isArray(body.evidence)) throw new PublicChecklistRequestError("checklist_photo_unavailable");
  return body;
}

export async function savePublicChecklistDraft({ token, mutationId, baseRevision, changes }) {
  const response = await fetchPublicChecklist(publicChecklistApiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "omit",
    body: JSON.stringify({ token, mutationId, baseRevision, changes }),
  });
  let body = {};
  try { body = await response.json(); } catch { /* status maps to a safe generic error */ }
  if (!response.ok) throw new PublicChecklistRequestError(body.error || "checklist_unavailable", response.status);
  return body;
}

export async function readyPublicChecklistForReview({ token, submissionId, baseRevision }) {
  const response = await fetchPublicChecklist(publicChecklistApiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "omit",
    body: JSON.stringify({ token, action: "READY_FOR_REVIEW", submissionId, baseRevision }),
  });
  let body = {};
  try { body = await response.json(); } catch { /* status maps to a safe generic error */ }
  if (!response.ok) throw new PublicChecklistRequestError(body.error || "checklist_unavailable", response.status);
  if (!body.checklist || typeof body.checklist !== "object" || !body.draft || typeof body.draft !== "object") {
    throw new PublicChecklistRequestError("checklist_unavailable");
  }
  return body;
}

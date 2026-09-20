import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const getChecklistCapabilityCall = httpsCallable(functions, "getChecklistCapability");
const issueChecklistCapabilityCall = httpsCallable(functions, "issueChecklistCapability");
const revokeChecklistCapabilityCall = httpsCallable(functions, "revokeChecklistCapability");
const publicChecklistApiPath = "/api/public-checklist";

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

async function requestPublicChecklist(token) {
  const response = await fetch(`${publicChecklistApiPath}?${new URLSearchParams({ token })}`, {
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

export async function savePublicChecklistDraft({ token, mutationId, baseRevision, changes }) {
  const response = await fetch(publicChecklistApiPath, {
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

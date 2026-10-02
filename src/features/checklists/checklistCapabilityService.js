import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";
import {
  buildPublicChecklistPhotoUploadDiagnostic,
  createPublicChecklistDiagnosticId,
  getPublicChecklistSessionId,
  publicChecklistPhotoFileType,
  publicChecklistPhotoSizeBucket,
  recordPublicChecklistPhotoUploadDiagnostic,
} from "./publicChecklistLoadDiagnostics.js";

const getChecklistCapabilityCall = httpsCallable(functions, "getChecklistCapability");
const issueChecklistCapabilityCall = httpsCallable(functions, "issueChecklistCapability");
const revokeChecklistCapabilityCall = httpsCallable(functions, "revokeChecklistCapability");
const publicChecklistApiPath = "/api/public-checklist";
export const publicChecklistRequestTimeoutMilliseconds = 15_000;
export const maximumChecklistEvidenceSizeBytes = 5 * 1024 * 1024;
export const acceptedChecklistEvidenceContentTypes = ["image/jpeg", "image/png", "image/webp"];

export class PublicChecklistRequestError extends Error {
  constructor(code, status, diagnostics = null, stage = "request", requirements = null, diagnosticCode = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.diagnostics = diagnostics;
    this.stage = stage;
    this.requirements = requirements;
    this.diagnosticCode = diagnosticCode;
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

async function fetchPublicChecklist(input, init = {}, readResponse = async (response) => response) {
  const controller = new AbortController();
  let timeoutId;
  let requestStage = "request";
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new PublicChecklistRequestError("checklist_request_timeout", undefined, null, requestStage));
    }, publicChecklistRequestTimeoutMilliseconds);
  });
  try {
    const request = (async () => {
      const response = await fetch(input, { ...init, signal: controller.signal });
      requestStage = "response-parse";
      return readResponse(response);
    })();
    return await Promise.race([request, deadline]);
  } catch (error) {
    if (controller.signal.aborted && error?.code !== "checklist_request_timeout") {
      throw new PublicChecklistRequestError("checklist_request_timeout", undefined, null, requestStage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readJsonResponse(response) {
  let body = {};
  try {
    body = await response.json();
  } catch {
    throw new PublicChecklistRequestError(
      response.ok || response.status === 422
        ? "checklist_response_invalid"
        : errorCodeForStatus(response.status),
      response.status,
      null,
      "response-parse",
    );
  }
  if (!response.ok) {
    throw new PublicChecklistRequestError(
      body.error || "checklist_unavailable", response.status, body.diagnostics, "request", body.requirements,
    );
  }
  return body;
}

function errorCodeForStatus(status) {
  if (status === 404) return "checklist_not_found";
  if (status === 410) return "checklist_unavailable";
  if (status === 409) return "checklist_conflict";
  if (status === 422) return "checklist_requirements_missing";
  if (status >= 500) return "checklist_request_failed";
  return "checklist_request_invalid";
}

async function requestPublicChecklist(token) {
  const body = await fetchPublicChecklist(`${publicChecklistApiPath}?${new URLSearchParams({ token })}`, {
    headers: {
      Accept: "application/json",
      "X-CleanFlow-Checklist-Session": getPublicChecklistSessionId(),
    },
    credentials: "omit",
  }, readJsonResponse);
  if (!body.checklist || typeof body.checklist !== "object" || !body.draft || typeof body.draft !== "object") {
    throw new PublicChecklistRequestError("checklist_response_invalid", undefined, body.diagnostics);
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

/**
 * Safari/iOS can fail to serialize a disk-backed File directly into fetch()
 * while a page is controlled by a service worker. The cleaner photo limit is
 * only 5 MiB, so materialize the selected file into a bounded in-memory Blob
 * before crossing the network boundary.
 */
export async function prepareChecklistEvidenceUploadBody(file) {
  let timeoutId;
  let bytes;
  try {
    bytes = await Promise.race([
      file.arrayBuffer(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new PublicChecklistRequestError(
          "checklist_request_timeout", undefined, null, "preflight",
        )), publicChecklistRequestTimeoutMilliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
  const body = new Blob([bytes], { type: file.type });
  if (body.size !== file.size) {
    throw new PublicChecklistRequestError("checklist_photo_unavailable");
  }
  return body;
}

export async function uploadPublicChecklistEvidence({ token, requirementId, file }) {
  const startedAt = Date.now();
  const sessionId = getPublicChecklistSessionId();
  const requestId = createPublicChecklistDiagnosticId();
  const diagnosticCode = requestId.slice(-8).toUpperCase();
  const fileType = publicChecklistPhotoFileType(file?.type);
  const sizeBucket = publicChecklistPhotoSizeBucket(file?.size);
  const logPhotoDiagnostic = (result, stage, errorCode = null) => {
    recordPublicChecklistPhotoUploadDiagnostic(buildPublicChecklistPhotoUploadDiagnostic({
      sessionId,
      requestId,
      result,
      durationMs: Date.now() - startedAt,
      fileType,
      sizeBucket,
      stage,
      errorCode,
    }));
  };

  try {
    validateChecklistEvidenceFile(file);
  } catch (error) {
    const errorCode = !file || file.size <= 0 ? "invalid_file"
      : error?.code === "checklist_photo_invalid_type" ? "unsupported_type"
        : error?.code === "checklist_photo_too_large" ? "file_too_large" : "invalid_file";
    logPhotoDiagnostic("error", "preflight", errorCode);
    error.diagnosticCode = diagnosticCode;
    throw error;
  }

  let uploadBody;
  try {
    uploadBody = await prepareChecklistEvidenceUploadBody(file);
  } catch (error) {
    logPhotoDiagnostic("error", "preflight", error?.code === "checklist_request_timeout" ? "timeout" : "invalid_file");
    const uploadError = error instanceof PublicChecklistRequestError
      ? error
      : new PublicChecklistRequestError("checklist_photo_unavailable");
    uploadError.diagnosticCode = diagnosticCode;
    throw uploadError;
  }

  try {
    const body = await fetchPublicChecklist(`${publicChecklistApiPath}?${new URLSearchParams({ token })}`, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        "X-CleanFlow-Checklist-Item": requirementId,
        "X-CleanFlow-Checklist-Session": sessionId,
        "X-CleanFlow-Checklist-Request": requestId,
        Accept: "application/json",
      },
      credentials: "omit",
      body: uploadBody,
    }, async (response) => {
      let result = {};
      try {
        result = await response.json();
      } catch {
        if (response.ok) {
          throw new PublicChecklistRequestError("checklist_response_invalid", response.status, null, "response-parse");
        }
      }
      if (!response.ok) {
        throw new PublicChecklistRequestError("checklist_photo_unavailable", response.status, null, "request");
      }
      return result;
    });
    if (!Array.isArray(body.evidence) || !body.evidence.some((saved) => saved.requirementId === requirementId)) {
      throw new PublicChecklistRequestError("checklist_response_invalid", undefined, null, "response-parse");
    }
    logPhotoDiagnostic("success", "server-confirmed");
    return body;
  } catch (error) {
    const stage = error?.code === "checklist_request_timeout" ? "timeout"
      : error?.stage === "response-parse" ? "response-parse" : "request";
    const errorCode = stage === "timeout" ? "timeout"
      : stage === "response-parse" ? "response_invalid"
        : error?.status ? "server_rejected"
          : error instanceof TypeError ? "network" : "unknown";
    logPhotoDiagnostic("error", stage, errorCode);
    error.diagnosticCode = diagnosticCode;
    throw error;
  }
}

export async function savePublicChecklistDraft({ token, mutationId, baseRevision, changes }) {
  return fetchPublicChecklist(publicChecklistApiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "omit",
    body: JSON.stringify({ token, mutationId, baseRevision, changes }),
  }, readJsonResponse);
}

export async function readyPublicChecklistForReview({ token, submissionId, baseRevision }) {
  const body = await fetchPublicChecklist(publicChecklistApiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "omit",
    body: JSON.stringify({ token, action: "READY_FOR_REVIEW", submissionId, baseRevision }),
  }, readJsonResponse);
  if (!body.checklist || typeof body.checklist !== "object" || !body.draft || typeof body.draft !== "object") {
    throw new PublicChecklistRequestError("checklist_response_invalid");
  }
  return body;
}

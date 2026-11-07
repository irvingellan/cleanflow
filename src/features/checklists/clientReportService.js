import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const getCapabilityCall = httpsCallable(functions, "getClientReportCapability");
const createReportCall = httpsCallable(functions, "createClientReport");
const revokeReportCall = httpsCallable(functions, "revokeClientReport");
const clientReportApiPath = "/api/client-report";
export const clientReportRequestTimeoutMilliseconds = 15_000;

export class ClientReportRequestError extends Error {
  constructor(code, { retryable = true, status = null } = {}) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function reportUrl(token) {
  return `${window.location.origin}/client-report?t=${encodeURIComponent(token)}`;
}

export async function getClientReportCapability(jobId) {
  const result = await getCapabilityCall({ jobId });
  return result.data?.capability || { state: "NONE" };
}

export async function createClientReport(jobId, { replaceExisting = false, presentation } = {}) {
  const result = await createReportCall({ jobId, replaceExisting, ...(presentation ? { presentation } : {}) });
  const data = result.data || {};
  return {
    capability: data.capability || { state: "NONE" },
    created: data.created === true,
    ...(typeof data.token === "string" ? { url: reportUrl(data.token) } : {}),
  };
}

/** Changes the active link's note/notes choice, or records that the manager sent it. Same link. */
export async function updateClientReport(jobId, { presentation, markSent } = {}) {
  const result = await createReportCall({
    jobId, update: true, ...(presentation ? { presentation } : {}), ...(markSent ? { markSent } : {}),
  });
  return result.data?.capability || { state: "NONE" };
}

export async function revokeClientReport(jobId) {
  const result = await revokeReportCall({ jobId });
  return result.data?.capability || { state: "REVOKED" };
}

function clientReportRequestUrl(token, photo = false, evidenceId, thumbnail = false) {
  return `${clientReportApiPath}?${new URLSearchParams({
    token, ...(photo ? { photo: "1" } : {}), ...(evidenceId ? { evidenceId } : {}), ...(thumbnail ? { thumb: "1" } : {}),
  })}`;
}

export function publicClientReportPhotoUrl(token, evidenceId, { thumbnail = false } = {}) {
  return clientReportRequestUrl(token, true, evidenceId, thumbnail);
}

export async function getPublicClientReport(token) {
  const controller = new AbortController();
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ClientReportRequestError("client_report_timeout"));
    }, clientReportRequestTimeoutMilliseconds);
  });
  try {
    const request = (async () => {
      const response = await fetch(clientReportRequestUrl(token), {
        headers: { Accept: "application/json" },
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ClientReportRequestError("client_report_unavailable", {
          retryable: response.status !== 404 && response.status !== 410,
          status: response.status,
        });
      }
      let body;
      try {
        body = await response.json();
      } catch {
        throw new ClientReportRequestError("client_report_response_invalid");
      }
      if (!body?.report || typeof body.report !== "object") {
        throw new ClientReportRequestError("client_report_response_invalid");
      }
      return body.report;
    })();
    return await Promise.race([request, deadline]);
  } catch (error) {
    if (controller.signal.aborted && error?.code !== "client_report_timeout") {
      throw new ClientReportRequestError("client_report_timeout");
    }
    if (error instanceof ClientReportRequestError) throw error;
    throw new ClientReportRequestError("client_report_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

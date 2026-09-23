import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const getCapabilityCall = httpsCallable(functions, "getClientReportCapability");
const createReportCall = httpsCallable(functions, "createClientReport");
const revokeReportCall = httpsCallable(functions, "revokeClientReport");
const clientReportApiPath = "/api/client-report";
export const clientReportRequestTimeoutMilliseconds = 15_000;

export class ClientReportRequestError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function reportUrl(token) {
  return `${window.location.origin}/client-report?t=${encodeURIComponent(token)}`;
}

export async function getClientReportCapability(jobId) {
  const result = await getCapabilityCall({ jobId });
  return result.data?.capability || { state: "NONE" };
}

export async function createClientReport(jobId, { replaceExisting = false } = {}) {
  const result = await createReportCall({ jobId, replaceExisting });
  const data = result.data || {};
  return {
    capability: data.capability || { state: "NONE" },
    created: data.created === true,
    ...(typeof data.token === "string" ? { url: reportUrl(data.token) } : {}),
  };
}

export async function revokeClientReport(jobId) {
  const result = await revokeReportCall({ jobId });
  return result.data?.capability || { state: "REVOKED" };
}

function clientReportRequestUrl(token, photo = false) {
  return `${clientReportApiPath}?${new URLSearchParams({ token, ...(photo ? { photo: "1" } : {}) })}`;
}

export function publicClientReportPhotoUrl(token) {
  return clientReportRequestUrl(token, true);
}

export async function getPublicClientReport(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), clientReportRequestTimeoutMilliseconds);
  try {
    const response = await fetch(clientReportRequestUrl(token), {
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    let body = {};
    try { body = await response.json(); } catch { /* status is enough */ }
    if (!response.ok || !body.report || typeof body.report !== "object") {
      throw new ClientReportRequestError(body.error || "client_report_unavailable");
    }
    return body.report;
  } catch (error) {
    if (error instanceof ClientReportRequestError) throw error;
    throw new ClientReportRequestError(controller.signal.aborted
      ? "client_report_timeout"
      : "client_report_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

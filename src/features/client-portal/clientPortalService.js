import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";
import { ClientReportRequestError, clientReportRequestTimeoutMilliseconds } from "../checklists/clientReportService.js";

const clientPortalAccessCall = httpsCallable(functions, "clientPortalAccess");
const clientPortalApiPath = "/api/client-portal";

/** The manager's view of one client's portal link: get, issue (returns the link once) or revoke. */
async function portalAccess(clientId, action) {
  const result = await clientPortalAccessCall({ clientId, action });
  return result.data?.access || { state: "NONE" };
}

export const getClientPortalAccess = (clientId) => portalAccess(clientId, "get");
export const revokeClientPortalAccess = (clientId) => portalAccess(clientId, "revoke");

export async function issueClientPortalAccess(clientId) {
  const access = await portalAccess(clientId, "issue");
  if (typeof access.token !== "string" || !access.token) throw new Error("Client portal link is missing.");
  const { token, ...state } = access;
  return { ...state, url: clientPortalUrl(token) };
}

export function clientPortalUrl(token, origin = window.location.origin) {
  return `${origin}/portal?${new URLSearchParams({ t: token })}`;
}

function requestUrl(token, parameters = {}) {
  return `${clientPortalApiPath}?${new URLSearchParams({ token, ...parameters })}`;
}

export function publicClientPortalPhotoUrl(token, jobId, evidenceId, { thumbnail = false } = {}) {
  return requestUrl(token, { job: jobId, photo: "1", ...(evidenceId ? { evidenceId } : {}), ...(thumbnail ? { thumb: "1" } : {}) });
}

async function getJson(url, field) {
  const controller = new AbortController();
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ClientReportRequestError("client_report_timeout"));
    }, clientReportRequestTimeoutMilliseconds);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetch(url, {
        headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store",
        referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (!response.ok) {
        throw new ClientReportRequestError("client_report_unavailable", {
          retryable: response.status !== 404 && response.status !== 410, status: response.status,
        });
      }
      const body = await response.json().catch(() => null);
      if (!body?.[field] || typeof body[field] !== "object") throw new ClientReportRequestError("client_report_response_invalid");
      return body[field];
    })()]);
  } finally {
    clearTimeout(timeout);
  }
}

export const getPublicClientPortal = (token) => getJson(requestUrl(token), "portal");
export const getPublicClientPortalReport = (token, jobId) => getJson(requestUrl(token, { job: jobId }), "report");

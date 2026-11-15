import { logger } from "firebase-functions";
import { downloadPublicClientReportPhoto, loadPublicClientReport } from "../clientReportService.js";
import {
  downloadPublicClientPortalPhoto, loadPublicClientPortal, loadPublicClientPortalReport,
} from "../clientPortalService.js";
import { db, organizationId } from "../runtime/firebase.js";
import { configureResponse, hashToken, sendPublicError, validToken } from "../runtime/publicHttp.js";

/** Public client reports are read-only bearer links scoped by their hashed lookup. */
export async function publicClientReport(request, response) {
  if (request.method !== "GET") {
    sendPublicError(response, 405, "client_report_unavailable");
    return;
  }
  const token = request.query.token;
  if (!validToken(token)) {
    sendPublicError(response, 404, "client_report_unavailable");
    return;
  }
  try {
    const tokenHash = hashToken(token);
    if (request.query.photo === "1") {
      const photo = await downloadPublicClientReportPhoto(db, {
        organizationId, tokenHash, evidenceId: request.query.evidenceId,
        variant: request.query.thumb === "1" ? "thumbnail" : undefined,
      });
      configureResponse(response);
      response.set("Content-Type", photo.contentType);
      response.set("Content-Disposition", "inline");
      response.status(200).send(photo.bytes);
      return;
    }
    const report = await loadPublicClientReport(db, { organizationId, tokenHash });
    configureResponse(response);
    response.status(200).json({ report });
  } catch (error) {
    const status = error?.code === "not-found" ? 404
      : error?.code === "failed-precondition" ? 410
        : 500;
    if (status === 500) logger.error("Unable to load public client report.", { code: error?.code || "unknown" });
    sendPublicError(response, status, "client_report_unavailable");
  }
}

/** The client portal is a read-only bearer link scoped to one client by its hashed lookup. */
export async function publicClientPortal(request, response) {
  const token = request.query.token;
  if (request.method !== "GET" || !validToken(token)) {
    sendPublicError(response, request.method !== "GET" ? 405 : 404, "client_portal_unavailable");
    return;
  }
  try {
    const tokenHash = hashToken(token);
    const jobId = request.query.job;
    if (request.query.photo === "1") {
      const photo = await downloadPublicClientPortalPhoto(db, {
        organizationId, tokenHash, jobId, evidenceId: request.query.evidenceId,
        variant: request.query.thumb === "1" ? "thumbnail" : undefined,
      });
      configureResponse(response);
      response.set("Content-Type", photo.contentType);
      response.set("Content-Disposition", "inline");
      response.status(200).send(photo.bytes);
      return;
    }
    const body = jobId === undefined
      ? { portal: await loadPublicClientPortal(db, { organizationId, tokenHash }) }
      : { report: await loadPublicClientPortalReport(db, { organizationId, tokenHash, jobId }) };
    configureResponse(response);
    response.status(200).json(body);
  } catch (error) {
    const status = error?.code === "not-found" ? 404 : error?.code === "failed-precondition" ? 410 : 500;
    if (status === 500) logger.error("Unable to load the client portal.", { code: error?.code || "unknown" });
    sendPublicError(response, status, "client_portal_unavailable");
  }
}

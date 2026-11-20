import { HttpsError } from "firebase-functions/v2/https";
import { requireOrganizationManager } from "../managerAuthorization.js";
import { initialChecklistRunId, validChecklistRunJobId } from "../checklistRunService.js";
import {
  getClientReportCapabilityForManager,
  issueClientReportForManager,
  updateClientReportForManager,
  revokeClientReportForManager,
  setReportPhotoVisibilityForManager,
} from "../clientReportService.js";
import { getClientPortalForManager, issueClientPortalForManager, revokeClientPortalForManager } from "../clientPortalService.js";
import { db } from "../runtime/firebase.js";
import { organizationIdForRequest } from "../runtime/organization.js";
import { hashToken, newChecklistCapabilityToken } from "../runtime/publicHttp.js";

export async function getClientReportCapability(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Client report request is invalid.");
  return {
    capability: await getClientReportCapabilityForManager(db, {
      organizationId, jobId, runId: initialChecklistRunId,
    }),
  };
}

export async function setReportPhotoVisibility(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
  return setReportPhotoVisibilityForManager(db, {
    organizationId, jobId, evidenceId: request.data?.evidenceId, hidden: request.data?.hidden,
    reason: request.data?.reason, actorUid: request.auth.uid,
  });
}

export async function createClientReport(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Client report request is invalid.");
  // The same callable changes how the active link presents the report, or
  // records that the manager sent it herself; nothing is sent from here.
  if (request.data?.update === true) {
    return updateClientReportForManager(db, {
      organizationId,
      jobId,
      runId: initialChecklistRunId,
      actorUid: request.auth.uid,
      presentation: request.data?.presentation,
      markSent: request.data?.markSent,
    });
  }
  const token = newChecklistCapabilityToken();
  return issueClientReportForManager(db, {
    organizationId,
    jobId,
    runId: initialChecklistRunId,
    actorUid: request.auth.uid,
    token,
    tokenHash: hashToken(token),
    replaceExisting: request.data?.replaceExisting === true,
    presentation: request.data?.presentation,
  });
}

export async function revokeClientReport(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Client report request is invalid.");
  return {
    capability: await revokeClientReportForManager(db, {
      organizationId, jobId, runId: initialChecklistRunId,
    }),
  };
}

/**
 * The manager reads, creates (or replaces) and turns off one client's portal
 * link. The link itself is returned only when it is created.
 */
export async function clientPortalAccess(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  const clientId = request.data?.clientId;
  const action = request.data?.action;
  if (action === "issue") {
    const token = newChecklistCapabilityToken();
    return { access: await issueClientPortalForManager(db, {
      organizationId, clientId, actorUid: request.auth.uid, token, tokenHash: hashToken(token),
    }) };
  }
  if (action === "revoke") {
    return { access: await revokeClientPortalForManager(db, { organizationId, clientId, actorUid: request.auth.uid }) };
  }
  if (action !== "get") throw new HttpsError("invalid-argument", "Client portal request is invalid.");
  return { access: await getClientPortalForManager(db, { organizationId, clientId }) };
}

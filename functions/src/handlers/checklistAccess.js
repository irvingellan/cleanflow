import { HttpsError } from "firebase-functions/v2/https";
import { requireOrganizationManager } from "../managerAuthorization.js";
import { loadJobPhotoCounts, validPhotoCountRequest } from "../jobPhotoCounts.js";
import { initialChecklistRunId, validChecklistRunJobId } from "../checklistRunService.js";
import {
  getChecklistCapabilityForManager,
  issueChecklistCapabilityForManager,
  revokeChecklistCapabilityForManager,
  validChecklistCleanerId,
} from "../checklistCapabilityService.js";
import { downloadManagerChecklistEvidence } from "../checklistEvidenceService.js";
import { pilotChecklistPhotoRequirementId } from "../checklistEvidenceDefinition.js";
import { db, isWarmupCall } from "../runtime/firebase.js";
import { organizationIdForRequest } from "../runtime/organization.js";
import { hashToken, newChecklistCapabilityToken } from "../runtime/publicHttp.js";

export async function getChecklistCapability(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  if (isWarmupCall(request)) return { warm: true };
  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) {
    throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
  }
  return {
    capability: await getChecklistCapabilityForManager(db, {
      organizationId,
      jobId,
      runId: initialChecklistRunId,
    }),
  };
}

export async function issueChecklistCapability(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  const jobId = request.data?.jobId;
  const cleanerId = request.data?.cleanerId;
  if (!validChecklistRunJobId(jobId) || !validChecklistCleanerId(cleanerId)) {
    throw new HttpsError("invalid-argument", "Checklist capability request is invalid.");
  }
  const token = newChecklistCapabilityToken();
  return issueChecklistCapabilityForManager(db, {
    organizationId,
    jobId,
    runId: initialChecklistRunId,
    cleanerId,
    actorUid: request.auth.uid,
    token,
    tokenHash: hashToken(token),
  });
}

export async function revokeChecklistCapability(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) {
    throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
  }
  return {
    capability: await revokeChecklistCapabilityForManager(db, {
      organizationId,
      jobId,
      runId: initialChecklistRunId,
      actorUid: request.auth.uid,
    }),
  };
}

// Services list: how many checklist photos each Job has (counts only).
export async function getJobPhotoCounts(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  if (isWarmupCall(request)) return { warm: true };
  const jobIds = request.data?.jobIds;
  if (!validPhotoCountRequest(jobIds)) throw new HttpsError("invalid-argument", "Photo count request is invalid.");
  return loadJobPhotoCounts(db, { organizationId, jobIds });
}

export async function getChecklistEvidence(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  if (isWarmupCall(request)) return { warm: true };
  const jobId = request.data?.jobId;
  const requirementId = request.data?.requirementId;
  const evidenceId = request.data?.evidenceId;
  if (!validChecklistRunJobId(jobId) || (evidenceId === undefined && requirementId !== pilotChecklistPhotoRequirementId)) {
    throw new HttpsError("invalid-argument", "Checklist photo request is invalid.");
  }
  const evidence = await downloadManagerChecklistEvidence(db, {
    organizationId,
    jobId,
    runId: initialChecklistRunId,
    requirementId,
    evidenceId,
    variant: request.data?.variant === "thumbnail" ? "thumbnail" : undefined,
  });
  return { contentType: evidence.contentType, base64: evidence.bytes.toString("base64") };
}

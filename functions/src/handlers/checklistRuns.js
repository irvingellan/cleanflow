import { HttpsError } from "firebase-functions/v2/https";
import { requireOrganizationManager } from "../managerAuthorization.js";
import {
  createChecklistRunForManager,
  approveChecklistRunForManager,
  submitChecklistRunForManager,
  getChecklistRunForManager,
  validChecklistRunJobId,
} from "../checklistRunService.js";
import {
  abandonChecklistRunAndCompleteJobForManager,
  completeJobWithoutChecklistForManager,
} from "../jobCompletionService.js";
import { correctChecklistAnswerForManager } from "../checklistManagerCorrection.js";
import { db, isWarmupCall } from "../runtime/firebase.js";
import { organizationIdForRequest } from "../runtime/organization.js";

export async function createChecklistRun(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);

  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) {
    throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
  }

  return createChecklistRunForManager(db, {
    organizationId,
    jobId,
    actorUid: request.auth.uid,
  });
}

export async function getChecklistRun(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  if (isWarmupCall(request)) return { warm: true };

  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) {
    throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
  }

  return {
    run: await getChecklistRunForManager(db, { organizationId, jobId }),
  };
}

export async function submitChecklistRunForReview(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
  return submitChecklistRunForManager(db, {
    organizationId, jobId, actorUid: request.auth.uid, baseRevision: request.data?.baseRevision,
  });
}

export async function approveChecklistRun(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);

  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) {
    throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
  }

  return approveChecklistRunForManager(db, { organizationId, jobId });
}

export async function completeJobWithoutChecklist(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);

  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) {
    throw new HttpsError("invalid-argument", "Job completion request is invalid.");
  }

  return completeJobWithoutChecklistForManager(db, { organizationId, jobId });
}

export async function abandonChecklistRunAndCompleteJob(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);

  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) {
    throw new HttpsError("invalid-argument", "Job completion request is invalid.");
  }

  return abandonChecklistRunAndCompleteJobForManager(db, {
    organizationId,
    jobId,
    actorUid: request.auth.uid,
  });
}

export async function correctChecklistAnswer(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  const jobId = request.data?.jobId;
  if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
  return correctChecklistAnswerForManager(db, {
    organizationId, jobId, kind: request.data?.kind, itemId: request.data?.itemId,
    answer: request.data?.answer ?? null, actorUid: request.auth.uid,
  });
}

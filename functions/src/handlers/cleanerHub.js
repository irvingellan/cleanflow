import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { requireOrganizationManager } from "../managerAuthorization.js";
import { loadCleanerJobAccess } from "../cleanerJobAccess.js";
import {
  issueCleanerAccessCodeForManager,
  openChecklistForCleaner,
  redeemCleanerAccessCode as redeemCleanerAccessCodeService,
  requireActiveCleaner,
  respondToOfferForCleaner,
  revokeCleanerHubAccessForManager,
} from "../cleanerHubAccess.js";
import { initialChecklistRunId } from "../checklistRunService.js";
import { respondToRescheduleForCleaner } from "../jobScheduleResponseService.js";
import { db, isWarmupCall, organizationId } from "../runtime/firebase.js";
import { hashToken, newChecklistCapabilityToken } from "../runtime/publicHttp.js";

export async function issueCleanerAccessCode(request) {
  await requireOrganizationManager(db, request, organizationId);
  if (request.data?.additionalDevice !== undefined && typeof request.data.additionalDevice !== "boolean") {
    throw new HttpsError("invalid-argument", "The additional device option must be a boolean.");
  }
  return issueCleanerAccessCodeForManager(db, {
    organizationId, cleanerId: request.data?.cleanerId, actorUid: request.auth.uid,
    additionalDevice: request.data?.additionalDevice === true,
  });
}

export async function revokeCleanerHubAccess(request) {
  await requireOrganizationManager(db, request, organizationId);
  return revokeCleanerHubAccessForManager(db, {
    organizationId, cleanerId: request.data?.cleanerId, actorUid: request.auth.uid,
  });
}

/** Unauthenticated by design: the single-use code is the only credential. */
export async function redeemCleanerAccessCode(request) {
  return redeemCleanerAccessCodeService(db, { input: request.data?.code, auth: getAuth(), logger });
}

export async function openMyChecklist(request) {
  const { uid, cleanerId, sessionId } = await requireActiveCleaner(db, request, organizationId);
  if (isWarmupCall(request)) return { warm: true };
  return openChecklistForCleaner(db, {
    organizationId, cleanerId, uid, sessionId, jobId: request.data?.jobId, runId: initialChecklistRunId,
    newToken: newChecklistCapabilityToken, hashToken,
  });
}

/** FB01: access details the manager shared, for the cleaner on the Job only. */
export async function getMyJobAccess(request) {
  const { cleanerId } = await requireActiveCleaner(db, request, organizationId);
  if (isWarmupCall(request)) return { warm: true };
  return loadCleanerJobAccess(db, { organizationId, cleanerId, jobId: request.data?.jobId });
}

export async function respondToMyOffer(request) {
  const { cleanerId, uid, sessionId } = await requireActiveCleaner(db, request, organizationId);
  const result = await respondToOfferForCleaner(db, {
    organizationId, cleanerId, uid, sessionId, jobId: request.data?.jobId, status: request.data?.status,
    scheduleRevision: request.data?.scheduleRevision, offerId: request.data?.offerId,
  });
  return { state: result.state, status: result.status || null };
}

export async function respondToMyReschedule(request) {
  const { cleanerId, uid, sessionId } = await requireActiveCleaner(db, request, organizationId);
  return respondToRescheduleForCleaner(db, {
    organizationId, cleanerId, uid, sessionId, eventId: request.data?.eventId, jobId: request.data?.jobId,
    scheduleRevision: request.data?.scheduleRevision, decision: request.data?.decision,
  });
}

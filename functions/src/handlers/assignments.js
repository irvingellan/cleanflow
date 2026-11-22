import { setJobCleanerSpotsForManager } from "../jobCleanerSpots.js";
import { HttpsError } from "firebase-functions/v2/https";
import { requireOrganizationManager } from "../managerAuthorization.js";
import { validChecklistRunJobId } from "../checklistRunService.js";
import { validChecklistCleanerId } from "../checklistCapabilityService.js";
import { rescheduleJobForManager } from "../jobScheduleService.js";
import { createAutomaticJobOffersForManager } from "../managerAutomaticOffers.js";
import { createManualReplacementOfferForManager } from "../managerManualReplacementOfferService.js";
import { assignCleanerDirectlyForManager, removeAutomaticCleanerAssignmentForManager } from "../managerDirectAssignmentService.js";
import { db, organizationId } from "../runtime/firebase.js";

export async function createAutomaticJobOffers(request) {
  if (!request.auth?.uid || request.auth.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "A non-anonymous account is required.");
  }
  if (process.env.AUTOMATIC_OFFERS_MODE !== "enabled") {
    throw new HttpsError("failed-precondition", "Automatic offer creation is disabled.");
  }
  return createAutomaticJobOffersForManager(db, {
    organizationId,
    actorUid: request.auth.uid,
    jobId: request.data?.jobId,
    cleanerIds: request.data?.cleanerIds,
  });
}

export async function assignCleanerDirectly(request) {
  await requireOrganizationManager(db, request, organizationId);

  const jobId = request.data?.jobId;
  const cleanerId = request.data?.cleanerId;
  if (!validChecklistRunJobId(jobId) || !validChecklistCleanerId(cleanerId)) {
    throw new HttpsError("invalid-argument", "Direct Assignment request is invalid.");
  }

  return assignCleanerDirectlyForManager(db, {
    organizationId,
    jobId,
    cleanerId,
    actorUid: request.auth.uid,
    replacementOfferId: request.data?.replacementOfferId,
  });
}

export async function createManualReplacementOffer(request) {
  await requireOrganizationManager(db, request, organizationId);
  return createManualReplacementOfferForManager(db, {
    organizationId, actorUid: request.auth.uid, jobId: request.data?.jobId,
    cleanerId: request.data?.cleanerId, scheduleRevision: request.data?.scheduleRevision,
  });
}

export async function removeAutomaticCleanerAssignment(request) {
  await requireOrganizationManager(db, request, organizationId);

  return removeAutomaticCleanerAssignmentForManager(db, {
    organizationId,
    jobId: request.data?.jobId,
    assignmentId: request.data?.assignmentId,
    actorUid: request.auth.uid,
  });
}

export async function rescheduleJob(request) {
  await requireOrganizationManager(db, request, organizationId);
  return rescheduleJobForManager(db, {
    organizationId,
    jobId: request.data?.jobId,
    scheduledDate: request.data?.scheduledDate,
    scheduledStart: request.data?.scheduledStart,
    expectedScheduleRevision: request.data?.expectedScheduleRevision,
    actorUid: request.auth.uid,
  });
}

export async function setJobCleanerSpots(request) {
  const uid = request.auth?.uid;
  if (!uid || request.auth.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "A non-anonymous account is required.");
  }
  if (!request.data || Object.keys(request.data).some(key => !["jobId", "count"].includes(key))) {
    throw new HttpsError("invalid-argument", "Only a Job and its spot count may be supplied.");
  }
  return setJobCleanerSpotsForManager(db, {
    organizationId, actorUid: uid, jobId: request.data?.jobId, count: request.data?.count,
  });
}

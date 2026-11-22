import { canonicalManualRecipient, confirmsManualSpot, loadManualConfirmation } from "../manualOfferConfirmation.js";
import { jobScheduleRevision } from "../rescheduleConfirmations.js";
import { offerPayForRecipient } from "../offerPay.js";
import { logger } from "firebase-functions";
import { canUsePublicOffer, hasConfirmedAssignment, publicOfferState as offerState, respondToPublicOffer } from "../publicOfferResponseService.js";
import { FIRST_ACCEPT_WINS, isAutomaticOfferJob } from "../firstAcceptWins.js";
import { validChecklistCleanerId } from "../checklistCapabilityService.js";
import {
  acknowledgePublicOfferAssignment,
  assignmentAcknowledgmentStates,
  loadPublicOfferAssignmentAcknowledgment,
} from "../publicOfferAssignmentAcknowledgment.js";
import { db, organizationId } from "../runtime/firebase.js";
import { configureResponse, hashToken, sendPublicError, validToken } from "../runtime/publicHttp.js";

const supportedCleanerLanguages = new Set(["en", "pt", "es"]);

function isAssignmentAwareJobData(jobData) {
  return Number.isInteger(jobData?.schemaVersion) && jobData.schemaVersion >= 2;
}

function jobReferenceFromOffer(offerDocument) {
  const path = offerDocument.path.split("/");

  if (
    path.length !== 6 ||
    path[0] !== "organizations" ||
    path[1] !== organizationId ||
    path[2] !== "jobs" ||
    path[4] !== "offers"
  ) {
    return null;
  }

  return offerDocument.parent.parent;
}

async function offerReferenceForTokenHash(tokenHash) {
  const offers = await db
    .collectionGroup("offers")
    .where("publicOfferTokenHash", "==", tokenHash)
    .limit(2)
    .get();

  if (offers.size !== 1) {
    return null;
  }

  const offerDocument = offers.docs[0].ref;
  return jobReferenceFromOffer(offerDocument) ? offerDocument : null;
}

export function publicOfferResult(offerData, jobData, {
  assignmentAcknowledgment = null, cleanerPreferredLanguage = null, manualConfirmation = confirmsManualSpot(jobData, offerData),
  confirmedAssignment = false,
} = {}) {
  const now = new Date();
  const ownReceipt = confirmedAssignment && offerData.status === "ACCEPTED" && canUsePublicOffer(jobData) && !offerData.revokedAt
    && offerData.publicOfferExpiresAt?.toMillis?.() > now.getTime();
  const state = ownReceipt ? "available" : offerState(offerData, jobData, now);

  if (state !== "available") {
    return { state };
  }

  const preferredLanguage = supportedCleanerLanguages.has(cleanerPreferredLanguage)
    ? cleanerPreferredLanguage
    : "en";

  const offer = {
    propertyName: jobData.propertyName || null,
    scheduledDate: jobData.scheduledDate || null,
    scheduledStart: jobData.scheduledStart || null,
    status: offerData.status,
    preferredLanguage,
    ...(isAutomaticOfferJob(jobData) && { offerDistributionMode: FIRST_ACCEPT_WINS }),
    ...((isAutomaticOfferJob(jobData) || manualConfirmation || ownReceipt) && {
      confirmationMode: FIRST_ACCEPT_WINS, scheduleRevision: jobScheduleRevision(jobData),
    }),
  };

  const compensation = offerPayForRecipient(offerData, jobData);
  Object.assign(offer, compensation);
  if (Object.values(assignmentAcknowledgmentStates).includes(assignmentAcknowledgment)) {
    offer.assignmentAcknowledgment = assignmentAcknowledgment;
  }
  // Keep the existing legacy wire field for old clients during rollout.
  if (!offerData.offeredPay && !isAssignmentAwareJobData(jobData)) {
    offer.cleanerPayout = compensation.offeredCompensation;
  }

  return {
    state,
    offer,
  };
}

async function loadPublicOffer(token) {
  if (!validToken(token)) {
    return { state: "not-found" };
  }

  const tokenHash = hashToken(token);
  const offerDocument = await offerReferenceForTokenHash(tokenHash);
  const jobDocument = offerDocument && jobReferenceFromOffer(offerDocument);

  if (!offerDocument || !jobDocument) {
    return { state: "not-found" };
  }

  const [jobSnapshot, offerSnapshot] = await Promise.all([
    jobDocument.get(),
    offerDocument.get(),
  ]);

  if (!jobSnapshot.exists || !offerSnapshot.exists) {
    return { state: "not-found" };
  }

  const offerData = offerSnapshot.data();

  if (offerData.publicOfferTokenHash !== tokenHash) {
    return { state: "not-found" };
  }

  const jobData = jobSnapshot.data();
  const cleanerReference = validChecklistCleanerId(offerData.cleanerId)
    ? db.collection("organizations").doc(organizationId).collection("cleaners").doc(offerData.cleanerId)
    : null;
  if (offerData.archivedAt || (jobData.organizationId != null && jobData.organizationId !== organizationId)
    || (offerData.organizationId != null && offerData.organizationId !== organizationId)
    || (offerData.jobId != null && offerData.jobId !== jobDocument.id) || offerData.offerKind
    || (isAutomaticOfferJob(jobData) && (offerData.jobId !== jobDocument.id || offerData.cleanerId !== offerDocument.id))) {
    return { state: "unavailable" };
  }
  const [assignmentAcknowledgment, cleanerSnapshot, manualConfirmation, confirmedAssignment] = await Promise.all([
    loadPublicOfferAssignmentAcknowledgment(db, {
      organizationId,
      jobId: jobDocument.id,
      job: jobData,
      offerId: offerDocument.id,
      offer: offerData,
      tokenHash,
    }),
    cleanerReference ? cleanerReference.get() : Promise.resolve(null),
    canonicalManualRecipient(offerData, offerDocument.id, jobDocument.id, organizationId)
      && !(Array.isArray(jobData.assignedCleanerIds) && jobData.assignedCleanerIds.includes(offerData.cleanerId))
      ? loadManualConfirmation(jobDocument, jobData, offerData, query => query.get()) : false,
    hasConfirmedAssignment({ get: ref => ref.get() }, jobDocument, jobData, offerDocument.id, offerData, organizationId),
  ]);
  const profile = cleanerSnapshot?.data();
  const activeRecipient = profile?.active === true && !profile.archivedAt
    && (profile.organizationId == null || profile.organizationId === organizationId);
  if ((isAutomaticOfferJob(jobData) || confirmedAssignment) && !activeRecipient) {
    return { state: "unavailable" };
  }
  // Historical manual links can still collect interest or decline. Only a
  // current cleaner profile can use a link to take a spot.
  return publicOfferResult(offerData, jobData, {
    assignmentAcknowledgment, manualConfirmation: manualConfirmation && activeRecipient, confirmedAssignment,
    cleanerPreferredLanguage: cleanerSnapshot?.exists
      ? cleanerSnapshot.data().preferredLanguage
      : null,
  });
}

export async function publicOffer(request, response) {
  try {
    if (request.method === "GET") {
      const result = await loadPublicOffer(request.query.token);

      if (result.state === "not-found") {
        sendPublicError(response, 404, "offer_not_found");
        return;
      }

      if (result.state === "expired") {
        sendPublicError(response, 410, "offer_expired");
        return;
      }

      if (result.state === "already-taken") {
        sendPublicError(response, 410, "offer_already_taken");
        return;
      }

      if (result.state === "unavailable") {
        sendPublicError(response, 410, "offer_unavailable");
        return;
      }

      configureResponse(response);
      response.status(200).json({ offer: result.offer });
      return;
    }

    if (request.method !== "POST") {
      sendPublicError(response, 405, "method_not_allowed");
      return;
    }

    const { token, status, action, scheduleRevision } = request.body || {};

    const isAssignmentAcknowledgment = action === "ACKNOWLEDGE_ASSIGNMENT";
    if (!validToken(token) || (!isAssignmentAcknowledgment && !["ACCEPTED", "INTERESTED", "DECLINED"].includes(status))
      || (scheduleRevision !== undefined && (!Number.isSafeInteger(scheduleRevision) || scheduleRevision < 0))) {
      sendPublicError(response, 400, "invalid_request");
      return;
    }

    const tokenHash = hashToken(token);
    const offerDocument = await offerReferenceForTokenHash(tokenHash);
    const jobDocument = offerDocument && jobReferenceFromOffer(offerDocument);

    if (!offerDocument || !jobDocument) {
      sendPublicError(response, 404, "offer_not_found");
      return;
    }

    if (isAssignmentAcknowledgment) {
      const result = await acknowledgePublicOfferAssignment(db, {
        organizationId,
        jobReference: jobDocument,
        offerReference: offerDocument,
        tokenHash,
      });
      if (result.state === "not-found") {
        sendPublicError(response, 404, "offer_not_found");
        return;
      }
      if (result.state === "expired") {
        sendPublicError(response, 410, "offer_expired");
        return;
      }
      if (result.state !== "confirmed") {
        sendPublicError(response, 410, "offer_unavailable");
        return;
      }
      configureResponse(response);
      response.status(200).json({
        assignmentAcknowledgment: assignmentAcknowledgmentStates.confirmed,
      });
      return;
    }

    const result = await respondToPublicOffer(db, {
      organizationId, jobReference: jobDocument, offerReference: offerDocument, tokenHash, status, scheduleRevision,
    });

    if (result.state === "not-found") {
      sendPublicError(response, 404, "offer_not_found");
      return;
    }

    if (result.state === "expired") {
      sendPublicError(response, 410, "offer_expired");
      return;
    }

    if (result.state === "already-taken") {
      sendPublicError(response, 410, "offer_already_taken");
      return;
    }

    if (result.state === "stale-schedule") {
      sendPublicError(response, 409, "offer_stale_schedule");
      return;
    }

    if (result.state === "hub-required") {
      sendPublicError(response, 403, "offer_hub_required");
      return;
    }

    if (result.state === "unavailable") {
      sendPublicError(response, 410, "offer_unavailable");
      return;
    }

    configureResponse(response);
    response.status(200).json({ status: result.status });
  } catch (error) {
    logger.error("Unable to process public offer request.", {
      code: error.code || "unknown",
    });
    sendPublicError(response, 500, "internal_error");
  }
}

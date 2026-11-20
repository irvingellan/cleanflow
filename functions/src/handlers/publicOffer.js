import { offerPayForRecipient } from "../offerPay.js";
import { logger } from "firebase-functions";
import { publicOfferState as offerState, respondToPublicOffer } from "../publicOfferResponseService.js";
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
  assignmentAcknowledgment = null,
  cleanerPreferredLanguage = null,
} = {}) {
  const state = offerState(offerData, jobData, new Date());

  if (state !== "available") {
    return { state };
  }

  const preferredLanguage = supportedCleanerLanguages.has(cleanerPreferredLanguage)
    ? cleanerPreferredLanguage
    : "en";
  if (isAutomaticOfferJob(jobData)) {
    return { state, offer: { offerDistributionMode: FIRST_ACCEPT_WINS, preferredLanguage } };
  }

  const offer = {
    propertyName: jobData.propertyName || null,
    scheduledDate: jobData.scheduledDate || null,
    scheduledStart: jobData.scheduledStart || null,
    status: offerData.status,
    preferredLanguage,
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
  const [assignmentAcknowledgment, cleanerSnapshot] = await Promise.all([
    loadPublicOfferAssignmentAcknowledgment(db, {
      organizationId,
      jobId: jobDocument.id,
      job: jobData,
      offerId: offerDocument.id,
      offer: offerData,
      tokenHash,
    }),
    cleanerReference ? cleanerReference.get() : Promise.resolve(null),
  ]);
  return publicOfferResult(offerData, jobData, {
    assignmentAcknowledgment,
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

    const { token, status, action } = request.body || {};

    const isAssignmentAcknowledgment = action === "ACKNOWLEDGE_ASSIGNMENT";
    if (!validToken(token) || (!isAssignmentAcknowledgment && !["INTERESTED", "DECLINED"].includes(status))) {
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
      organizationId, jobReference: jobDocument, offerReference: offerDocument, tokenHash, status,
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

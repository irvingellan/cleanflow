import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
const organizationId = "cleanflow-demo";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function validToken(token) {
  return typeof token === "string" && tokenPattern.test(token);
}

function configureResponse(response) {
  response.set("Cache-Control", "no-store, private");
  response.set("Referrer-Policy", "no-referrer");
  response.set("X-Content-Type-Options", "nosniff");
}

function sendPublicError(response, status, error) {
  configureResponse(response);
  response.status(status).json({ error });
}

function offerState(offerData, jobData, now) {
  const expiresAt = offerData.publicOfferExpiresAt;

  if (!expiresAt?.toMillis || expiresAt.toMillis() <= now.getTime()) {
    return "expired";
  }

  if (
    jobData.operationalStatus !== "OFFERED" ||
    !["PENDING", "INTERESTED", "DECLINED"].includes(offerData.status)
  ) {
    return "unavailable";
  }

  return "available";
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

function publicOfferResult(offerData, jobData) {
  const state = offerState(offerData, jobData, new Date());

  if (state !== "available") {
    return { state };
  }

  return {
    state,
    offer: {
      propertyName: jobData.propertyName || null,
      scheduledDate: jobData.scheduledDate || null,
      scheduledStart: jobData.scheduledStart || null,
      cleanerPayout: jobData.cleanerPayout ?? null,
      status: offerData.status,
    },
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

  return publicOfferResult(offerData, jobSnapshot.data());
}

export const publicOffer = onRequest(
  { region: "us-central1", invoker: "public" },
  async (request, response) => {
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

      const { token, status } = request.body || {};

      if (!validToken(token) || !["INTERESTED", "DECLINED"].includes(status)) {
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

      const result = await db.runTransaction(async (transaction) => {
        const [jobSnapshot, offerSnapshot] = await Promise.all([
          transaction.get(jobDocument),
          transaction.get(offerDocument),
        ]);

        if (!jobSnapshot.exists || !offerSnapshot.exists) {
          return { state: "not-found" };
        }

        const jobData = jobSnapshot.data();
        const offerData = offerSnapshot.data();

        if (offerData.publicOfferTokenHash !== tokenHash) {
          return { state: "not-found" };
        }

        const state = offerState(offerData, jobData, new Date());

        if (state !== "available") {
          return { state };
        }

        if (offerData.status !== "PENDING") {
          return { state: "answered", status: offerData.status };
        }

        transaction.update(offerDocument, {
          status,
          respondedAt: FieldValue.serverTimestamp(),
        });

        return { state: "answered", status };
      });

      if (result.state === "not-found") {
        sendPublicError(response, 404, "offer_not_found");
        return;
      }

      if (result.state === "expired") {
        sendPublicError(response, 410, "offer_expired");
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
  },
);

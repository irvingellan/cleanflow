import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
const organizationId = "cleanflow-demo";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const githubFeedbackToken = defineSecret("GITHUB_FEEDBACK_TOKEN");
const githubFeedbackRepository = "irvingellan/cleanflow";
const feedbackMessageLimit = 3000;
const feedbackTypes = {
  suggestion: "Suggestion",
  bug: "Problem / Bug",
  other: "Other",
};
const pushDeviceIdPattern = /^[A-Za-z0-9-]{16,80}$/;
const pushTokenMaximumLength = 4096;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function managerPushDeviceDocumentId(uid, deviceId) {
  return createHash("sha256").update(`${uid}:${deviceId}`).digest("hex");
}

function validPushDeviceId(deviceId) {
  return typeof deviceId === "string" && pushDeviceIdPattern.test(deviceId);
}

function validPushToken(token) {
  return typeof token === "string" && token.length >= 32 && token.length <= pushTokenMaximumLength;
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

function optionalContextValue(value, maximumLength) {
  if (typeof value !== "string") {
    return "Not provided";
  }

  const normalizedValue = value.trim().replace(/\s+/g, " ");
  return normalizedValue ? normalizedValue.slice(0, maximumLength) : "Not provided";
}

function normalizedViewport(viewport) {
  const width = Number.isInteger(viewport?.width) ? viewport.width : null;
  const height = Number.isInteger(viewport?.height) ? viewport.height : null;

  if (!width || !height || width < 1 || height < 1 || width > 10000 || height > 10000) {
    return "Not provided";
  }

  return `${width} × ${height}`;
}

function feedbackIssueBody({ type, message, appVersion, screen, viewport, reporter, submittedAt }) {
  return [
    "## Feedback",
    "",
    message,
    "",
    "## Context",
    "",
    `- **Type:** ${feedbackTypes[type]}`,
    `- **App version:** ${appVersion}`,
    `- **Screen:** ${screen}`,
    `- **Submitted at:** ${submittedAt}`,
    `- **Reporter:** ${reporter}`,
    `- **Viewport:** ${viewport}`,
    "- **Source:** CleanFlow in-app feedback",
  ].join("\n");
}

export const submitFeedback = onCall(
  { region: "us-central1", secrets: [githubFeedbackToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const type = request.data?.type;
    const message = typeof request.data?.message === "string" ? request.data.message.trim() : "";

    if (!feedbackTypes[type]) {
      throw new HttpsError("invalid-argument", "Feedback type is invalid.");
    }

    if (!message || message.length > feedbackMessageLimit) {
      throw new HttpsError("invalid-argument", "Feedback message is invalid.");
    }

    const appVersion = optionalContextValue(request.data?.appVersion, 32);
    const screen = optionalContextValue(request.data?.screen, 80);
    const viewport = normalizedViewport(request.data?.viewport);
    const reporter = request.auth.token.email || request.auth.uid;
    const submittedAt = new Date().toISOString();
    const repositoryToken = githubFeedbackToken.value();

    if (!repositoryToken) {
      logger.error("Feedback submission secret is not configured.");
      throw new HttpsError("failed-precondition", "Feedback submission is not configured.");
    }

    const githubResponse = await fetch(
      `https://api.github.com/repos/${githubFeedbackRepository}/issues`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${repositoryToken}`,
          "Content-Type": "application/json",
          "User-Agent": "CleanFlow-Feedback",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title: `[Feedback] ${feedbackTypes[type]} · ${screen}`,
          body: feedbackIssueBody({
            type,
            message,
            appVersion,
            screen,
            viewport,
            reporter,
            submittedAt,
          }),
        }),
      },
    );

    if (!githubResponse.ok) {
      logger.error("GitHub rejected a feedback issue request.", {
        status: githubResponse.status,
        requestId: githubResponse.headers.get("x-github-request-id") || "not-provided",
      });
      throw new HttpsError("internal", "Unable to submit feedback.");
    }

    const issue = await githubResponse.json();
    logger.info("CleanFlow feedback issue created.", { issueNumber: issue.number });

    return { submitted: true };
  },
);

export const registerManagerPushDevice = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const { deviceId, token } = request.data || {};

    if (!validPushDeviceId(deviceId) || !validPushToken(token)) {
      throw new HttpsError("invalid-argument", "Push device registration is invalid.");
    }

    const deviceReference = db
      .collection("managerPushDevices")
      .doc(managerPushDeviceDocumentId(request.auth.uid, deviceId));

    // The device identifier is random and local to this browser. Re-registering updates a refreshed FCM token.
    await db.runTransaction(async (transaction) => {
      const deviceSnapshot = await transaction.get(deviceReference);
      const deviceData = {
        organizationId,
        userId: request.auth.uid,
        token,
        platform: "web",
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
      };

      if (!deviceSnapshot.exists) {
        deviceData.createdAt = FieldValue.serverTimestamp();
      }

      transaction.set(deviceReference, deviceData, { merge: true });
    });

    return { registered: true };
  },
);

async function activeManagerPushDevices() {
  const deviceSnapshots = await db
    .collection("managerPushDevices")
    .where("organizationId", "==", organizationId)
    .get();

  return deviceSnapshots.docs.filter((snapshot) => {
    const device = snapshot.data();
    return device.active === true && validPushToken(device.token);
  });
}

function invalidPushTokenError(error) {
  return [
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
  ].includes(error?.code);
}

async function sendCleanerInterestNotification({ jobId, propertyName, cleanerId, cleanerName, offerId }) {
  const deviceSnapshots = await activeManagerPushDevices();

  if (deviceSnapshots.length === 0) {
    return;
  }

  let currentCleanerName = cleanerName || "A cleaner";

  if (cleanerId) {
    const cleanerSnapshot = await db
      .collection("organizations")
      .doc(organizationId)
      .collection("cleaners")
      .doc(cleanerId)
      .get();

    if (cleanerSnapshot.exists && cleanerSnapshot.data().name) {
      currentCleanerName = cleanerSnapshot.data().name;
    }
  }

  const safePropertyName = propertyName || "a property";
  const responses = await getMessaging().sendEach(
    deviceSnapshots.map((snapshot) => ({
      token: snapshot.data().token,
      data: {
        title: "👤 Cleaner interested",
        body: `${currentCleanerName} is interested in ${safePropertyName}.`,
        eventId: `cleaner-interest-${offerId}`,
        eventType: "CLEANER_INTERESTED",
        jobId,
        link: "/",
      },
      webpush: {
        headers: { Urgency: "high" },
      },
    })),
  );

  const invalidDeviceUpdates = responses.responses.flatMap((response, index) => {
    if (response.success || !invalidPushTokenError(response.error)) {
      return [];
    }

    return [
      deviceSnapshots[index].ref.update({
        active: false,
        invalidatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    ];
  });

  await Promise.all(invalidDeviceUpdates);

  logger.info("Cleaner-interest notifications processed.", {
    attempted: deviceSnapshots.length,
    delivered: responses.successCount,
    invalidated: invalidDeviceUpdates.length,
  });
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
          return { state: "answered", status: offerData.status, shouldNotifyManagers: false };
        }

        transaction.update(offerDocument, {
          status,
          respondedAt: FieldValue.serverTimestamp(),
        });

        return {
          state: "answered",
          status,
          shouldNotifyManagers: status === "INTERESTED",
          jobId: jobDocument.id,
          propertyName: jobData.propertyName || null,
          cleanerId: offerData.cleanerId || null,
          cleanerName: offerData.cleanerName || null,
          offerId: offerDocument.id,
        };
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

      if (result.shouldNotifyManagers) {
        try {
          await sendCleanerInterestNotification(result);
        } catch (error) {
          // The offer response is already committed; a delivery failure must not invite a duplicate response.
          logger.error("Unable to send cleaner-interest notifications.", {
            code: error.code || "unknown",
          });
        }
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

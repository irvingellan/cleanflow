import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret, defineString, projectID } from "firebase-functions/params";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  buildDemoScenario,
  isDemoSeedRecord,
} from "./devCenterData.js";
import { planDemoCleanup } from "./devCenterCleanup.js";
import {
  developerUidsFromSecret,
  isAuthorizedDeveloper,
  requireAuthorizedDeveloper,
} from "./devCenterAuthorization.js";
import { assertDevCenterMutationEnvironment, resolveDevCenterEnvironment, resolveDevCenterProjectId } from "./devCenterSafety.js";
import { buildNotificationDiagnostics } from "./notificationDiagnostics.js";
import {
  reportManagerDeviceHealth,
  sendDeveloperTestNotification as dispatchDeveloperTestNotification,
} from "./notificationLab.js";
import { sendCurrentManagerTestNotification as dispatchCurrentManagerTestNotification } from "./currentDeviceNotificationTest.js";
import {
  buildPublicChecklistPhotoUploadServerEvent,
  normalizePublicChecklistLoadDiagnostic,
  normalizePublicChecklistPhotoUploadDiagnostic,
  publicChecklistPhotoFileType,
  publicChecklistPhotoSizeBucket,
} from "./publicChecklistDiagnostics.js";
import { processChecklistReviewNotification } from "./checklistReviewNotifications.js";
import { requireOrganizationManager } from "./managerAuthorization.js";
import { syncCleanerAgendaForJob } from "./cleanerAgenda.js";
import { loadCleanerJobAccess } from "./cleanerJobAccess.js";
import { recordCleanerJobInboxEvents, recordCleanerOfferInboxEvent } from "./cleanerNotificationEvents.js";
import { createManagerReminderInboxItem, inboxEventId, managerInboxCollection } from "./notificationInboxEvents.js";
import { changeNotificationInboxItemForRequest, listNotificationInboxForRequest } from "./notificationInbox.js";
import { deactivateCleanerDevice, getCleanerDeviceStatus, registerCleanerDevice } from "./cleanerPushDevices.js";
import { awaitCleanerPushTest, cleanerPushOverview, requestCleanerPushTest } from "./cleanerPushTest.js";
import { processCleanerNotification } from "./cleanerPushDelivery.js";
import { resolveCleanerPushMode } from "./cleanerPushPilot.js";
import {
  issueCleanerAccessCodeForManager,
  openChecklistForCleaner,
  redeemCleanerAccessCode as redeemCleanerAccessCodeService,
  requireActiveCleaner,
  respondToOfferForCleaner,
  revokeCleanerHubAccessForManager,
} from "./cleanerHubAccess.js";
import { eligibleManagerPushDevices, loadEligibleManagerPushDevices } from "./managerFcmDelivery.js";
import { registerManagerDevice, deactivateManagerDevice } from "./managerDeviceRegistration.js";
import { sendFcmManagerReminder, processClaimedManagerReminder } from "./managerReminderDelivery.js";
import { processManagerOperationalNotification } from "./managerOperationalNotifications.js";
import { publicOfferState as offerState, respondToPublicOffer } from "./publicOfferResponseService.js";
import { FIRST_ACCEPT_WINS, isAutomaticOfferJob } from "./firstAcceptWins.js";
import {
  createChecklistRunForManager,
  approveChecklistRunForManager,
  submitChecklistRunForManager,
  getChecklistRunForManager,
  initialChecklistRunId,
  validChecklistRunJobId,
} from "./checklistRunService.js";
import {
  getChecklistCapabilityForManager,
  issueChecklistCapabilityForManager,
  loadPublicChecklistCapability,
  readyPublicChecklistForReview,
  revokeChecklistCapabilityForManager,
  savePublicChecklistDraft,
  validChecklistCleanerId,
} from "./checklistCapabilityService.js";
import {
  downloadManagerChecklistEvidence,
  downloadPublicChecklistEvidence,
  loadPublicChecklistEvidenceView,
  uploadPublicChecklistEvidence,
} from "./checklistEvidenceService.js";
import { removePublicChecklistEvidence } from "./checklistMultiPhotoService.js";
import { pilotChecklistPhotoRequirementId } from "./checklistEvidenceDefinition.js";
import { rescheduleJobForManager } from "./jobScheduleService.js";
import { createAutomaticJobOffersForManager } from "./managerAutomaticOffers.js";
import { assignCleanerDirectlyForManager } from "./managerDirectAssignmentService.js";
import {
  abandonChecklistRunAndCompleteJobForManager,
  completeJobWithoutChecklistForManager,
} from "./jobCompletionService.js";
import {
  acknowledgePublicOfferAssignment,
  assignmentAcknowledgmentStates,
  loadPublicOfferAssignmentAcknowledgment,
} from "./publicOfferAssignmentAcknowledgment.js";
import {
  downloadPublicClientReportPhoto,
  getClientReportCapabilityForManager,
  issueClientReportForManager,
  loadPublicClientReport,
  revokeClientReportForManager,
} from "./clientReportService.js";
import {
  calculateManagerReminder,
  claimReminderDelivery,
  managerReminderPayload,
  managerReminderTypes,
  pilotReminderTimezone,
  reminderDeliveryId,
} from "./managerReminders.js";
import {
  dispatchManagerReminder,
  managerReminderProvider,
  requireAvailablePilotReminderTransport,
} from "./managerReminderTransport.js";

// Approved Node22 Policy B; preserve unspecified live configuration.
setGlobalOptions({ preserveExternalChanges: true, maxInstances: 20 });

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

function emulatorPushDisabled() {
  return process.env.FUNCTIONS_EMULATOR === "true" || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
}

function liveMessaging() {
  if (emulatorPushDisabled()) {
    throw new HttpsError("unavailable", "Push transport is disabled in emulators.");
  }
  return getMessaging();
}
const organizationId = "cleanflow-demo";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const supportedCleanerLanguages = new Set(["en", "pt", "es"]);
const githubFeedbackToken = defineSecret("GITHUB_FEEDBACK_TOKEN");
const githubFeedbackRepository = "irvingellan/cleanflow";
const feedbackMessageLimit = 3000;
const feedbackTypes = {
  suggestion: "Suggestion",
  bug: "Problem / Bug",
  other: "Other",
};
const devCenterDeveloperUids = defineSecret("DEV_CENTER_DEVELOPER_UIDS");
const devCenterSandboxProjectId = defineString("DEV_CENTER_SANDBOX_PROJECT_ID", { default: "" });
const managerReminderProviderParam = defineString("MANAGER_REMINDER_PROVIDER", { default: "fcm" });

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function validToken(token) {
  return typeof token === "string" && tokenPattern.test(token);
}

function newChecklistCapabilityToken() {
  return randomBytes(32).toString("base64url");
}

function allowedDeveloperUids() {
  return developerUidsFromSecret(devCenterDeveloperUids.value());
}

function devCenterEnvironmentOptions() {
  return {
    functionsEmulator: process.env.FUNCTIONS_EMULATOR,
    currentProjectId: resolveDevCenterProjectId({ projectIdValue: () => projectID.value(), environment: process.env }),
    sandboxProjectId: devCenterSandboxProjectId.value(),
  };
}

function devCenterEnvironment() {
  return resolveDevCenterEnvironment(devCenterEnvironmentOptions());
}

function organizationReference() {
  return db.collection("organizations").doc(organizationId);
}

async function demoJobCount() {
  const snapshot = await organizationReference()
    .collection("jobs")
    .where("demoSeed", "==", true)
    .count()
    .get();

  return snapshot.data().count;
}

async function clearDemoData({ requireComplete = false } = {}) {
  const organization = organizationReference();
  const records = [];
  for (const kind of ["jobs", "payouts", "properties", "cleaners", "clients"]) {
    const collection = organization.collection(kind);
    const snapshot = await collection.get();
    const visibleIds = new Set(snapshot.docs.map(document => document.id));
    if ((await collection.listDocuments()).some(reference => !visibleIds.has(reference.id))) {
      // Deleted parent documents may still own history. Preserve rather than
      // recursively traversing/deleting orphaned or concurrently added records.
      records.push({ kind, data: {}, survives: true, hasUnknownHistory: true });
    }
    for (const document of snapshot.docs) {
      const record = { kind, id: document.id, ref: document.ref, createTime: document.createTime, updateTime: document.updateTime, data: document.data() };
      records.push(record);
      // Preserve Runs, Assignments, evidence, capabilities and any unrecognized
      // child collection. Surviving parents' children are protection evidence too,
      // even if they carry seed markers. Never recursively remove unknown history.
      for (const collection of await document.ref.listCollections()) {
        const knownHistory = kind === "jobs" && ["offers", "issues", "assignments"].includes(collection.id);
        if (!knownHistory) record.hasUnknownHistory = true;
        const children = await collection.get();
        if (knownHistory) {
          const visibleChildren = new Set(children.docs.map(child => child.id));
          if ((await collection.listDocuments()).some(reference => !visibleChildren.has(reference.id))) record.hasUnknownHistory = true;
        }
        if (children.empty) {
          // A listed collection can contain missing parent docs with descendants.
          record.hasUnknownHistory = true;
          continue;
        }
        for (const child of children.docs) {
          const childRecord = { kind: collection.id, id: child.ref.path, ref: child.ref, createTime: child.createTime, updateTime: child.updateTime, data: child.data() };
          const hasNestedHistory = (await child.ref.listCollections()).length > 0;
          childRecord.survives = !isDemoSeedRecord(record) || kind !== "jobs"
            || !["offers", "issues"].includes(collection.id) || !isDemoSeedRecord(childRecord)
            || childRecord.data.demoSeedBatch !== record.data.demoSeedBatch || hasNestedHistory;
          if (childRecord.survives) record.hasProtectedChildren = true;
          if (hasNestedHistory) childRecord.hasUnknownHistory = true;
          records.push(childRecord);
        }
      }
    }
  }
  const { targets, skippedBatches } = planDemoCleanup(records);
  if (requireComplete && skippedBatches > 0) {
    throw new HttpsError("failed-precondition", "Reset cannot erase protected demo history. Clear only untouched generated batches.");
  }
  for (let start = 0; start < targets.length; start += 400) {
    const batch = db.batch();
    targets.slice(start, start + 400).forEach(({ ref, updateTime }) => batch.delete(ref, { lastUpdateTime: updateTime }));
    await batch.commit();
  }

  return {
    deleted: targets.length,
    skippedBatches,
    demoJobCount: await demoJobCount(),
  };
}

export const getDevCenterAccess = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  async (request) => {
    if (!request.auth || !isAuthorizedDeveloper(request, allowedDeveloperUids())) {
      return { authorized: false };
    }

    return {
      authorized: true,
      environment: devCenterEnvironment(),
      demoJobCount: await demoJobCount(),
    };
  },
);

async function managerEmailsByUserId(userIds) {
  if (userIds.length === 0) return new Map();

  try {
    const emails = new Map();
    for (let start = 0; start < userIds.length; start += 100) {
      const users = await getAuth().getUsers(userIds.slice(start, start + 100).map((uid) => ({ uid })));
      users.users.forEach((user) => emails.set(user.uid, user.email || null));
    }
    return emails;
  } catch (error) {
    logger.warn("Manager notification diagnostics could not resolve account emails.", {
      failureCode: error?.code || "unknown",
    });
    return new Map();
  }
}

export const getManagerNotificationDiagnostics = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  async (request) => {
    requireAuthorizedDeveloper(request, allowedDeveloperUids());

    const deviceSampleLimit = 100;
    const [devicesSnapshot, deliveriesSnapshot] = await Promise.all([
      db.collection("managerPushDevices").where("organizationId", "==", organizationId).limit(deviceSampleLimit).get(),
      organizationReference()
        .collection("managerReminderDeliveries")
        .orderBy("attemptedAt", "desc")
        .limit(20)
        .get(),
    ]);
    const [healthSnapshot, reviewSnapshot, developerTestsSnapshot, currentDeviceTestsSnapshot, cleanerDeliveries] = await Promise.all([
      organizationReference().collection("managerNotificationDeviceHealth").limit(100).get(),
      // The pilot has a small bounded outbox. Avoid a new collection-group index
      // solely for a developer diagnostic; filter to this organization below.
      db.collectionGroup("managerNotificationDeliveries").limit(100).get(),
      organizationReference()
        .collection("developerNotificationTests")
        .orderBy("attemptedAt", "desc")
        .limit(20)
        .get(),
      organizationReference().collection("currentDeviceNotificationTests")
        .orderBy("attemptedAt", "desc").limit(20).get(),
      organizationReference().collection("cleanerNotificationDeliveries")
        .orderBy("recordedAt", "desc").limit(20).get(),
    ]);
    const devices = devicesSnapshot.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));
    const healthReports = healthSnapshot.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));
    const viewerUserId = request.auth.uid;
    const userIds = [...new Set([viewerUserId, ...[...devices, ...healthReports].map(({ data }) => data.userId)])]
      .filter((uid) => typeof uid === "string" && uid.length > 0 && uid.length <= 128 && !uid.includes("/"));
    const [emailsByUserId, eligibleRegistrationIds, latestInbox] = await Promise.all([
      managerEmailsByUserId(userIds),
      eligibleManagerPushDevices(db, organizationId, devicesSnapshot.docs)
        .then((entries) => new Set(entries.map((entry) => entry.id))).catch(() => null),
      listNotificationInboxForRequest(db, { organizationId, request: { auth: request.auth,
        data: { role: "MANAGER", pageSize: 1 } } }).then(({ items }) => ({
          state: items.length ? "available" : "empty", item: items[0],
        })).catch(() => ({ state: "unavailable" })),
    ]);

    return buildNotificationDiagnostics({
      devices,
      deliveries: deliveriesSnapshot.docs.map((snapshot) => ({ data: snapshot.data() })),
      healthReports,
      reviewDeliveries: reviewSnapshot.docs
        .filter((snapshot) => snapshot.ref.path.startsWith(`organizations/${organizationId}/jobs/`))
        .map((snapshot) => ({ data: snapshot.data() }))
        .sort((a, b) => (b.data.createdAt?.toMillis?.() || 0) - (a.data.createdAt?.toMillis?.() || 0))
        .slice(0, 20),
      developerTests: developerTestsSnapshot.docs.map((snapshot) => ({ data: snapshot.data() })),
      currentDeviceTests: currentDeviceTestsSnapshot.docs.map((snapshot) => ({ data: snapshot.data() })),
      cleanerDeliveries: cleanerDeliveries.docs.map((snapshot) => ({ data: snapshot.data() })),
      readMetadata: {
        devices: { readCount: devicesSnapshot.size, returnedCount: devices.length, readCap: deviceSampleLimit, ordering: "unordered" },
        healthReports: { readCount: healthSnapshot.size, returnedCount: healthReports.length, readCap: 100, ordering: "unordered" },
        deliveries: { readCount: deliveriesSnapshot.size, returnedCount: deliveriesSnapshot.size, readCap: 20, ordering: "attemptedAt-desc" },
        reviewDeliveries: { readCount: reviewSnapshot.size,
          returnedCount: Math.min(20, reviewSnapshot.docs.filter((snapshot) => snapshot.ref.path.startsWith(`organizations/${organizationId}/jobs/`)).length),
          readCap: 100, ordering: "unordered-global-sample" },
        developerTests: { readCount: developerTestsSnapshot.size, returnedCount: developerTestsSnapshot.size, readCap: 20, ordering: "attemptedAt-desc" },
        currentDeviceTests: { readCount: currentDeviceTestsSnapshot.size, returnedCount: currentDeviceTestsSnapshot.size, readCap: 20, ordering: "attemptedAt-desc" },
      },
      emailsByUserId,
      eligibleRegistrationIds,
      viewerUserId,
      latestInbox,
    });
  },
);

export const reportManagerNotificationHealth = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
    return reportManagerDeviceHealth({
      database: db,
      organizationId,
      userId: request.auth.uid,
      input: request.data,
    });
  },
);

export const sendDeveloperTestNotification = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  async (request) => {
    requireAuthorizedDeveloper(request, allowedDeveloperUids());
    await requireOrganizationManager(db, request, organizationId);
    const data = request.data;
    if (!data || typeof data !== "object" || Array.isArray(data)
      || Object.keys(data).sort().join(",") !== "confirm,targetRegistrationId") {
      throw new HttpsError("invalid-argument", "Developer notification test request is invalid.");
    }
    return dispatchDeveloperTestNotification({
      database: db,
      organizationId,
      developerUid: request.auth.uid,
      targetRegistrationId: data.targetRegistrationId,
      confirm: data.confirm,
      sendFcm: (message) => liveMessaging().send(message),
      logger,
    });
  },
);

export const sendCurrentManagerTestNotification = onCall(
  { region: "us-central1", timeoutSeconds: 60 },
  async (request) => dispatchCurrentManagerTestNotification({
    database: db,
    organizationId,
    request,
    sendFcm: (message) => liveMessaging().send(message),
    logger,
  }),
);

export const generateDevCenterScenario = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  async (request) => {
    requireAuthorizedDeveloper(request, allowedDeveloperUids());
    try {
      assertDevCenterMutationEnvironment(devCenterEnvironmentOptions());
    } catch (error) {
      throw new HttpsError("failed-precondition", error.message);
    }
    const scenario = request.data?.scenario;
    const batchId = `dev-center-${randomUUID()}`;
    let records;

    try {
      records = buildDemoScenario({
        scenario,
        batch: batchId,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {
      throw new HttpsError("invalid-argument", "Demo scenario is invalid.");
    }

    if (request.data?.resetBaseline === true) {
      await clearDemoData({ requireComplete: true });
    }

    const organization = organizationReference();
    const writeBatch = db.batch();
    (records.clients || [records.client]).forEach((client) => {
      writeBatch.set(organization.collection("clients").doc(client.id), client.data);
    });
    records.properties.forEach((property) => {
      writeBatch.set(organization.collection("properties").doc(property.id), property.data);
    });
    records.cleaners.forEach((cleaner) => {
      writeBatch.set(organization.collection("cleaners").doc(cleaner.id), cleaner.data);
    });
    records.jobs.forEach((job) => {
      writeBatch.set(organization.collection("jobs").doc(job.id), job.data);
    });
    records.offers.forEach((offer) => {
      writeBatch.set(
        organization.collection("jobs").doc(offer.jobId).collection("offers").doc(offer.id),
        offer.data,
      );
    });
    (records.issues || []).forEach((issue) => {
      writeBatch.set(
        organization.collection("jobs").doc(issue.jobId).collection("issues").doc(issue.id),
        issue.data,
      );
    });
    (records.payouts || []).forEach((payout) => {
      writeBatch.set(organization.collection("payouts").doc(payout.id), payout.data);
    });
    await writeBatch.commit();

    logger.info("Dev Center scenario generated.", { scenario, batchId, jobs: records.jobs.length });
    return { demoJobCount: await demoJobCount(), generatedJobCount: records.jobs.length };
  },
);

export const clearDevCenterData = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  async (request) => {
    requireAuthorizedDeveloper(request, allowedDeveloperUids());
    try {
      assertDevCenterMutationEnvironment(devCenterEnvironmentOptions());
    } catch (error) {
      throw new HttpsError("failed-precondition", error.message);
    }
    const result = await clearDemoData();
    logger.info("Dev Center demo data cleared.", result);
    return result;
  },
);

function configureResponse(response) {
  response.set("Cache-Control", "no-store, private");
  response.set("Referrer-Policy", "no-referrer");
  response.set("X-Content-Type-Options", "nosniff");
}

function sendPublicError(response, status, error, diagnostics = null, requirements = null) {
  configureResponse(response);
  response.status(status).json({
    error,
    ...(diagnostics ? { diagnostics } : {}),
    ...(requirements ? { requirements } : {}),
  });
}

function publicChecklistPhotoErrorCategory(error, stage) {
  if (stage === "storage-write") return "storage_write_failed";
  if (stage === "metadata-write") return "metadata_write_failed";
  if (stage === "server-validation") {
    if (error?.code === "already-exists") return "evidence_exists";
    if (error?.code === "not-found" || error?.code === "failed-precondition") return "capability_unavailable";
    if (error?.code === "invalid-argument") return "validation_rejected";
  }
  return "unknown";
}

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

  // The per-cleaner Offer snapshot is authoritative. Versionless/v1 Offers
  // without a snapshot retain the old single-cleaner Job payout fallback; a v2
  // Job-level amount is ambiguous and must never be presented as each cleaner's.
  const hasOfferCompensation = Object.prototype.hasOwnProperty.call(
    offerData,
    "offeredCompensation",
  );
  const legacyFallback = !isAssignmentAwareJobData(jobData)
    ? jobData.cleanerPayout
    : null;
  const offeredCompensation = hasOfferCompensation
    ? offerData.offeredCompensation
    : legacyFallback;
  const safeOfferedCompensation = typeof offeredCompensation === "number" &&
      Number.isFinite(offeredCompensation) && offeredCompensation >= 0
    ? offeredCompensation
    : null;

  offer.offeredCompensation = safeOfferedCompensation;
  if (Object.values(assignmentAcknowledgmentStates).includes(assignmentAcknowledgment)) {
    offer.assignmentAcknowledgment = assignmentAcknowledgment;
  }
  // Keep the existing legacy wire field for old clients during rollout.
  if (!isAssignmentAwareJobData(jobData)) {
    offer.cleanerPayout = safeOfferedCompensation;
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
    await requireOrganizationManager(db, request, organizationId);

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
  async (request) => registerManagerDevice({ database: db, organizationId, request }),
);

export const deactivateManagerPushDevice = onCall(
  { region: "us-central1" },
  async (request) => deactivateManagerDevice({ database: db, organizationId, request }),
);

export const createChecklistRun = onCall(
  { region: "us-central1" },
  async (request) => {
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
  },
);

export const getChecklistRun = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);

    const jobId = request.data?.jobId;
    if (!validChecklistRunJobId(jobId)) {
      throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
    }

    return {
      run: await getChecklistRunForManager(db, { organizationId, jobId }),
    };
  },
);

export const submitChecklistRunForReview = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
    const jobId = request.data?.jobId;
    if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
    return submitChecklistRunForManager(db, {
      organizationId, jobId, actorUid: request.auth.uid, baseRevision: request.data?.baseRevision,
    });
  },
);

export const approveChecklistRun = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);

    const jobId = request.data?.jobId;
    if (!validChecklistRunJobId(jobId)) {
      throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
    }

    return approveChecklistRunForManager(db, { organizationId, jobId });
  },
);

export const createAutomaticJobOffers = onCall(
  { region: "us-central1" },
  async (request) => {
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
  },
);

export const assignCleanerDirectly = onCall(
  { region: "us-central1" },
  async (request) => {
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
    });
  },
);

export const completeJobWithoutChecklist = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);

    const jobId = request.data?.jobId;
    if (!validChecklistRunJobId(jobId)) {
      throw new HttpsError("invalid-argument", "Job completion request is invalid.");
    }

    return completeJobWithoutChecklistForManager(db, { organizationId, jobId });
  },
);

export const abandonChecklistRunAndCompleteJob = onCall(
  { region: "us-central1" },
  async (request) => {
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
  },
);

export const rescheduleJob = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
    return rescheduleJobForManager(db, {
      organizationId,
      jobId: request.data?.jobId,
      scheduledDate: request.data?.scheduledDate,
      scheduledStart: request.data?.scheduledStart,
      actorUid: request.auth.uid,
    });
  },
);

export const getChecklistCapability = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
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
  },
);

export const issueChecklistCapability = onCall(
  { region: "us-central1" },
  async (request) => {
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
  },
);

export const revokeChecklistCapability = onCall(
  { region: "us-central1" },
  async (request) => {
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
  },
);

export const getChecklistEvidence = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
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
    });
    return { contentType: evidence.contentType, base64: evidence.bytes.toString("base64") };
  },
);

export const getClientReportCapability = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
    const jobId = request.data?.jobId;
    if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Client report request is invalid.");
    return {
      capability: await getClientReportCapabilityForManager(db, {
        organizationId, jobId, runId: initialChecklistRunId,
      }),
    };
  },
);

export const createClientReport = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
    const jobId = request.data?.jobId;
    if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Client report request is invalid.");
    const token = newChecklistCapabilityToken();
    return issueClientReportForManager(db, {
      organizationId,
      jobId,
      runId: initialChecklistRunId,
      actorUid: request.auth.uid,
      token,
      tokenHash: hashToken(token),
      replaceExisting: request.data?.replaceExisting === true,
    });
  },
);

export const revokeClientReport = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
    const jobId = request.data?.jobId;
    if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Client report request is invalid.");
    return {
      capability: await revokeClientReportForManager(db, {
        organizationId, jobId, runId: initialChecklistRunId,
      }),
    };
  },
);

async function activeManagerPushDevices(targetOrganizationId = organizationId) {
  return loadEligibleManagerPushDevices(db, targetOrganizationId);
}

export const notifyManagersOperationalEvent = onDocumentCreated(
  {
    document: "organizations/{orgId}/jobs/{jobId}/managerNotificationDeliveries/{eventId}",
    region: "us-central1", retry: false, timeoutSeconds: 60,
  },
  async (event) => {
    if (!event.data) return;
    await processManagerOperationalNotification({
      database: db, deliveryReference: event.data.ref,
      organizationId: event.params.orgId, jobId: event.params.jobId, eventId: event.params.eventId,
      sendFcm: (messages) => liveMessaging().sendEach(messages), logger,
    });
  },
);

export const notifyManagersChecklistReadyForReview = onDocumentCreated(
  {
    document: "organizations/{orgId}/jobs/{jobId}/checklistRuns/{runId}/managerNotificationDeliveries/{eventId}",
    region: "us-central1",
    retry: false,
    timeoutSeconds: 60,
  },
  async (event) => {
    if (!event.data) return;
    const { orgId, jobId, runId, eventId } = event.params;
    await processChecklistReviewNotification({
      database: db,
      deliveryReference: event.data.ref,
      deliveryData: event.data.data(),
      organizationId: orgId,
      jobId,
      runId,
      eventId,
      loadManagerDevices: activeManagerPushDevices,
      sendFcm: (messages) => liveMessaging().sendEach(messages),
      logger,
    });
  },
);

async function sendFcmManagerReminderNotification(reminder) {
  return sendFcmManagerReminder({ database: db, reminder, loadManagerDevices: activeManagerPushDevices,
    sendFcm: (messages) => liveMessaging().sendEach(messages) });
}

function configuredManagerReminderProvider() {
  return managerReminderProvider(managerReminderProviderParam.value());
}

async function claimManagerReminderDelivery(reminder, provider) {
  const deliveryReference = organizationReference()
    .collection("managerReminderDeliveries")
    .doc(reminderDeliveryId(organizationId, reminder));

  // FCM has no idempotency key. Claiming before delivery intentionally favors
  // at-most-once pilot pushes over an automatic retry that could spam managers.
  const claimed = await claimReminderDelivery({
    database: db,
    deliveryReference,
    deliveryData: {
      organizationId,
      reminderType: reminder.type,
      targetDate: reminder.targetDate,
      timezone: reminder.timezone,
      jobCount: reminder.jobCount,
      attentionCount: reminder.attentionCount,
      deliveryProvider: provider,
      deliveryStatus: "SENDING",
      attemptedAt: FieldValue.serverTimestamp(),
    },
  });
  return { claimed, deliveryReference };
}

async function loadManagerReminderJobs(targetDate) {
  const jobsSnapshot = await organizationReference()
    .collection("jobs")
    .where("scheduledDate", "==", targetDate)
    .get();
  return jobsSnapshot.docs.map((snapshot) => snapshot.data());
}

async function calculateCurrentManagerReminder(type, now = new Date()) {
  return calculateManagerReminder({
    type,
    now,
    loadJobsForScheduledDate: loadManagerReminderJobs,
  });
}

export async function processManagerReminderWindow(type, { now = new Date() } = {}) {
  const reminder = await calculateCurrentManagerReminder(type, now);

  if (reminder.jobCount === 0) {
    logger.info("Manager reminder skipped because no operational Jobs are scheduled.", {
      reminderType: type,
      targetDate: reminder.targetDate,
    });
    return { ...reminder, skipped: "no-jobs" };
  }

  const organization = organizationReference();
  const inboxId = inboxEventId("manager-reminder", reminderDeliveryId(organizationId, reminder));
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(organization.collection(managerInboxCollection).doc(inboxId));
    if (!existing.exists) createManagerReminderInboxItem(transaction, organization, reminder, inboxId);
  });

  const provider = configuredManagerReminderProvider();
  requireAvailablePilotReminderTransport(provider);
  const claim = await claimManagerReminderDelivery(reminder, provider);
  if (!claim.claimed) {
    logger.info("Manager reminder skipped because the window was already claimed.", {
      reminderType: type,
      targetDate: reminder.targetDate,
    });
    return { ...reminder, skipped: "already-claimed" };
  }

  return processClaimedManagerReminder({
    ...claim, reminder, logger,
    dispatch: () => dispatchManagerReminder({ provider, reminder, sendFcm: sendFcmManagerReminderNotification }),
  });
}

export const sendTomorrowPlanningReminder = onSchedule(
  {
    schedule: "0 19 * * *",
    timeZone: pilotReminderTimezone,
    region: "us-central1",
  },
  () => processManagerReminderWindow(managerReminderTypes.TOMORROW_19),
);

export const sendTodayExecutionReminder = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: pilotReminderTimezone,
    region: "us-central1",
  },
  () => processManagerReminderWindow(managerReminderTypes.TODAY_07),
);

export const previewManagerReminder = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  async (request) => {
    requireAuthorizedDeveloper(request, allowedDeveloperUids());

    const type = request.data?.type;
    if (!Object.values(managerReminderTypes).includes(type)) {
      throw new HttpsError("invalid-argument", "Reminder type is invalid.");
    }

    const now = request.data?.now ? new Date(request.data.now) : new Date();
    if (Number.isNaN(now.getTime())) {
      throw new HttpsError("invalid-argument", "Reminder preview time is invalid.");
    }

    const reminder = await calculateCurrentManagerReminder(type, now);
    return { reminder, preview: managerReminderPayload(reminder, request.data?.language) };
  },
);

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
  },
);

/**
 * Public checklist reads are bearer-capability lookups. The token alone selects
 * the server-owned record; no caller-supplied organization, Job, or Run ID is trusted.
 */
export const publicChecklist = onRequest(
  { region: "us-central1", invoker: "public", timeoutSeconds: 60 },
  async (request, response) => {
    if (!["GET", "POST", "PUT"].includes(request.method)) {
      sendPublicError(response, 405, "method_not_allowed");
      return;
    }
    let requestStage = "capability-resolution";
    let capabilityStartedAt = null;
    let capabilityDiagnostics = null;
    let photoUploadStartedAt = null;
    let photoUploadContext = null;
    try {
      if (request.method === "POST" && request.body?.action === "PHOTO_UPLOAD_DIAGNOSTIC") {
        const diagnostic = normalizePublicChecklistPhotoUploadDiagnostic(
          request.body?.diagnostic,
          request.get("user-agent") || "",
        );
        if (!diagnostic) {
          sendPublicError(response, 400, "invalid_diagnostic");
          return;
        }
        logger.info("Public checklist photo upload diagnostic.", diagnostic);
        configureResponse(response);
        response.status(204).end();
        return;
      }
      if (request.method === "PUT") {
        requestStage = "evidence-upload";
        photoUploadStartedAt = Date.now();
        photoUploadContext = {
          sessionId: request.get("X-CleanFlow-Checklist-Session"),
          requestId: request.get("X-CleanFlow-Checklist-Request"),
          fileType: publicChecklistPhotoFileType(request.get("Content-Type")),
          sizeBucket: publicChecklistPhotoSizeBucket(request.rawBody?.length),
        };
      }
      if (request.method === "POST" && request.body?.action === "LOAD_DIAGNOSTIC") {
        const diagnostic = normalizePublicChecklistLoadDiagnostic(
          request.body?.diagnostic,
          request.get("user-agent") || "",
        );
        if (!diagnostic) {
          sendPublicError(response, 400, "invalid_diagnostic");
          return;
        }
        logger.info("Public checklist load diagnostic.", diagnostic);
        configureResponse(response);
        response.status(204).end();
        return;
      }

      const token = ["GET", "PUT"].includes(request.method) ? request.query.token : request.body?.token;
      if (!validToken(token)) {
        if (request.method === "PUT" && photoUploadContext && photoUploadStartedAt !== null) {
          logger.info("Public checklist photo upload diagnostic.", buildPublicChecklistPhotoUploadServerEvent({
            ...photoUploadContext,
            result: "error",
            durationMs: Date.now() - photoUploadStartedAt,
            stage: "server-validation",
            errorCode: "capability_unavailable",
            validationReason: "capability_unavailable",
          }, request.get("user-agent") || ""));
        }
        sendPublicError(response, 404, "checklist_not_found");
        return;
      }
      if (request.method === "POST") {
        const action = request.body?.action;
        if (action === "REMOVE_EVIDENCE") {
          requestStage = "evidence-remove";
          const result = await removePublicChecklistEvidence(db, {
            organizationId, tokenHash: hashToken(token), evidenceId: request.body?.evidenceId, mutationId: request.body?.mutationId,
          });
          configureResponse(response);
          response.status(200).json(result);
          return;
        }
        requestStage = action === "READY_FOR_REVIEW" ? "review-submission" : "draft-save";
        if (action && action !== "READY_FOR_REVIEW") {
          sendPublicError(response, 400, "checklist_unavailable");
          return;
        }
        const operation = action === "READY_FOR_REVIEW"
          ? readyPublicChecklistForReview
          : savePublicChecklistDraft;
        const result = await operation(db, {
          organizationId,
          tokenHash: hashToken(token),
          request: action === "READY_FOR_REVIEW"
            ? { submissionId: request.body?.submissionId, baseRevision: request.body?.baseRevision }
            : {
              mutationId: request.body?.mutationId,
              baseRevision: request.body?.baseRevision,
              changes: request.body?.changes,
            },
        });
        configureResponse(response);
        response.status(200).json(result);
        return;
      }
      if (request.method === "PUT") {
        const result = await uploadPublicChecklistEvidence(db, {
          organizationId,
          tokenHash: hashToken(token),
          requirementId: request.get("X-CleanFlow-Checklist-Item"),
          contentType: request.get("Content-Type")?.split(";")[0]?.trim().toLowerCase(),
          bytes: request.rawBody,
        });
        logger.info("Public checklist photo upload diagnostic.", buildPublicChecklistPhotoUploadServerEvent({
          ...photoUploadContext,
          result: "success",
          durationMs: Date.now() - photoUploadStartedAt,
          stage: "server-confirmed",
        }, request.get("user-agent") || ""));
        configureResponse(response);
        response.status(200).json(result);
        return;
      }
      const evidenceItem = request.query.evidenceItem;
      const evidenceId = request.query.evidenceId;
      if ((typeof evidenceItem === "string" && evidenceItem) || evidenceId !== undefined) {
        requestStage = "evidence-download";
        const evidence = await downloadPublicChecklistEvidence(db, {
          organizationId,
          tokenHash: hashToken(token),
          requirementId: evidenceItem,
          evidenceId,
        });
        configureResponse(response);
        response.set("Content-Type", evidence.contentType);
        response.status(200).send(evidence.bytes);
        return;
      }
      requestStage = "capability-resolution";
      capabilityStartedAt = Date.now();
      const result = await loadPublicChecklistCapability(db, {
        organizationId,
        tokenHash: hashToken(token),
      });
      capabilityDiagnostics = result.diagnostics || null;
      if (result.state === "active") {
        requestStage = "evidence-load";
        const evidenceStartedAt = Date.now();
        const evidenceView = await loadPublicChecklistEvidenceView(db, {
          organizationId,
          tokenHash: hashToken(token),
        });
        const diagnostics = {
          ...result.diagnostics,
          evidenceLoadMs: Date.now() - evidenceStartedAt,
          evidenceResult: "loaded",
        };
        const sessionId = request.get("X-CleanFlow-Checklist-Session");
        logger.info("Public checklist backend load completed.", {
          sessionId: /^[A-Fa-f0-9]{36}$/.test(sessionId || "") ? sessionId : null,
          result: "success",
          ...diagnostics,
        });
        configureResponse(response);
        response.status(200).json({ checklist: { ...result.checklist, ...evidenceView }, draft: result.draft, diagnostics });
        return;
      }
      const diagnostics = {
        ...result.diagnostics,
        errorStage: requestStage,
        errorCode: result.state === "not-found" ? "checklist_not_found" : "checklist_unavailable",
      };
      const sessionId = request.get("X-CleanFlow-Checklist-Session");
      logger.info("Public checklist backend load completed.", {
        sessionId: /^[A-Fa-f0-9]{36}$/.test(sessionId || "") ? sessionId : null,
        result: "error",
        ...diagnostics,
      });
      const status = result.state === "expired" || result.state === "revoked" || result.state === "stale"
        ? 410
        : 404;
      sendPublicError(response, status, status === 410 ? "checklist_unavailable" : "checklist_not_found", diagnostics);
    } catch (error) {
      if (requestStage === "evidence-upload" && photoUploadContext && photoUploadStartedAt !== null) {
        const diagnosticStage = ["server-validation", "storage-write", "metadata-write"].includes(error?.checklistPhotoDiagnosticStage)
          ? error.checklistPhotoDiagnosticStage : "unknown";
        logger.info("Public checklist photo upload diagnostic.", buildPublicChecklistPhotoUploadServerEvent({
          ...photoUploadContext,
          result: "error",
          durationMs: Date.now() - photoUploadStartedAt,
          stage: diagnosticStage,
          errorCode: publicChecklistPhotoErrorCategory(error, diagnosticStage),
          validationReason: error?.checklistPhotoValidationReason,
        }, request.get("user-agent") || ""));
      }
      const sessionId = request.get("X-CleanFlow-Checklist-Session");
      const errorCode = ["invalid-argument", "not-found", "failed-precondition", "already-exists", "aborted", "resource-exhausted", "unavailable", "deadline-exceeded"].includes(error?.code)
        ? error.code : "internal";
      const diagnostics = {
        capabilityResolutionMs: capabilityDiagnostics?.capabilityResolutionMs
          ?? (requestStage === "capability-resolution" && capabilityStartedAt !== null ? Date.now() - capabilityStartedAt : null),
        capabilityResult: capabilityDiagnostics?.capabilityResult || (requestStage === "capability-resolution" ? "error" : "unknown"),
        draftLoadMs: capabilityDiagnostics?.draftLoadMs ?? null,
        draftResult: capabilityDiagnostics?.draftResult || "unknown",
        errorStage: requestStage,
        errorCode,
      };
      logger.error("Unable to process public checklist request.", {
        sessionId: /^[A-Fa-f0-9]{36}$/.test(sessionId || "") ? sessionId : null,
        stage: requestStage,
        code: errorCode,
      });
      const hasRequirementGaps = error?.details?.reason === "checklist-requirements-missing";
      const requirements = hasRequirementGaps ? {
        missingChecklistCount: error.details.missingChecklistCount,
        missingInventoryCount: error.details.missingInventoryCount,
        missingPhotoCount: error.details.missingPhotoCount,
        ...(Number.isInteger(error.details.pendingPhotoCount) && error.details.pendingPhotoCount > 0
          ? { pendingPhotoCount: error.details.pendingPhotoCount } : {}),
      } : null;
      const status = hasRequirementGaps ? 422
        : error?.code === "resource-exhausted" ? 413
        : error?.code === "invalid-argument" ? 400
        : error?.code === "not-found" ? 404
          : error?.code === "already-exists" ? 409
            : error?.code === "aborted" ? 409
              : error?.code === "failed-precondition" ? 410
                : 500;
      const publicError = status === 404 ? "checklist_not_found"
        : status === 413 ? "checklist_photo_limit"
        : status === 410 ? "checklist_unavailable"
          : status === 409 ? "checklist_conflict"
            : status === 422 ? "checklist_requirements_missing"
              : status >= 500 ? "checklist_request_failed"
                : "checklist_request_invalid";
      sendPublicError(response, status, publicError, diagnostics, requirements);
    }
  },
);

/** Public client reports are read-only bearer links scoped by their hashed lookup. */
export const publicClientReport = onRequest(
  { region: "us-central1", invoker: "public" },
  async (request, response) => {
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
        const photo = await downloadPublicClientReportPhoto(db, { organizationId, tokenHash, evidenceId: request.query.evidenceId });
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
  },
);

// ---------------------------------------------------------------------------
// Cleaner Hub V1: cleaner identity and the cleaner-safe agenda projection.
// ---------------------------------------------------------------------------

export const issueCleanerAccessCode = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
    if (request.data?.additionalDevice !== undefined && typeof request.data.additionalDevice !== "boolean") {
      throw new HttpsError("invalid-argument", "The additional device option must be a boolean.");
    }
    return issueCleanerAccessCodeForManager(db, {
      organizationId, cleanerId: request.data?.cleanerId, actorUid: request.auth.uid,
      additionalDevice: request.data?.additionalDevice === true,
    });
  },
);

export const revokeCleanerHubAccess = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
    return revokeCleanerHubAccessForManager(db, {
      organizationId, cleanerId: request.data?.cleanerId, actorUid: request.auth.uid,
    });
  },
);

/** Unauthenticated by design: the single-use code is the only credential. */
export const redeemCleanerAccessCode = onCall(
  { region: "us-central1" },
  async (request) => redeemCleanerAccessCodeService(db, { input: request.data?.code, auth: getAuth(), logger }),
);

export const openMyChecklist = onCall(
  { region: "us-central1" },
  async (request) => {
    const { uid, cleanerId, sessionId } = await requireActiveCleaner(db, request, organizationId);
    return openChecklistForCleaner(db, {
      organizationId, cleanerId, uid, sessionId, jobId: request.data?.jobId, runId: initialChecklistRunId,
      newToken: newChecklistCapabilityToken, hashToken,
    });
  },
);

/** FB01: access details the manager shared, for the cleaner on the Job only. */
export const getMyJobAccess = onCall(
  { region: "us-central1" },
  async (request) => {
    const { cleanerId } = await requireActiveCleaner(db, request, organizationId);
    return loadCleanerJobAccess(db, { organizationId, cleanerId, jobId: request.data?.jobId });
  },
);

export const respondToMyOffer = onCall(
  { region: "us-central1" },
  async (request) => {
    const { cleanerId, uid, sessionId } = await requireActiveCleaner(db, request, organizationId);
    const result = await respondToOfferForCleaner(db, {
      organizationId, cleanerId, uid, sessionId, jobId: request.data?.jobId, status: request.data?.status,
    });
    return { state: result.state, status: result.status || null };
  },
);

function requireNotificationInboxEnabled() {
  if (process.env.NOTIFICATION_INBOX_MODE === "disabled") {
    throw new HttpsError("failed-precondition", "The notification inbox is temporarily unavailable.");
  }
}

export const listNotificationInbox = onCall(
  { region: "us-central1" },
  (request) => {
    requireNotificationInboxEnabled();
    return listNotificationInboxForRequest(db, { organizationId, request });
  },
);

export const markNotificationRead = onCall(
  { region: "us-central1" },
  (request) => {
    requireNotificationInboxEnabled();
    return changeNotificationInboxItemForRequest(db, { organizationId, request, open: false });
  },
);

export const openNotificationInboxItem = onCall(
  { region: "us-central1" },
  (request) => {
    requireNotificationInboxEnabled();
    return changeNotificationInboxItemForRequest(db, { organizationId, request, open: true });
  },
);

async function cleanerPushIdentity(request) {
  return { organizationId, ...await requireActiveCleaner(db, request, organizationId) };
}

function cleanerPushMode() {
  const options = devCenterEnvironmentOptions();
  const environment = resolveDevCenterEnvironment({
    ...options, functionsEmulator: emulatorPushDisabled() ? "true" : options.functionsEmulator,
  });
  return resolveCleanerPushMode(process.env.CLEANER_PUSH_MODE, environment, process.env.CLEANER_PUSH_PILOT_RELEASE);
}

export const registerCleanerPushDevice = onCall(
  { region: "us-central1" },
  async (request) => {
    const identity = await cleanerPushIdentity(request);
    return registerCleanerDevice(db, identity, request.data, cleanerPushMode());
  },
);

export const deactivateCleanerPushDevice = onCall(
  { region: "us-central1" },
  async (request) => deactivateCleanerDevice(db, await cleanerPushIdentity(request), request.data),
);

export const getCleanerPushDeviceStatus = onCall(
  { region: "us-central1" },
  async (request) => getCleanerDeviceStatus(db, await cleanerPushIdentity(request), request.data, cleanerPushMode()),
);

/**
 * Test notices. A manager reads the overview or sends a test to all of a
 * cleaner's active phones; a cleaner sends a test to her own phone only.
 */
export const cleanerPushTest = onCall(
  { region: "us-central1" },
  async (request) => {
    const data = request.data;
    if (!data || typeof data !== "object" || Array.isArray(data)
      || !["overview", "send"].includes(data.action)
      || Object.keys(data).some((key) => !["action", "cleanerId"].includes(key))) {
      throw new HttpsError("invalid-argument", "Test notice request is invalid.");
    }
    const mode = cleanerPushMode();
    let requester;
    let target;
    if (request.auth?.token?.cleanerHub) {
      if (data.action !== "send" || data.cleanerId !== undefined) {
        throw new HttpsError("invalid-argument", "A cleaner can only test her own phone.");
      }
      const identity = await cleanerPushIdentity(request);
      requester = { role: "CLEANER", uid: identity.uid };
      target = { cleanerId: identity.cleanerId, targetSessionId: identity.sessionId };
    } else {
      await requireOrganizationManager(db, request, organizationId);
      if (data.action === "overview") {
        return cleanerPushOverview(db, { organizationId, cleanerId: data.cleanerId, mode });
      }
      requester = { role: "MANAGER", uid: request.auth.uid };
      target = { cleanerId: data.cleanerId, targetSessionId: null };
    }
    const stored = await requestCleanerPushTest(db, { organizationId, ...target, requester, mode });
    if (stored.state !== "stored") return stored;
    return awaitCleanerPushTest(db, { organizationId, eventId: stored.eventId });
  },
);

export const notifyCleanerInboxEvent = onDocumentCreated(
  {
    document: "organizations/{orgId}/cleanerNotificationInboxes/{cleanerId}/items/{eventId}",
    region: "us-central1", retry: true, timeoutSeconds: 60,
  },
  async (event) => {
    if (!event.data) return;
    const mode = cleanerPushMode();
    if (mode === "disabled") return;
    await processCleanerNotification({
      database: db, organizationId: event.params.orgId, cleanerId: event.params.cleanerId,
      eventId: event.params.eventId, sendFcm: (messages) => liveMessaging().sendEach(messages), logger, mode,
    });
  },
);

function cleanerAgendaTrigger(document, recordInbox, { deferInitialAutomaticOfferSync = false } = {}) {
  return onDocumentWritten(
    { document, region: "us-central1", retry: true, timeoutSeconds: 60 },
    async (event) => {
      try {
        const context = { organizationId: event.params.orgId, jobId: event.params.jobId };
        const { before, after } = event.data || {};
        // The automatic distribution transaction creates every Offer with a
        // Job update. Its Job trigger reprojects the complete committed batch.
        const jobTriggerOwnsAgenda = deferInitialAutomaticOfferSync
          && before?.exists === false && isAutomaticOfferJob(after?.data());
        await Promise.all([
          jobTriggerOwnsAgenda ? null : syncCleanerAgendaForJob(db, context),
          recordInbox?.(db, {
            ...context, offerId: event.params.offerId, eventId: event.id,
            before, after,
          }),
        ]);
      } catch (error) {
        logger.error("Cleaner agenda sync failed.", { code: error?.code || "unknown" });
        throw error;
      }
    },
  );
}

export const syncCleanerAgendaOnJobWrite = cleanerAgendaTrigger(
  "organizations/{orgId}/jobs/{jobId}", recordCleanerJobInboxEvents,
);
export const syncCleanerAgendaOnAssignmentWrite = cleanerAgendaTrigger(
  "organizations/{orgId}/jobs/{jobId}/assignments/{assignmentId}",
);
export const syncCleanerAgendaOnOfferWrite = cleanerAgendaTrigger(
  "organizations/{orgId}/jobs/{jobId}/offers/{offerId}", recordCleanerOfferInboxEvent,
  { deferInitialAutomaticOfferSync: true },
);
// FB04: the cleaner's card shows the checklist state. A Run status change
// (created, sent for review, closed) and the first saved answer or photo
// re-project the agenda; later saves do not.
export const syncCleanerAgendaOnChecklistRunWrite = cleanerAgendaTrigger(
  "organizations/{orgId}/jobs/{jobId}/checklistRuns/{runId}",
);
export const syncCleanerAgendaOnChecklistStart = onDocumentCreated(
  {
    document: "organizations/{orgId}/jobs/{jobId}/checklistRuns/{runId}/{progressCollection}/current",
    region: "us-central1", retry: true, timeoutSeconds: 60,
  },
  async (event) => {
    if (!["drafts", "evidenceState"].includes(event.params.progressCollection)) return;
    await syncCleanerAgendaForJob(db, { organizationId: event.params.orgId, jobId: event.params.jobId });
  },
);

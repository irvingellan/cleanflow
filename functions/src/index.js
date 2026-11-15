import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { requireAuthorizedDeveloper } from "./devCenterAuthorization.js";
import { resolveDevCenterEnvironment } from "./devCenterSafety.js";
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
import { loadJobPhotoCounts, validPhotoCountRequest } from "./jobPhotoCounts.js";
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
import { loadEligibleManagerPushDevices } from "./managerFcmDelivery.js";
import { sendFcmManagerReminder, processClaimedManagerReminder } from "./managerReminderDelivery.js";
import { processManagerOperationalNotification } from "./managerOperationalNotifications.js";
import { publicOfferState as offerState, respondToPublicOffer } from "./publicOfferResponseService.js";
import { FIRST_ACCEPT_WINS, isAutomaticOfferJob } from "./firstAcceptWins.js";
import {
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
import { respondToRescheduleForCleaner } from "./jobScheduleResponseService.js";
import {
  acknowledgePublicOfferAssignment,
  assignmentAcknowledgmentStates,
  loadPublicOfferAssignmentAcknowledgment,
} from "./publicOfferAssignmentAcknowledgment.js";
import {
  downloadPublicClientReportPhoto,
  getClientReportCapabilityForManager,
  issueClientReportForManager,
  updateClientReportForManager,
  loadPublicClientReport,
  revokeClientReportForManager,
  setReportPhotoVisibilityForManager,
} from "./clientReportService.js";
import { notificationOutcomeLog } from "./notificationOutcomeLog.js";
import {
  downloadPublicClientPortalPhoto, getClientPortalForManager, issueClientPortalForManager,
  loadPublicClientPortal, loadPublicClientPortalReport, revokeClientPortalForManager,
} from "./clientPortalService.js";
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
import {
  devCenterDeveloperUids,
  githubFeedbackToken,
  managerReminderProviderParam,
} from "./runtime/params.js";
import { lazyHandler } from "./runtime/lazy.js";
import { allowedDeveloperUids, devCenterEnvironmentOptions } from "./runtime/devCenter.js";
import {
  db,
  emulatorPushDisabled,
  isWarmupCall,
  liveMessaging,
  organizationId,
  organizationReference,
} from "./runtime/firebase.js";
import {
  configureResponse,
  hashToken,
  newChecklistCapabilityToken,
  sendPublicError,
  validToken,
} from "./runtime/publicHttp.js";

// Approved Node22 Policy B; preserve unspecified live configuration.
setGlobalOptions({ preserveExternalChanges: true, maxInstances: 20 });

// Handler modules load on first use, so a cold instance loads only what its own Function needs.
const devCenter = () => import("./handlers/devCenter.js");
const feedback = () => import("./handlers/feedback.js");
const managerDevices = () => import("./handlers/managerDevices.js");
const checklistRuns = () => import("./handlers/checklistRuns.js");
const assignments = () => import("./handlers/assignments.js");

const supportedCleanerLanguages = new Set(["en", "pt", "es"]);

export const getDevCenterAccess = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  lazyHandler(devCenter, "getDevCenterAccess"),
);

export const getManagerNotificationDiagnostics = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  lazyHandler(devCenter, "getManagerNotificationDiagnostics"),
);

export const reportManagerNotificationHealth = onCall(
  { region: "us-central1" },
  lazyHandler(devCenter, "reportManagerNotificationHealth"),
);

export const sendDeveloperTestNotification = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  lazyHandler(devCenter, "sendDeveloperTestNotification"),
);

export const sendCurrentManagerTestNotification = onCall(
  { region: "us-central1", timeoutSeconds: 60 },
  lazyHandler(devCenter, "sendCurrentManagerTestNotification"),
);

export const generateDevCenterScenario = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  lazyHandler(devCenter, "generateDevCenterScenario"),
);

export const clearDevCenterData = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  lazyHandler(devCenter, "clearDevCenterData"),
);

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

export const submitFeedback = onCall(
  { region: "us-central1", secrets: [githubFeedbackToken] },
  lazyHandler(feedback, "submitFeedback"),
);

export const registerManagerPushDevice = onCall(
  { region: "us-central1" },
  lazyHandler(managerDevices, "registerManagerPushDevice"),
);

export const deactivateManagerPushDevice = onCall(
  { region: "us-central1" },
  lazyHandler(managerDevices, "deactivateManagerPushDevice"),
);

export const createChecklistRun = onCall(
  { region: "us-central1" },
  lazyHandler(checklistRuns, "createChecklistRun"),
);

export const getChecklistRun = onCall(
  { region: "us-central1" },
  lazyHandler(checklistRuns, "getChecklistRun"),
);

export const submitChecklistRunForReview = onCall(
  { region: "us-central1" },
  lazyHandler(checklistRuns, "submitChecklistRunForReview"),
);

export const approveChecklistRun = onCall(
  { region: "us-central1" },
  lazyHandler(checklistRuns, "approveChecklistRun"),
);

export const createAutomaticJobOffers = onCall(
  { region: "us-central1" },
  lazyHandler(assignments, "createAutomaticJobOffers"),
);

export const assignCleanerDirectly = onCall(
  { region: "us-central1" },
  lazyHandler(assignments, "assignCleanerDirectly"),
);

export const createManualReplacementOffer = onCall(
  { region: "us-central1" },
  lazyHandler(assignments, "createManualReplacementOffer"),
);

export const removeAutomaticCleanerAssignment = onCall(
  { region: "us-central1" },
  lazyHandler(assignments, "removeAutomaticCleanerAssignment"),
);

export const completeJobWithoutChecklist = onCall(
  { region: "us-central1" },
  lazyHandler(checklistRuns, "completeJobWithoutChecklist"),
);

export const abandonChecklistRunAndCompleteJob = onCall(
  { region: "us-central1" },
  lazyHandler(checklistRuns, "abandonChecklistRunAndCompleteJob"),
);

export const rescheduleJob = onCall(
  { region: "us-central1" },
  lazyHandler(assignments, "rescheduleJob"),
);

export const getChecklistCapability = onCall(
  { region: "us-central1" },
  async (request) => {
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

// Services list: how many checklist photos each Job has (counts only).
export const getJobPhotoCounts = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
    if (isWarmupCall(request)) return { warm: true };
    const jobIds = request.data?.jobIds;
    if (!validPhotoCountRequest(jobIds)) throw new HttpsError("invalid-argument", "Photo count request is invalid.");
    return loadJobPhotoCounts(db, { organizationId, jobIds });
  },
);

export const getChecklistEvidence = onCall(
  { region: "us-central1" },
  async (request) => {
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

export const setReportPhotoVisibility = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireOrganizationManager(db, request, organizationId);
    const jobId = request.data?.jobId;
    if (!validChecklistRunJobId(jobId)) throw new HttpsError("invalid-argument", "Checklist Run Job is invalid.");
    return setReportPhotoVisibilityForManager(db, {
      organizationId, jobId, evidenceId: request.data?.evidenceId, hidden: request.data?.hidden,
      reason: request.data?.reason, actorUid: request.auth.uid,
    });
  },
);

export const correctChecklistAnswer = onCall(
  { region: "us-central1" },
  lazyHandler(checklistRuns, "correctChecklistAnswer"),
);

export const createClientReport = onCall(
  { region: "us-central1" },
  async (request) => {
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

/**
 * The manager reads, creates (or replaces) and turns off one client's portal
 * link. The link itself is returned only when it is created.
 */
export const clientPortalAccess = onCall(
  { region: "us-central1" },
  async (request) => {
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
    const outcome = await processManagerOperationalNotification({
      database: db, deliveryReference: event.data.ref,
      organizationId: event.params.orgId, jobId: event.params.jobId, eventId: event.params.eventId,
      sendFcm: (messages) => liveMessaging().sendEach(messages), logger,
    });
    logger.info("Manager operational notification processed.", notificationOutcomeLog(outcome));
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

  const outcome = await processClaimedManagerReminder({
    ...claim, reminder, logger,
    dispatch: () => dispatchManagerReminder({ provider, reminder, sendFcm: sendFcmManagerReminderNotification }),
  });
  // The outcome line went missing on 2026-11-04; without it the log cannot say whether a reminder was sent.
  logger.info("Manager reminder delivery processed.", notificationOutcomeLog(outcome));
  return outcome;
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
    if (request.method === "GET" && request.query?.warmup === "1") {
      // Wakes the instance before a cleaner opens a checklist; reads nothing.
      response.set("Cache-Control", "no-store");
      response.status(204).end();
      return;
    }
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
        const photo = await downloadPublicClientReportPhoto(db, {
          organizationId, tokenHash, evidenceId: request.query.evidenceId,
          variant: request.query.thumb === "1" ? "thumbnail" : undefined,
        });
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

/** The client portal is a read-only bearer link scoped to one client by its hashed lookup. */
export const publicClientPortal = onRequest(
  { region: "us-central1", invoker: "public" },
  async (request, response) => {
    const token = request.query.token;
    if (request.method !== "GET" || !validToken(token)) {
      sendPublicError(response, request.method !== "GET" ? 405 : 404, "client_portal_unavailable");
      return;
    }
    try {
      const tokenHash = hashToken(token);
      const jobId = request.query.job;
      if (request.query.photo === "1") {
        const photo = await downloadPublicClientPortalPhoto(db, {
          organizationId, tokenHash, jobId, evidenceId: request.query.evidenceId,
          variant: request.query.thumb === "1" ? "thumbnail" : undefined,
        });
        configureResponse(response);
        response.set("Content-Type", photo.contentType);
        response.set("Content-Disposition", "inline");
        response.status(200).send(photo.bytes);
        return;
      }
      const body = jobId === undefined
        ? { portal: await loadPublicClientPortal(db, { organizationId, tokenHash }) }
        : { report: await loadPublicClientPortalReport(db, { organizationId, tokenHash, jobId }) };
      configureResponse(response);
      response.status(200).json(body);
    } catch (error) {
      const status = error?.code === "not-found" ? 404 : error?.code === "failed-precondition" ? 410 : 500;
      if (status === 500) logger.error("Unable to load the client portal.", { code: error?.code || "unknown" });
      sendPublicError(response, status, "client_portal_unavailable");
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
    if (isWarmupCall(request)) return { warm: true };
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
    if (isWarmupCall(request)) return { warm: true };
    return loadCleanerJobAccess(db, { organizationId, cleanerId, jobId: request.data?.jobId });
  },
);

export const respondToMyOffer = onCall(
  { region: "us-central1" },
  async (request) => {
    const { cleanerId, uid, sessionId } = await requireActiveCleaner(db, request, organizationId);
    const result = await respondToOfferForCleaner(db, {
      organizationId, cleanerId, uid, sessionId, jobId: request.data?.jobId, status: request.data?.status,
      scheduleRevision: request.data?.scheduleRevision, offerId: request.data?.offerId,
    });
    return { state: result.state, status: result.status || null };
  },
);

export const respondToMyReschedule = onCall(
  { region: "us-central1" },
  async (request) => {
    const { cleanerId, uid, sessionId } = await requireActiveCleaner(db, request, organizationId);
    return respondToRescheduleForCleaner(db, {
      organizationId, cleanerId, uid, sessionId, eventId: request.data?.eventId,
      scheduleRevision: request.data?.scheduleRevision, decision: request.data?.decision,
    });
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
    const outcome = await processCleanerNotification({
      database: db, organizationId: event.params.orgId, cleanerId: event.params.cleanerId,
      eventId: event.params.eventId, sendFcm: (messages) => liveMessaging().sendEach(messages), logger, mode,
    });
    logger.info("Cleaner notification processed.", notificationOutcomeLog(outcome));
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

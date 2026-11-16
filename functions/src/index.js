import { logger } from "firebase-functions";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { resolveDevCenterEnvironment } from "./devCenterSafety.js";
import { requireOrganizationManager } from "./managerAuthorization.js";
import { syncCleanerAgendaForJob } from "./cleanerAgenda.js";
import { recordCleanerJobInboxEvents, recordCleanerOfferInboxEvent } from "./cleanerNotificationEvents.js";
import { deactivateCleanerDevice, getCleanerDeviceStatus, registerCleanerDevice } from "./cleanerPushDevices.js";
import { awaitCleanerPushTest, cleanerPushOverview, requestCleanerPushTest } from "./cleanerPushTest.js";
import { processCleanerNotification } from "./cleanerPushDelivery.js";
import { resolveCleanerPushMode } from "./cleanerPushPilot.js";
import {
  requireActiveCleaner,
} from "./cleanerHubAccess.js";
import { isAutomaticOfferJob } from "./firstAcceptWins.js";
import { notificationOutcomeLog } from "./notificationOutcomeLog.js";
import {
  pilotReminderTimezone,
} from "./managerReminders.js";
import {
  devCenterDeveloperUids,
  githubFeedbackToken,
} from "./runtime/params.js";
import { lazyHandler } from "./runtime/lazy.js";
import { devCenterEnvironmentOptions } from "./runtime/devCenter.js";
import {
  db,
  emulatorPushDisabled,
  liveMessaging,
  organizationId,
} from "./runtime/firebase.js";

// Approved Node22 Policy B; preserve unspecified live configuration.
setGlobalOptions({ preserveExternalChanges: true, maxInstances: 20 });

// Handler modules load on first use, so a cold instance loads only what its own Function needs.
const devCenter = () => import("./handlers/devCenter.js");
const feedback = () => import("./handlers/feedback.js");
const managerDevices = () => import("./handlers/managerDevices.js");
const checklistRuns = () => import("./handlers/checklistRuns.js");
const assignments = () => import("./handlers/assignments.js");
const checklistAccess = () => import("./handlers/checklistAccess.js");
const clientReports = () => import("./handlers/clientReports.js");
const managerNotifications = () => import("./handlers/managerNotifications.js");
const publicOfferHandlers = () => import("./handlers/publicOffer.js");
const publicChecklistHandlers = () => import("./handlers/publicChecklist.js");
const publicReports = () => import("./handlers/publicReports.js");
const cleanerHub = () => import("./handlers/cleanerHub.js");
const notificationInbox = () => import("./handlers/notificationInbox.js");

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
  lazyHandler(checklistAccess, "getChecklistCapability"),
);

export const issueChecklistCapability = onCall(
  { region: "us-central1" },
  lazyHandler(checklistAccess, "issueChecklistCapability"),
);

export const revokeChecklistCapability = onCall(
  { region: "us-central1" },
  lazyHandler(checklistAccess, "revokeChecklistCapability"),
);

export const getJobPhotoCounts = onCall(
  { region: "us-central1" },
  lazyHandler(checklistAccess, "getJobPhotoCounts"),
);

export const getChecklistEvidence = onCall(
  { region: "us-central1" },
  lazyHandler(checklistAccess, "getChecklistEvidence"),
);

export const getClientReportCapability = onCall(
  { region: "us-central1" },
  lazyHandler(clientReports, "getClientReportCapability"),
);

export const setReportPhotoVisibility = onCall(
  { region: "us-central1" },
  lazyHandler(clientReports, "setReportPhotoVisibility"),
);

export const correctChecklistAnswer = onCall(
  { region: "us-central1" },
  lazyHandler(checklistRuns, "correctChecklistAnswer"),
);

export const createClientReport = onCall(
  { region: "us-central1" },
  lazyHandler(clientReports, "createClientReport"),
);

export const revokeClientReport = onCall(
  { region: "us-central1" },
  lazyHandler(clientReports, "revokeClientReport"),
);

export const clientPortalAccess = onCall(
  { region: "us-central1" },
  lazyHandler(clientReports, "clientPortalAccess"),
);

export const notifyManagersOperationalEvent = onDocumentCreated(
  {
    document: "organizations/{orgId}/jobs/{jobId}/managerNotificationDeliveries/{eventId}",
    region: "us-central1", retry: false, timeoutSeconds: 60,
  },
  lazyHandler(managerNotifications, "notifyManagersOperationalEvent"),
);

export const notifyManagersChecklistReadyForReview = onDocumentCreated(
  {
    document: "organizations/{orgId}/jobs/{jobId}/checklistRuns/{runId}/managerNotificationDeliveries/{eventId}",
    region: "us-central1",
    retry: false,
    timeoutSeconds: 60,
  },
  lazyHandler(managerNotifications, "notifyManagersChecklistReadyForReview"),
);

export const sendTomorrowPlanningReminder = onSchedule(
  {
    schedule: "0 19 * * *",
    timeZone: pilotReminderTimezone,
    region: "us-central1",
  },
  lazyHandler(managerNotifications, "sendTomorrowPlanningReminder"),
);

export const sendTodayExecutionReminder = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: pilotReminderTimezone,
    region: "us-central1",
  },
  lazyHandler(managerNotifications, "sendTodayExecutionReminder"),
);

export const previewManagerReminder = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  lazyHandler(managerNotifications, "previewManagerReminder"),
);

export const publicOffer = onRequest(
  { region: "us-central1", invoker: "public" },
  lazyHandler(publicOfferHandlers, "publicOffer"),
);

export const publicChecklist = onRequest(
  { region: "us-central1", invoker: "public", timeoutSeconds: 60 },
  lazyHandler(publicChecklistHandlers, "publicChecklist"),
);

export const publicClientReport = onRequest(
  { region: "us-central1", invoker: "public" },
  lazyHandler(publicReports, "publicClientReport"),
);

export const publicClientPortal = onRequest(
  { region: "us-central1", invoker: "public" },
  lazyHandler(publicReports, "publicClientPortal"),
);

// ---------------------------------------------------------------------------
// Cleaner Hub V1: cleaner identity and the cleaner-safe agenda projection.
// ---------------------------------------------------------------------------

export const issueCleanerAccessCode = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerHub, "issueCleanerAccessCode"),
);

export const revokeCleanerHubAccess = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerHub, "revokeCleanerHubAccess"),
);

export const redeemCleanerAccessCode = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerHub, "redeemCleanerAccessCode"),
);

export const openMyChecklist = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerHub, "openMyChecklist"),
);

export const getMyJobAccess = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerHub, "getMyJobAccess"),
);

export const respondToMyOffer = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerHub, "respondToMyOffer"),
);

export const respondToMyReschedule = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerHub, "respondToMyReschedule"),
);

export const listNotificationInbox = onCall(
  { region: "us-central1" },
  lazyHandler(notificationInbox, "listNotificationInbox"),
);

export const markNotificationRead = onCall(
  { region: "us-central1" },
  lazyHandler(notificationInbox, "markNotificationRead"),
);

export const openNotificationInboxItem = onCall(
  { region: "us-central1" },
  lazyHandler(notificationInbox, "openNotificationInboxItem"),
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

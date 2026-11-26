import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { pilotReminderTimezone } from "./managerReminders.js";
import { devCenterDeveloperUids, githubFeedbackToken } from "./runtime/params.js";
import { lazyHandler } from "./runtime/lazy.js";

// Approved Node22 Policy B; preserve unspecified live configuration.
setGlobalOptions({ preserveExternalChanges: true, maxInstances: 20 });

// Handler modules load on first use, so a cold instance loads only what its own Function needs.
const platformOverview = () => import("./handlers/platformOverview.js");
const devCenter = () => import("./handlers/devCenter.js");
const feedback = () => import("./handlers/feedback.js");
const managerDevices = () => import("./handlers/managerDevices.js");
const jobPriceCorrection = () => import("./handlers/jobPriceCorrection.js");
const checklistRuns = () => import("./handlers/checklistRuns.js");
const assignments = () => import("./handlers/assignments.js");
const checklistAccess = () => import("./handlers/checklistAccess.js");
const clientReports = () => import("./handlers/clientReports.js");
const managerNotifications = () => import("./handlers/managerNotifications.js");
const publicOfferHandlers = () => import("./handlers/publicOffer.js");
const publicChecklistHandlers = () => import("./handlers/publicChecklist.js");
const publicReports = () => import("./handlers/publicReports.js");
const cleanerHub = () => import("./handlers/cleanerHub.js");
const propertyAccessPhotos = () => import("./handlers/propertyAccessPhotos.js");
const unavailability = () => import("./handlers/unavailability.js");
const notificationInbox = () => import("./handlers/notificationInbox.js");
const cleanerPush = () => import("./handlers/cleanerPush.js");
const cleanerAgendaTriggers = () => import("./handlers/cleanerAgendaTriggers.js");

export const getDevCenterAccess = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  lazyHandler(devCenter, "getDevCenterAccess"),
);

export const getPlatformOverview = onCall(
  { region: "us-central1", secrets: [devCenterDeveloperUids] },
  lazyHandler(platformOverview, "getPlatformOverview"),
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

export const setJobCleanerSpots = onCall({ region: "us-central1" }, lazyHandler(assignments, "setJobCleanerSpots"));
export const correctJobPrices = onCall({ region: "us-central1" }, lazyHandler(jobPriceCorrection, "correctJobPrices"));

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

export const uploadPropertyAccessPhoto = onCall(
  // Decoding a large phone photo with sharp needs more than the default memory.
  { region: "us-central1", memory: "512MiB" },
  lazyHandler(propertyAccessPhotos, "uploadPropertyAccessPhoto"),
);

export const removePropertyAccessPhoto = onCall(
  { region: "us-central1" },
  lazyHandler(propertyAccessPhotos, "removePropertyAccessPhoto"),
);

export const getPropertyAccessPhoto = onCall(
  { region: "us-central1" },
  lazyHandler(propertyAccessPhotos, "getPropertyAccessPhoto"),
);

export const getMyJobAccessPhoto = onCall(
  { region: "us-central1" },
  lazyHandler(propertyAccessPhotos, "getMyJobAccessPhoto"),
);

export const respondToMyOffer = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerHub, "respondToMyOffer"),
);

export const respondToMyReschedule = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerHub, "respondToMyReschedule"),
);

export const listMyUnavailability = onCall({ region: "us-central1" }, lazyHandler(unavailability, "listMyUnavailability"));
export const setMyUnavailability = onCall({ region: "us-central1" }, lazyHandler(unavailability, "setMyUnavailability"));
export const removeMyUnavailability = onCall({ region: "us-central1" }, lazyHandler(unavailability, "removeMyUnavailability"));
export const setCleanerUnavailability = onCall({ region: "us-central1" }, lazyHandler(unavailability, "setCleanerUnavailability"));
export const removeCleanerUnavailability = onCall({ region: "us-central1" }, lazyHandler(unavailability, "removeCleanerUnavailability"));

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

export const registerCleanerPushDevice = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerPush, "registerCleanerPushDevice"),
);

export const deactivateCleanerPushDevice = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerPush, "deactivateCleanerPushDevice"),
);

export const getCleanerPushDeviceStatus = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerPush, "getCleanerPushDeviceStatus"),
);

export const cleanerPushTest = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerPush, "cleanerPushTest"),
);

export const reportCleanerPushReceipts = onCall(
  { region: "us-central1" },
  lazyHandler(cleanerPush, "reportCleanerPushReceipts"),
);

export const notifyCleanerInboxEvent = onDocumentCreated(
  {
    document: "organizations/{orgId}/cleanerNotificationInboxes/{cleanerId}/items/{eventId}",
    region: "us-central1", retry: true, timeoutSeconds: 60,
  },
  lazyHandler(cleanerPush, "notifyCleanerInboxEvent"),
);

// Builds the trigger declaration only; the handler body lives in handlers/cleanerAgendaTriggers.js.
function cleanerAgendaTrigger(document, handlerName) {
  return onDocumentWritten(
    { document, region: "us-central1", retry: true, timeoutSeconds: 60 },
    lazyHandler(cleanerAgendaTriggers, handlerName),
  );
}

export const syncCleanerAgendaOnJobWrite = cleanerAgendaTrigger(
  "organizations/{orgId}/jobs/{jobId}", "onJobWrite",
);
export const syncCleanerAgendaOnAssignmentWrite = cleanerAgendaTrigger(
  "organizations/{orgId}/jobs/{jobId}/assignments/{assignmentId}", "onAssignmentWrite",
);
export const syncCleanerAgendaOnOfferWrite = cleanerAgendaTrigger(
  "organizations/{orgId}/jobs/{jobId}/offers/{offerId}", "onOfferWrite",
);
// FB04: the cleaner's card shows the checklist state. A Run status change
// (created, sent for review, closed) and the first saved answer or photo
// re-project the agenda; later saves do not.
export const syncCleanerAgendaOnChecklistRunWrite = cleanerAgendaTrigger(
  "organizations/{orgId}/jobs/{jobId}/checklistRuns/{runId}", "onChecklistRunWrite",
);
export const syncCleanerAgendaOnChecklistStart = onDocumentCreated(
  {
    document: "organizations/{orgId}/jobs/{jobId}/checklistRuns/{runId}/{progressCollection}/current",
    region: "us-central1", retry: true, timeoutSeconds: 60,
  },
  lazyHandler(cleanerAgendaTriggers, "onChecklistStart"),
);
// Keeps the cleaner's "cleaning now" progress current as the draft or photos are saved again.
export const syncCleanerAgendaOnChecklistProgress = onDocumentUpdated(
  {
    document: "organizations/{orgId}/jobs/{jobId}/checklistRuns/{runId}/{progressCollection}/current",
    region: "us-central1", retry: true, timeoutSeconds: 60,
  },
  lazyHandler(cleanerAgendaTriggers, "onChecklistStart"),
);

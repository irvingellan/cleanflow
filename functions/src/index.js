import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { resolveDevCenterEnvironment } from "./devCenterSafety.js";
import {
  buildPublicChecklistPhotoUploadServerEvent,
  normalizePublicChecklistLoadDiagnostic,
  normalizePublicChecklistPhotoUploadDiagnostic,
  publicChecklistPhotoFileType,
  publicChecklistPhotoSizeBucket,
} from "./publicChecklistDiagnostics.js";
import { requireOrganizationManager } from "./managerAuthorization.js";
import { syncCleanerAgendaForJob } from "./cleanerAgenda.js";
import { loadCleanerJobAccess } from "./cleanerJobAccess.js";
import { recordCleanerJobInboxEvents, recordCleanerOfferInboxEvent } from "./cleanerNotificationEvents.js";
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
import { isAutomaticOfferJob } from "./firstAcceptWins.js";
import {
  initialChecklistRunId,
} from "./checklistRunService.js";
import {
  loadPublicChecklistCapability,
  readyPublicChecklistForReview,
  savePublicChecklistDraft,
} from "./checklistCapabilityService.js";
import {
  downloadPublicChecklistEvidence,
  loadPublicChecklistEvidenceView,
  uploadPublicChecklistEvidence,
} from "./checklistEvidenceService.js";
import { removePublicChecklistEvidence } from "./checklistMultiPhotoService.js";
import { respondToRescheduleForCleaner } from "./jobScheduleResponseService.js";
import {
  downloadPublicClientReportPhoto,
  loadPublicClientReport,
} from "./clientReportService.js";
import { notificationOutcomeLog } from "./notificationOutcomeLog.js";
import {
  downloadPublicClientPortalPhoto,
  loadPublicClientPortal,
  loadPublicClientPortalReport,
} from "./clientPortalService.js";
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
  isWarmupCall,
  liveMessaging,
  organizationId,
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
const checklistAccess = () => import("./handlers/checklistAccess.js");
const clientReports = () => import("./handlers/clientReports.js");
const managerNotifications = () => import("./handlers/managerNotifications.js");
const publicOfferHandlers = () => import("./handlers/publicOffer.js");

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

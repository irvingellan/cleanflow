import { logger } from "firebase-functions";
import {
  buildPublicChecklistPhotoUploadServerEvent,
  normalizePublicChecklistLoadDiagnostic,
  normalizePublicChecklistPhotoUploadDiagnostic,
  publicChecklistPhotoFileType,
  publicChecklistPhotoSizeBucket,
} from "../publicChecklistDiagnostics.js";
import {
  loadPublicChecklistCapability,
  readyPublicChecklistForReview,
  savePublicChecklistDraft,
} from "../checklistCapabilityService.js";
import {
  downloadPublicChecklistEvidence,
  loadPublicChecklistEvidenceView,
  uploadPublicChecklistEvidence,
} from "../checklistEvidenceService.js";
import { removePublicChecklistEvidence } from "../checklistMultiPhotoService.js";
import { db } from "../runtime/firebase.js";
import { configureResponse, hashToken, sendPublicError, validToken } from "../runtime/publicHttp.js";

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

/**
 * Public checklist reads are bearer-capability lookups. The token alone selects
 * the server-owned record; no caller-supplied organization, Job, or Run ID is trusted.
 */
export async function publicChecklist(request, response) {
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
          tokenHash: hashToken(token), evidenceId: request.body?.evidenceId, mutationId: request.body?.mutationId,
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
      tokenHash: hashToken(token),
    });
    capabilityDiagnostics = result.diagnostics || null;
    if (result.state === "active") {
      requestStage = "evidence-load";
      const evidenceStartedAt = Date.now();
      const evidenceView = await loadPublicChecklistEvidenceView(db, {
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
}

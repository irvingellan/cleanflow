const validSessionId = /^[A-Fa-f0-9]{36}$/;
const validRequestId = /^[A-Fa-f0-9]{36}$/;
const maximumDurationMs = 15 * 60 * 1000;
const browsers = new Set(["edge", "firefox", "chrome", "safari", "other"]);
const platforms = new Set(["ios", "android", "macos", "windows", "linux", "other"]);
const deviceClasses = new Set(["mobile", "desktop"]);
const results = new Set(["success", "error"]);
const capabilityResults = new Set(["active", "not-found", "expired", "revoked", "stale", "error", "unknown"]);
const draftResults = new Set(["loaded", "not-started", "error", "unknown"]);
const errorStages = new Set(["request", "capability-resolution", "draft-load", "evidence-load", "response-parse", "render", "unknown"]);
const errorCodes = new Set([
  "checklist_not_found", "checklist_unavailable", "checklist_request_timeout", "checklist_response_invalid",
  "invalid-argument", "not-found", "failed-precondition", "already-exists",
  "aborted", "unavailable", "deadline-exceeded", "internal", "unknown",
]);
const allowedFields = new Set([
  "sessionId", "routeOpened", "totalReadyMs", "result", "capabilityResolutionMs",
  "capabilityResult", "draftLoadMs", "draftResult", "errorStage", "errorCode", "deviceClass",
]);
const photoFileTypes = new Set(["jpeg", "png", "webp", "heic", "heif", "other", "unknown"]);
const photoSizeBuckets = new Set(["up_to_1mb", "1_to_3mb", "3_to_5mb", "over_5mb", "unknown"]);
const photoStages = new Set([
  "preflight", "request", "server-validation", "storage-write", "metadata-write",
  "response-parse", "timeout", "unknown", "server-confirmed",
]);
const photoErrorCodes = new Set([
  "unsupported_type", "file_too_large", "invalid_file", "network", "timeout",
  "server_rejected", "response_invalid", "validation_rejected", "storage_write_failed",
  "metadata_write_failed", "capability_unavailable", "evidence_exists", "unknown",
]);
const photoAllowedFields = new Set([
  "sessionId", "requestId", "result", "durationMs", "fileType", "sizeBucket", "stage", "errorCode", "deviceClass",
]);

function duration(value) {
  return Number.isInteger(value) && value >= 0 && value <= maximumDurationMs ? value : null;
}

export function coarseChecklistClient(userAgent = "") {
  const browser = /Edg\//i.test(userAgent) ? "edge"
    : /Firefox\//i.test(userAgent) ? "firefox"
      : /Chrome\//i.test(userAgent) ? "chrome"
        : /Safari\//i.test(userAgent) ? "safari" : "other";
  const platform = /iPhone|iPad|iPod/i.test(userAgent) ? "ios"
    : /Android/i.test(userAgent) ? "android"
      : /Mac OS X|Macintosh/i.test(userAgent) ? "macos"
        : /Windows/i.test(userAgent) ? "windows"
          : /Linux/i.test(userAgent) ? "linux" : "other";
  const deviceClass = platform === "ios" || platform === "android" ? "mobile" : "desktop";
  return { browser, platform, deviceClass };
}

export function publicChecklistPhotoFileType(contentType) {
  const value = typeof contentType === "string" ? contentType.toLowerCase().split(";")[0].trim() : "";
  if (value === "image/jpeg") return "jpeg";
  if (value === "image/png") return "png";
  if (value === "image/webp") return "webp";
  if (value === "image/heic") return "heic";
  if (value === "image/heif") return "heif";
  return value ? "other" : "unknown";
}

export function publicChecklistPhotoSizeBucket(size) {
  if (!Number.isFinite(size) || size < 0) return "unknown";
  const megabyte = 1024 * 1024;
  if (size <= megabyte) return "up_to_1mb";
  if (size <= 3 * megabyte) return "1_to_3mb";
  if (size <= 5 * megabyte) return "3_to_5mb";
  return "over_5mb";
}

/** Accepts only bounded, non-operational checklist load metadata for structured logs. */
export function normalizePublicChecklistLoadDiagnostic(input, userAgent = "") {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !allowedFields.has(key))
    || !validSessionId.test(input.sessionId || "")
    || input.routeOpened !== true
    || !results.has(input.result)) return null;

  const client = coarseChecklistClient(userAgent);
  return {
    event: "public_checklist_load",
    sessionId: input.sessionId,
    routeOpened: true,
    totalReadyMs: duration(input.totalReadyMs),
    result: input.result,
    capabilityResolutionMs: duration(input.capabilityResolutionMs),
    capabilityResult: capabilityResults.has(input.capabilityResult) ? input.capabilityResult : "unknown",
    draftLoadMs: duration(input.draftLoadMs),
    draftResult: draftResults.has(input.draftResult) ? input.draftResult : "unknown",
    errorStage: errorStages.has(input.errorStage) ? input.errorStage : null,
    errorCode: errorCodes.has(input.errorCode) ? input.errorCode : null,
    ...client,
    deviceClass: deviceClasses.has(input.deviceClass) ? input.deviceClass : client.deviceClass,
  };
}

function photoDuration(value) {
  return duration(value);
}

function photoClientMetadata(userAgent, requestedDeviceClass) {
  const client = coarseChecklistClient(userAgent);
  return {
    ...client,
    deviceClass: deviceClasses.has(requestedDeviceClass) ? requestedDeviceClass : client.deviceClass,
  };
}

/**
 * Allowlisted browser-side photo failure event. The endpoint never accepts raw
 * error text, filenames, tokens, file bytes, or arbitrary client fields.
 */
export function normalizePublicChecklistPhotoUploadDiagnostic(input, userAgent = "") {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !photoAllowedFields.has(key))
    || !validSessionId.test(input.sessionId || "")
    || !validRequestId.test(input.requestId || "")
    || !results.has(input.result)) return null;

  const client = photoClientMetadata(userAgent, input.deviceClass);
  return {
    event: "public_checklist_photo_upload",
    source: "client",
    sessionId: input.sessionId,
    requestId: input.requestId,
    result: input.result,
    durationMs: photoDuration(input.durationMs),
    fileType: photoFileTypes.has(input.fileType) ? input.fileType : "unknown",
    sizeBucket: photoSizeBuckets.has(input.sizeBucket) ? input.sizeBucket : "unknown",
    stage: photoStages.has(input.stage) ? input.stage : "unknown",
    errorCode: photoErrorCodes.has(input.errorCode) ? input.errorCode : null,
    ...client,
  };
}

/** Builds a structured event only from server-derived upload facts and safe headers. */
export function buildPublicChecklistPhotoUploadServerEvent({
  sessionId,
  requestId,
  result,
  durationMs,
  fileType,
  sizeBucket,
  stage,
  errorCode = null,
}, userAgent = "") {
  const client = coarseChecklistClient(userAgent);
  return {
    event: "public_checklist_photo_upload",
    source: "server",
    sessionId: validSessionId.test(sessionId || "") ? sessionId : null,
    requestId: validRequestId.test(requestId || "") ? requestId : null,
    result: results.has(result) ? result : "error",
    durationMs: photoDuration(durationMs),
    fileType: photoFileTypes.has(fileType) ? fileType : "unknown",
    sizeBucket: photoSizeBuckets.has(sizeBucket) ? sizeBucket : "unknown",
    stage: photoStages.has(stage) ? stage : "unknown",
    errorCode: photoErrorCodes.has(errorCode) ? errorCode : null,
    ...client,
  };
}

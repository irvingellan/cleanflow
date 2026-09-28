const sessionStorageKey = "cleanflow-public-checklist-session-v1";
const diagnosticPath = "/api/public-checklist";
let inMemorySessionId = null;
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

export function createPublicChecklistDiagnosticId(environment = globalThis) {
  const bytes = new Uint8Array(18);
  try {
    if (environment.crypto?.getRandomValues) {
      environment.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* diagnostic IDs are correlation hints, not authorization material */ }
  return Array.from(bytes, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
}

export function getPublicChecklistSessionId(options = {}) {
  let storage = options.storage;
  if (!Object.hasOwn(options, "storage")) {
    try { storage = globalThis.sessionStorage; } catch { storage = null; }
  }
  const environment = options.environment || globalThis;
  if (!storage && inMemorySessionId) return inMemorySessionId;
  try {
    const current = storage?.getItem(sessionStorageKey);
    if (typeof current === "string" && /^[A-Fa-f0-9]{36}$/.test(current)) return current;
    const created = createPublicChecklistDiagnosticId(environment);
    storage?.setItem(sessionStorageKey, created);
    inMemorySessionId = created;
    return created;
  } catch {
    inMemorySessionId ||= createPublicChecklistDiagnosticId(environment);
    return inMemorySessionId;
  }
}

export function publicChecklistClientClass(navigatorValue = globalThis.navigator) {
  const userAgent = navigatorValue?.userAgent || "";
  const platform = /iPhone|iPad|iPod/i.test(userAgent) ? "ios"
    : /Android/i.test(userAgent) ? "android"
      : /Mac OS X|Macintosh/i.test(userAgent) ? "macos"
        : /Windows/i.test(userAgent) ? "windows"
          : /Linux/i.test(userAgent) ? "linux" : "other";
  const browser = /Edg\//i.test(userAgent) ? "edge"
    : /Firefox\//i.test(userAgent) ? "firefox"
      : /Chrome\//i.test(userAgent) ? "chrome"
        : /Safari\//i.test(userAgent) ? "safari" : "other";
  const isMobile = navigatorValue?.userAgentData?.mobile === true
    || platform === "ios" || platform === "android"
    || (platform === "macos" && Number(navigatorValue?.maxTouchPoints) > 1);
  return { browser, platform, deviceClass: isMobile ? "mobile" : "desktop" };
}

export function buildPublicChecklistLoadDiagnostic({
  sessionId,
  totalReadyMs,
  result,
  capabilityResolutionMs = null,
  capabilityResult = "unknown",
  draftLoadMs = null,
  draftResult = "unknown",
  errorStage = null,
  errorCode = null,
  client = publicChecklistClientClass(),
}) {
  return {
    sessionId,
    routeOpened: true,
    totalReadyMs: Math.max(0, Math.round(totalReadyMs)),
    result,
    capabilityResolutionMs,
    capabilityResult,
    draftLoadMs,
    draftResult,
    errorStage,
    errorCode,
    ...client,
  };
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

export function buildPublicChecklistPhotoUploadDiagnostic({
  sessionId,
  requestId,
  result,
  durationMs,
  fileType,
  sizeBucket,
  stage,
  errorCode = null,
  client = publicChecklistClientClass(),
}) {
  return {
    sessionId,
    requestId,
    result,
    durationMs: Math.max(0, Math.round(durationMs)),
    fileType: photoFileTypes.has(fileType) ? fileType : "unknown",
    sizeBucket: photoSizeBuckets.has(sizeBucket) ? sizeBucket : "unknown",
    stage: photoStages.has(stage) ? stage : "unknown",
    errorCode: photoErrorCodes.has(errorCode) ? errorCode : null,
    deviceClass: client.deviceClass,
  };
}

/** Fire-and-forget diagnostic; it contains no capability token or checklist data. */
export function recordPublicChecklistLoadDiagnostic(event, fetcher = globalThis.fetch) {
  if (typeof fetcher !== "function") return;
  try {
    void fetcher(diagnosticPath, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({ action: "LOAD_DIAGNOSTIC", diagnostic: event }),
    }).catch(() => undefined);
  } catch {
    // Diagnostics never affect the cleaner experience.
  }
}

/** Fire-and-forget photo diagnostics; the event intentionally has no token or file data. */
export function recordPublicChecklistPhotoUploadDiagnostic(event, fetcher = globalThis.fetch) {
  if (typeof fetcher !== "function") return;
  try {
    void fetcher(diagnosticPath, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({ action: "PHOTO_UPLOAD_DIAGNOSTIC", diagnostic: event }),
    }).catch(() => undefined);
  } catch {
    // Diagnostics never affect the cleaner experience, especially while offline.
  }
}

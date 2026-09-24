const validSessionId = /^[A-Fa-f0-9]{36}$/;
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

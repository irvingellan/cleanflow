const sessionStorageKey = "cleanflow-public-checklist-session-v1";
const diagnosticPath = "/api/public-checklist";
let inMemorySessionId = null;

function randomSessionId(environment = globalThis) {
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
    const created = randomSessionId(environment);
    storage?.setItem(sessionStorageKey, created);
    inMemorySessionId = created;
    return created;
  } catch {
    inMemorySessionId ||= randomSessionId(environment);
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

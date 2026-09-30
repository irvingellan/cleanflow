import { managerPageClientMetadata } from "../telemetry/managerPageLoadService.js";

const storageKey = "cleanflow.manager-access.diagnostics";
const maxEvents = 30;
const stages = new Set([
  "auth_resolved", "access_verification_started", "cache_snapshot_seen",
  "server_membership_confirmed", "access_denied", "verification_timeout",
  "verification_error", "listener_error", "lifecycle_retry", "manual_retry",
  "recovered_after_retry",
]);
const reasons = new Set([
  "timeout", "offline", "unavailable", "permission-denied", "unauthenticated",
  "unknown", "pageshow", "visible", "online", "manual",
]);
const browsers = new Set(["safari", "chrome", "firefox", "edge", "other"]);
const platforms = new Set(["ios", "android", "macos", "windows", "linux", "other"]);

function boundedNumber(value, maximum) {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.round(value))) : 0;
}

function safeEvent(input) {
  if (!input || !stages.has(input.stage)) return null;
  const event = {
    stage: input.stage,
    attempt: boundedNumber(input.attempt, 10_000),
    durationMs: boundedNumber(input.durationMs, 600_000),
    browser: browsers.has(input.browser) ? input.browser : "other",
    platform: platforms.has(input.platform) ? input.platform : "other",
    deviceClass: input.deviceClass === "mobile" ? "mobile" : "desktop",
    standalone: input.standalone === true,
  };
  // Accept only the random identifier formats emitted by the existing telemetry helper.
  if (typeof input.sessionId === "string"
      && /^(?:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|[a-z0-9]{6,12}-[a-z0-9]{6,16})$/i.test(input.sessionId)) {
    event.sessionId = input.sessionId;
  }
  if (typeof input.appVersion === "string" && /^v?\d+\.\d+\.\d+$/.test(input.appVersion)) {
    event.appVersion = input.appVersion;
  }
  if (input.reason !== undefined) event.reason = reasons.has(input.reason) ? input.reason : "unknown";
  return event;
}

/** Session-local startup evidence only; diagnostics must never affect access verification. */
export function recordManagerAccessDiagnostic(stage, { attempt = 0, durationMs = 0, reason } = {}) {
  if (!stages.has(stage)) return;
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;
    // Do not ask the shared helper to persist a device identifier for this local diagnostic.
    const metadata = managerPageClientMetadata({
      sessionStorage: storage,
      navigator: globalThis.navigator,
      window: globalThis.window,
      crypto: globalThis.crypto,
    });
    const event = safeEvent({ ...metadata, stage, attempt, durationMs, reason });
    let previous = [];
    try {
      const stored = JSON.parse(storage.getItem(storageKey) || "[]");
      if (Array.isArray(stored)) previous = stored.slice(-maxEvents).map(safeEvent).filter(Boolean);
    } catch {
      // A malformed previous ring cannot prevent a useful new diagnostic.
    }
    storage.setItem(storageKey, JSON.stringify([...previous, event].slice(-maxEvents)));
  } catch {
    // Storage and metadata failures are intentionally invisible to the authorization gate.
  }
}

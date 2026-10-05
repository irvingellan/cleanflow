import { assertShadowTarget, providers, sourceTypes } from "../../src/features/reservation-intake/reservationCandidateModel.js";

export function validateConfig(config) {
  if (!config || typeof config !== "object") throw new Error("INVALID_CONFIG");
  assertShadowTarget(config.target || {});
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(config.organizationId || "")) throw new Error("INVALID_ORGANIZATION");
  if (!Array.isArray(config.sources) || config.sources.length > 20) throw new Error("INVALID_SOURCES");
  const ids = new Set();
  for (const source of config.sources) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(source.id || "") || ids.has(source.id)
      || !providers.includes(source.provider) || !sourceTypes.includes(source.type)) throw new Error("INVALID_SOURCE");
    ids.add(source.id);
    if (typeof source.enabled !== "boolean" || source.completeSnapshot != null && typeof source.completeSnapshot !== "boolean") throw new Error("INVALID_SOURCE");
    if (source.type === "ICAL") {
      let url; try { url = new URL(source.url); } catch { throw new Error("INVALID_FEED_CONFIG"); }
      if (url.protocol !== "https:" || url.username || url.password || url.port
        || !Array.isArray(source.allowedHosts) || source.allowedHosts.length !== 1
        || source.allowedHosts[0] !== url.hostname || /(^localhost$|\.local$|^\[|^[\d.]+$)/.test(url.hostname)) throw new Error("INVALID_FEED_CONFIG");
    }
    if (source.pollIntervalMs != null && (!Number.isSafeInteger(source.pollIntervalMs) || source.pollIntervalMs < 60000)) throw new Error("INVALID_POLL_INTERVAL");
  }
  if (config.extensionId != null && !/^[a-p]{32}$/.test(config.extensionId)) throw new Error("INVALID_EXTENSION_ID");
  if (config.mappings != null && (!Array.isArray(config.mappings) || config.mappings.length > 1000
    || config.mappings.some(mapping => !ids.has(mapping.sourceId)
      || ![mapping.listingExternalId, mapping.propertyId].every(value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value))))) throw new Error("INVALID_MAPPING");
  return config;
}
export function safeDiagnostic({ sourceProvider, sourceType, parserVersion, changeType, result, errorCategory, durationMs } = {}) {
  return { sourceProvider, sourceType, parserVersion, changeType, result,
    errorCategory: /^[A-Z_]{1,80}$/.test(errorCategory || "") ? errorCategory : undefined,
    durationMs: Number.isFinite(durationMs) ? Math.round(durationMs) : undefined };
}
export function redactUrl() { return "[SECRET_FEED_URL_REDACTED]"; }

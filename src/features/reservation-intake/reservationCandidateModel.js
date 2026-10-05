export const shadowProjectId = "clean-flow-sandbox-irving";
export const shadowOrigin = "https://clean-flow-sandbox-irving.web.app";
export const providers = ["HOSPITABLE", "GUESTY", "GENERIC_ICAL", "BROWSER_DOM_HOSPITABLE", "BROWSER_DOM_GUESTY"];
export const sourceTypes = ["ICAL", "BROWSER_DOM", "MANUAL_IMPORT"];
export const parserVersion = "reservation-bridge-v0.1";

// A local shadow store is not permission to write Firebase operational data.
export function assertShadowTarget({ projectId, origin }) {
  if (projectId !== shadowProjectId || origin !== shadowOrigin) {
    throw new Error("SHADOW_TARGET_DENIED");
  }
}

const fields = new Set([
  "sourceProvider", "sourceType", "sourceId", "sourceAccountExternalId",
  "sourceListingExternalId", "sourcePropertyName", "externalReservationId",
  "sourceEventUid", "guestName", "checkIn", "checkOut", "timezone",
  "sourceReservationStatus", "observedAt", "sourceUpdatedAt", "sourceSequence",
]);
export function validateObservation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !fields.has(key))) throw new Error("INVALID_OBSERVATION_SCHEMA");
  if (!providers.includes(value.sourceProvider) || !sourceTypes.includes(value.sourceType)
    || typeof value.sourceId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.sourceId)
    || !validInstant(value.observedAt)) throw new Error("INVALID_OBSERVATION_SCHEMA");
  for (const [key, entry] of Object.entries(value)) {
    if (entry == null) continue;
    if (key === "sourceSequence") {
      if (!Number.isSafeInteger(entry) || entry < 0) throw new Error("INVALID_OBSERVATION_SCHEMA");
    } else if (typeof entry !== "string" || entry.length > 256 || /[<>\u0000-\u001f]|https?:\/\//.test(entry)
      || ["guestName", "sourcePropertyName"].includes(key) && /\S+@\S+|(?:\+\d[\d ()-]{7,})/.test(entry)) {
      throw new Error("INVALID_OBSERVATION_SCHEMA");
    }
  }
  if (value.sourceUpdatedAt != null && !validInstant(value.sourceUpdatedAt)) throw new Error("INVALID_SOURCE_TIMESTAMP");
  return { ...value };
}
export function validInstant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) return false;
  const date = value.slice(0, 10);
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return false;
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

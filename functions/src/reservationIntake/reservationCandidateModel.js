export const providers = ["HOSPITABLE", "GUESTY", "GENERIC_ICAL"];
export const calendarEventKinds = ["BOOKING", "BLOCK", "OWNER_STAY", "UNKNOWN"];
export const parserVersion = "reservation-bridge-shadow-v1";

export function icalSourceSemantics(provider) {
  return provider === "HOSPITABLE" ? "HOSPITABLE_PROPERTY_ICAL"
    : provider === "GUESTY" ? "GUESTY_LISTING_ICAL" : "GENERIC_CALENDAR_ICAL";
}

export function validSourceId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)
    && !Object.hasOwn(Object.prototype, value);
}

const fields = new Set([
  "sourceProvider", "sourceType", "sourceId", "sourceListingExternalId",
  "sourceEventUid", "calendarEventKind", "checkIn", "checkOut", "timezone",
  "sourceReservationStatus", "observedAt", "sourceUpdatedAt", "sourceSequence",
]);
export function validateObservation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !fields.has(key))) throw new Error("INVALID_OBSERVATION_SCHEMA");
  if (!providers.includes(value.sourceProvider) || value.sourceType !== "ICAL"
    || !validSourceId(value.sourceId) || !calendarEventKinds.includes(value.calendarEventKind)
    || !validInstant(value.observedAt)
    || (value.sourceListingExternalId != null && !validSourceId(value.sourceListingExternalId))
    || (value.sourceEventUid != null && (typeof value.sourceEventUid !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceEventUid)))) throw new Error("INVALID_OBSERVATION_SCHEMA");
  for (const [key, entry] of Object.entries(value)) {
    if (entry == null) continue;
    if (key === "sourceSequence") {
      if (!Number.isSafeInteger(entry) || entry < 0) throw new Error("INVALID_OBSERVATION_SCHEMA");
    } else if (typeof entry !== "string" || entry.length > 256 || /[<>\u0000-\u001f]|https?:\/\//.test(entry)) {
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

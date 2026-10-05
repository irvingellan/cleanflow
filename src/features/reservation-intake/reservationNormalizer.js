import { parserVersion, validateObservation, validInstant } from "./reservationCandidateModel.js";
import { hashValue, reservationIdentity } from "./reservationFingerprint.js";

export function normalizeDate(value) {
  if (value == null || value === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
  }
  if (validInstant(value)) return new Date(value).toISOString();
  return null; // Floating time/TZID without a safe resolver remains unknown.
}

export function propertyMapping(observation, mappings = []) {
  const matches = mappings.filter(mapping => mapping.sourceId === observation.sourceId
    && mapping.listingExternalId === observation.sourceListingExternalId
    && typeof mapping.propertyId === "string" && mapping.propertyId);
  const ids = [...new Set(matches.map(mapping => mapping.propertyId))];
  return { propertyMappingState: ids.length === 1 ? "MATCHED" : ids.length > 1 ? "AMBIGUOUS" : "UNKNOWN",
    propertyMappingCandidateId: ids.length === 1 ? ids[0] : null };
}

export async function normalizeReservationObservation(input, { organizationId, mappings = [] } = {}) {
  if (typeof organizationId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(organizationId)) throw new Error("INVALID_ORGANIZATION");
  const observation = validateObservation(input);
  const cleaned = Object.fromEntries(Object.entries(observation).map(([key, value]) => [key,
    typeof value === "string" ? value.trim() || null : value]));
  if (cleaned.timezone) {
    try { new Intl.DateTimeFormat("en", { timeZone: cleaned.timezone }).format(); }
    catch { cleaned.timezone = null; }
  }
  const checkIn = normalizeDate(cleaned.checkIn), checkOut = normalizeDate(cleaned.checkOut);
  const identity = await reservationIdentity({ ...cleaned, checkIn, checkOut });
  const semantic = {
    sourceProvider: cleaned.sourceProvider, sourceType: cleaned.sourceType, sourceId: cleaned.sourceId,
    sourceAccountExternalId: cleaned.sourceAccountExternalId || null,
    sourceListingExternalId: cleaned.sourceListingExternalId || null,
    sourcePropertyName: cleaned.sourcePropertyName || null,
    externalReservationId: cleaned.externalReservationId || null, sourceEventUid: cleaned.sourceEventUid || null,
    guestName: cleaned.guestName || null, checkIn, checkOut,
    timezone: cleaned.timezone || null,
    sourceReservationStatus: cleaned.sourceReservationStatus || null,
    ...propertyMapping(cleaned, mappings),
  };
  const invalidRange = checkIn && checkOut && checkOut <= checkIn;
  return { ...semantic, ...identity, organizationId, environment: "sandbox",
    sourceFingerprint: identity.id, observedAt: new Date(cleaned.observedAt).toISOString(),
    sourceUpdatedAt: cleaned.sourceUpdatedAt ? new Date(cleaned.sourceUpdatedAt).toISOString() : null,
    sourceSequence: cleaned.sourceSequence ?? null,
    rawSourceHash: await hashValue(semantic), parserVersion,
    confidence: !checkIn || !checkOut || invalidRange || identity.identityStrategy === "CONSERVATIVE_FINGERPRINT" ? "LOW" : "HIGH",
    reviewState: "REQUIRED", changeType: "NEW", changeSet: {},
    sourceEvidenceSummary: { dateBasis: checkIn?.length === 10 ? "DATE_ONLY" : cleaned.timezone ? "EXPLICIT_TIMEZONE" : "UNKNOWN",
      partial: !checkIn || !checkOut || Boolean(invalidRange), authoritativeCancellation: cleaned.sourceReservationStatus === "CANCELLED" },
  };
}

import { normalizeDate } from "../../functions/src/reservationIntake/reservationNormalizer.js";
import { hashValue } from "../../functions/src/reservationIntake/reservationFingerprint.js";

const supportedFields = new Set(["UID", "DTSTART", "DTEND", "STATUS", "LAST-MODIFIED", "SEQUENCE"]);
const unsupportedFields = new Set(["RRULE", "RDATE", "EXDATE", "RECURRENCE-ID", "DURATION"]);

const maxBytes = 2 * 1024 * 1024;
function calendarDate(field) {
  if (!field) return null;
  const { value, parameters } = field;
  if (/^\d{8}$/.test(value) && (!parameters || parameters === ";VALUE=DATE")) {
    return normalizeDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
  }
  if (/^\d{8}T\d{6}Z$/.test(value) && (!parameters || parameters === ";VALUE=DATE-TIME")) {
    return normalizeDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`);
  }
  return null;
}
export async function parseIcal(text, source, observedAt) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > maxBytes) throw new Error("FEED_TOO_LARGE");
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/).filter(Boolean);
  if (lines[0] !== "BEGIN:VCALENDAR" || lines.at(-1) !== "END:VCALENDAR") throw new Error("MALFORMED_ICAL");
  const events = [];
  const components = [];
  let event = null;
  let hasVersion = false;
  let complete = source.provider === "HOSPITABLE" && source.completeSnapshot === true;
  for (const line of lines.slice(1, -1)) {
    if (line.startsWith("VERSION:")) {
      if (components.length || hasVersion || line !== "VERSION:2.0") throw new Error("MALFORMED_ICAL");
      hasVersion = true;
      continue;
    }
    const component = /^(BEGIN|END):([A-Z0-9-]+)$/.exec(line);
    if (component?.[1] === "BEGIN") {
      if (component[2] === "VCALENDAR" || (component[2] === "VEVENT" && components.length)) {
        throw new Error("MALFORMED_ICAL");
      }
      components.push(component[2]);
      if (component[2] === "VEVENT") {
        if (events.length >= 1000) throw new Error("MALFORMED_ICAL");
        event = {};
      }
      continue;
    }
    if (component?.[1] === "END" && components.pop() !== component[2]) throw new Error("MALFORMED_ICAL");
    if (component && component[2] !== "VEVENT") continue;
    if (line === "END:VEVENT") {
      if (!event) throw new Error("MALFORMED_ICAL");
      if ([...unsupportedFields].some(key => event[key])) throw new Error("RECURRENCE_OR_DURATION_UNSUPPORTED");
      const checkIn = calendarDate(event.DTSTART);
      const checkOut = calendarDate(event.DTEND);
      const rawUid = event.UID?.value.trim();
      const uid = rawUid && rawUid.length <= 256 ? rawUid : null;
      const sequenceText = event.SEQUENCE?.value;
      const sequence = /^\d+$/.test(sequenceText) && Number.isSafeInteger(Number(sequenceText))
        ? Number(sequenceText) : null;
      const updatedAt = calendarDate(event["LAST-MODIFIED"]);
      const rawStatus = event.STATUS?.value;
      const status = ["CONFIRMED", "TENTATIVE", "CANCELLED"].includes(rawStatus) ? rawStatus : null;
      if (!uid || !checkIn || !checkOut || checkIn.length !== checkOut.length || checkIn >= checkOut
        || (event.SEQUENCE && sequence == null) || (event.STATUS && !status)
        || (event["LAST-MODIFIED"] && updatedAt?.length !== 24)) complete = false;
      events.push({ sourceProvider: source.provider, sourceType: "ICAL", sourceId: source.id,
        sourceListingExternalId: source.listingExternalId || null,
        sourceEventUid: uid ? await hashValue([source.provider, source.id, uid]) : null,
        calendarEventKind: uid ? source.eventKinds?.get(uid) ?? "UNKNOWN" : "UNKNOWN",
        checkIn, checkOut, timezone: event.DTSTART?.value.endsWith("Z") ? "UTC" : null,
        sourceReservationStatus: status,
        sourceUpdatedAt: updatedAt?.length === 24 ? updatedAt : null,
        sourceSequence: sequence,
        observedAt });
      event = null;
      continue;
    }
    // Ignore nested metadata and descriptions. Only VEVENT root fields enter the shadow model.
    if (!event || components.length !== 1) continue;
    const match = /^([A-Z-]+)([^:]*):(.*)$/.exec(line);
    if (!match) throw new Error("MALFORMED_ICAL");
    const [, key, parameters, value] = match;
    if (!supportedFields.has(key) && !unsupportedFields.has(key)) continue;
    if (event[key]) throw new Error("DUPLICATE_ICAL_FIELD");
    event[key] = { parameters, value };
  }
  if (event || components.length || !hasVersion) throw new Error("MALFORMED_ICAL");
  return { sourceId: source.id, observedAt, result: "SUCCESS", complete, observations: events };
}

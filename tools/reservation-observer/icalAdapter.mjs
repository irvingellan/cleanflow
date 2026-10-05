import { normalizeDate } from "../../src/features/reservation-intake/reservationNormalizer.js";

const maxBytes = 2 * 1024 * 1024;
function calendarDate(field) {
  if (!field) return null;
  const { value, parameters } = field;
  if (/^\d{8}$/.test(value) && (!parameters || parameters === ";VALUE=DATE")) {
    return normalizeDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
  }
  if (/^\d{8}T\d{6}Z$/.test(value) && !parameters) {
    return normalizeDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`);
  }
  return null;
}
export function parseIcal(text, source, observedAt) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > maxBytes) throw new Error("FEED_TOO_LARGE");
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/).filter(Boolean);
  if (lines[0] !== "BEGIN:VCALENDAR" || lines.at(-1) !== "END:VCALENDAR") throw new Error("MALFORMED_ICAL");
  if (lines.filter(line => line.startsWith("VERSION:")).length !== 1 || !lines.includes("VERSION:2.0")) throw new Error("MALFORMED_ICAL");
  const events = []; let event = null, depth = 0, complete = source.completeSnapshot === true;
  for (const line of lines.slice(1, -1)) {
    if (line === "BEGIN:VEVENT") { if (event) throw new Error("MALFORMED_ICAL"); event = {}; depth = 0; continue; }
    if (line === "END:VEVENT") {
      if (!event || depth) throw new Error("MALFORMED_ICAL");
      if (["RRULE", "RDATE", "EXDATE", "RECURRENCE-ID", "DURATION"].some(key => event[key])) throw new Error("RECURRENCE_OR_DURATION_UNSUPPORTED");
      const checkIn = calendarDate(event.DTSTART), checkOut = calendarDate(event.DTEND);
      if (!checkIn || !checkOut) complete = false;
      events.push({ sourceProvider: source.provider, sourceType: "ICAL", sourceId: source.id,
        sourceListingExternalId: source.listingExternalId || null, sourceAccountExternalId: source.accountExternalId || null,
        sourcePropertyName: source.propertyAlias || null, sourceEventUid: event.UID?.value || null,
        checkIn, checkOut, timezone: event.DTSTART?.value.endsWith("Z") ? "UTC" : null,
        sourceReservationStatus: ["CONFIRMED", "TENTATIVE", "CANCELLED"].includes(event.STATUS?.value) ? event.STATUS.value : null,
        sourceUpdatedAt: calendarDate(event["LAST-MODIFIED"]),
        sourceSequence: event.SEQUENCE && /^\d+$/.test(event.SEQUENCE.value) ? Number(event.SEQUENCE.value) : null,
        observedAt });
      event = null; continue;
    }
    if (!event) continue;
    if (line.startsWith("BEGIN:")) { depth++; continue; }
    if (line.startsWith("END:")) { if (!depth) throw new Error("MALFORMED_ICAL"); depth--; continue; }
    if (depth) continue; // Never extract alarm/contact/description content.
    const match = /^([A-Z-]+)([^:]*):(.*)$/.exec(line);
    if (!match) throw new Error("MALFORMED_ICAL");
    const [, key, parameters, value] = match;
    if (!["UID", "DTSTART", "DTEND", "STATUS", "LAST-MODIFIED", "SEQUENCE", "RRULE", "RDATE", "EXDATE", "RECURRENCE-ID", "DURATION"].includes(key)) continue;
    if (event[key]) throw new Error("DUPLICATE_ICAL_FIELD");
    event[key] = { parameters, value };
  }
  if (event || events.length > 1000) throw new Error("MALFORMED_ICAL");
  return { sourceId: source.id, observedAt, result: "SUCCESS", complete, observations: events };
}

async function pollIcalRequest(source, { fetchImpl = fetch, observedAt = new Date().toISOString(), validators = {}, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:" || url.username || url.password || !source.allowedHosts?.includes(url.hostname)) throw new Error("FEED_ORIGIN_DENIED");
    const headers = {};
    if (validators.etag) headers["If-None-Match"] = validators.etag;
    if (validators.lastModified) headers["If-Modified-Since"] = validators.lastModified;
    const response = await fetchImpl(url.href, { method: "GET", redirect: "error", credentials: "omit", headers, signal: controller.signal });
    if (response.status === 304) return { sourceId: source.id, observedAt, result: "NOT_MODIFIED", observations: [], complete: false, validators };
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "SOURCE_AUTH_REQUIRED" : "SOURCE_UNAVAILABLE");
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("FEED_TOO_LARGE"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const poll = parseIcal(new TextDecoder("utf-8", { fatal: true }).decode(bytes), source, observedAt);
    return { ...poll, validators: { etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified") } };
  } catch (error) {
    const allowed = ["FEED_ORIGIN_DENIED", "SOURCE_AUTH_REQUIRED", "SOURCE_UNAVAILABLE", "FEED_TOO_LARGE", "MALFORMED_ICAL", "DUPLICATE_ICAL_FIELD", "RECURRENCE_OR_DURATION_UNSUPPORTED"];
    return { sourceId: source.id, observedAt, result: "ERROR", complete: false, observations: [],
      errorCategory: controller.signal.aborted ? "NETWORK_TIMEOUT" : allowed.includes(error.message) ? error.message : "NETWORK_OR_PARSE_FAILURE" };
  } finally { clearTimeout(timer); }
}

export async function pollIcal(source, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const observedAt = options.observedAt || new Date().toISOString();
  let timer;
  try {
    return await Promise.race([pollIcalRequest(source, { ...options, observedAt, timeoutMs }),
      new Promise(resolve => { timer = setTimeout(() => resolve({ sourceId: source.id, observedAt, result: "ERROR", complete: false,
        observations: [], errorCategory: "NETWORK_TIMEOUT" }), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}

import { describe, expect, it } from "vitest";
import { parseIcal, pollIcal } from "../../../tools/reservation-observer/icalAdapter.mjs";
const source = { id: "synthetic-feed", provider: "GENERIC_ICAL", listingExternalId: "synthetic-listing", completeSnapshot: true,
  url: "https://calendar.example.invalid/private-secret?token=not-real", allowedHosts: ["calendar.example.invalid"] };
const observedAt = "2026-10-04T12:00:00Z";
const event = "BEGIN:VEVENT\r\nUID:synthetic-uid\r\nDTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261012\r\nLAST-MODIFIED:20261004T110000Z\r\nSTATUS:CONFIRMED\r\nSEQUENCE:2\r\nSUMMARY:Do not retain this\r\nDESCRIPTION:Do not retain contact fields\r\nEND:VEVENT";
const feed = content => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${content}\r\nEND:VCALENDAR\r\n`;
describe("iCal bounded allowlist", () => {
  it("parses date-only UID, source version, status without summary/description/contacts", () => {
    const poll = parseIcal(feed(event), source, observedAt);
    expect(poll.complete).toBe(true); expect(poll.observations[0].checkIn).toBe("2026-10-10");
    expect(poll.observations[0].sourceSequence).toBe(2); expect(poll.observations[0].sourceUpdatedAt).toBe("2026-10-04T11:00:00.000Z");
    expect(JSON.stringify(poll)).not.toMatch(/Do not retain|private-secret|token=/);
  });
  it("UTC dates survive, floating/TZID is unknown and poll incomplete", () => {
    const utc = parseIcal(feed(event.replace("DTSTART;VALUE=DATE:20261010", "DTSTART:20261010T120000Z")), source, observedAt);
    expect(utc.observations[0].checkIn).toBe("2026-10-10T12:00:00.000Z");
    const floating = parseIcal(feed(event.replace("DTSTART;VALUE=DATE:20261010", "DTSTART;TZID=America/Los_Angeles:20261010T120000")), source, observedAt);
    expect(floating.observations[0].checkIn).toBeNull(); expect(floating.complete).toBe(false);
  });
  it.each(["RRULE:FREQ=DAILY", "RECURRENCE-ID:20261010T120000Z", "DURATION:P2D"])("fails closed on %s", field => {
    expect(() => parseIcal(feed(event.replace("END:VEVENT", `${field}\r\nEND:VEVENT`)), source, observedAt)).toThrow("RECURRENCE_OR_DURATION_UNSUPPORTED");
  });
  it("explicit CANCELLED stays source evidence; malformed/truncated calendar rejected", () => {
    expect(parseIcal(feed(event.replace("STATUS:CONFIRMED", "STATUS:CANCELLED")), source, observedAt).observations[0].sourceReservationStatus).toBe("CANCELLED");
    expect(() => parseIcal(feed(event).replace("END:VCALENDAR", ""), source, observedAt)).toThrow("MALFORMED_ICAL");
    expect(() => parseIcal("BEGIN:VCALENDAR\r\nEND:VCALENDAR", source, observedAt)).toThrow("MALFORMED_ICAL");
  });
  it("successful GET uses validators, no credentials, no redirect; 304 has no disappearance", async () => {
    let call;
    const result = await pollIcal(source, { observedAt, validators: { etag: "synthetic-etag" }, fetchImpl: async (url, options) => {
      call = options; return new Response(null, { status: 304 });
    } });
    expect(call.method).toBe("GET"); expect(call.credentials).toBe("omit"); expect(call.redirect).toBe("error");
    expect(call.headers["If-None-Match"]).toBe("synthetic-etag"); expect(result.result).toBe("NOT_MODIFIED"); expect(result.complete).toBe(false);
  });
  it("response body and stalled dependency are bounded, failure never cancellation", async () => {
    const result = await pollIcal(source, { observedAt, timeoutMs: 15, fetchImpl: () => new Promise(() => {}) });
    expect(result.errorCategory).toBe("NETWORK_TIMEOUT"); expect(result.complete).toBe(false);
    const body = await pollIcal(source, { observedAt, timeoutMs: 15, fetchImpl: async () => new Response(new ReadableStream({ start() {} })) });
    expect(body.errorCategory).toBe("NETWORK_TIMEOUT");
  });
  it("redacts raw network exceptions, 401 and oversized body", async () => {
    const error = await pollIcal(source, { observedAt, fetchImpl: async () => { throw new Error(source.url); } });
    expect(JSON.stringify(error)).not.toContain("private-secret"); expect(error.errorCategory).toBe("NETWORK_OR_PARSE_FAILURE");
    const auth = await pollIcal(source, { observedAt, fetchImpl: async () => new Response("", { status: 401 }) });
    expect(auth.errorCategory).toBe("SOURCE_AUTH_REQUIRED");
    const huge = await pollIcal(source, { observedAt, fetchImpl: async () => new Response("x".repeat(2 * 1024 * 1024 + 1)) });
    expect(huge.errorCategory).toBe("FEED_TOO_LARGE");
  });
});

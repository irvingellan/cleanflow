// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseIcal } from "../../../tools/reservation-observer/icalAdapter.mjs";
import { applyShadowPoll, emptyShadowState } from "./reservationShadowState.js";
import { buildCleaningSuggestions } from "./cleaningSuggestions.js";

const source = (overrides = {}) => ({
  id: "source-one", provider: "HOSPITABLE", completeSnapshot: true,
  eventKinds: new Map([["one", "BOOKING"], ["two", "BOOKING"], ["block", "BLOCK"], ["owner", "OWNER_STAY"]]), ...overrides,
});
const property = { id: "property-one", timeZone: "America/New_York", minimumTurnoverMinutes: 240 };
const context = {
  organizationId: "synthetic-intake",
  mappings: ["source-one", "source-two"].map(sourceId => ({ sourceId, listingExternalId: null, propertyId: property.id })),
};
const time = day => `2026-11-${String(day).padStart(2, "0")}T10:00:00Z`;
const calendar = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const event = ({ uid = "one", checkIn = "20261201", checkOut = "20261206", sequence = "0",
  startKey = "DTSTART;VALUE=DATE", endKey = "DTEND;VALUE=DATE", status = "CONFIRMED", extra = [] } = {}) =>
  ["BEGIN:VEVENT", `UID:${uid}`, `${startKey}:${checkIn}`, `${endKey}:${checkOut}`, `SEQUENCE:${sequence}`,
    `STATUS:${status}`, ...extra, "END:VEVENT"].join("\r\n");

async function poll(state, day, text, from = source(), options = context) {
  return applyShadowPoll(state, await parseIcal(text, from, time(day)), options);
}
const candidate = state => Object.values(state.candidates)[0];
const suggest = (state, jobs = [], properties = [property]) =>
  buildCleaningSuggestions(Object.values(state.candidates), { properties, jobs });
const baseJob = { id: "job-one", propertyId: property.id, scheduledDate: "2026-12-06",
  operationalStatus: "UNASSIGNED", assigned: false, checklistStarted: false, manuallyEdited: false, archived: false };

describe("reservation observations", () => {
  it("retains source-scoped identity and an audit diff across repeats and reschedules", async () => {
    const initial = await poll(emptyShadowState(), 1, calendar(event()));
    const repeated = await poll(initial, 1, calendar(event()));
    expect(repeated).toBe(initial);
    const changed = await poll(repeated, 2, calendar(event({ sequence: "1", checkOut: "20261208" })));
    expect(Object.keys(changed.candidates)).toEqual(Object.keys(initial.candidates));
    expect(candidate(changed)).toMatchObject({ changeType: "DATES_CHANGED", missingCount: 0,
      changeSet: { checkOut: { before: "2026-12-06", after: "2026-12-08" } } });
    expect(changed.audit.map(x => x.operation)).toEqual(["OBSERVED", "CHANGED"]);
    expect(suggest(changed, [baseJob])[0]).toMatchObject({ recommendation: "REVIEW",
      reasons: ["CHANGED_BOOKING_WITH_EXISTING_JOB"], conflictingJobIds: ["job-one"] });
  });

  it("preserves existing Jobs across several source revisions and audits each date change", async () => {
    let state = await poll(emptyShadowState(), 1, calendar(event()));
    state = await poll(state, 2, calendar(event({ sequence: "1", checkOut: "20261208" })));
    state = await poll(state, 3, calendar(event({ sequence: "2", checkOut: "20261209" })));
    expect(suggest(state, [baseJob])[0].conflictingJobIds).toEqual(["job-one"]);
    expect(state.audit.slice(1).map(entry => entry.changes.checkOut)).toEqual([
      { before: "2026-12-06", after: "2026-12-08" }, { before: "2026-12-08", after: "2026-12-09" },
    ]);
  });

  it("requires agreement when both source versions give directions", async () => {
    let state = await poll(emptyShadowState(), 1, calendar(event({ sequence: "2", extra: ["LAST-MODIFIED:20261101T100000Z"] })));
    state = await poll(state, 2, calendar(event({ sequence: "1", checkOut: "20261209", extra: ["LAST-MODIFIED:20261102T100000Z"] })));
    expect(candidate(state)).toMatchObject({ checkOut: "2026-12-06", conflict: { reason: "ORDER_UNPROVEN" } });
  });

  it("holds the last proven dates across same-version changes and stale snapshots", async () => {
    let state = await poll(emptyShadowState(), 3, calendar(event({ sequence: "2" })));
    state = await poll(state, 5, calendar(event({ checkOut: "20261209", sequence: "2" })));
    expect(candidate(state)).toMatchObject({ checkOut: "2026-12-06", changeType: "CONFLICT", conflict: { reason: "ORDER_UNPROVEN" } });
    state = await poll(state, 4, calendar());
    expect(candidate(state).missingCount).toBe(0);
    expect(state.diagnostics.at(-1).errorCategory).toBe("STALE_OR_REPLAYED_SNAPSHOT");
    state = await poll(state, 6, calendar(event({ checkOut: "20261208", sequence: "1" })));
    expect(candidate(state)).toMatchObject({ checkOut: "2026-12-06", conflict: { reason: "OLDER_OBSERVATION" } });
    state = await poll(state, 7, calendar(event({ checkOut: "20261208", sequence: "3" })));
    expect(candidate(state)).toMatchObject({ checkOut: "2026-12-08", changeType: "DATES_CHANGED", conflict: null });
  });

  it("requires three proven new complete snapshots for a possible cancellation and restores a reappearance", async () => {
    let state = await poll(emptyShadowState(), 1, calendar(event()));
    state = await poll(state, 2, calendar());
    expect(candidate(state)).toMatchObject({ changeType: "SOURCE_DISAPPEARED", missingCount: 1 });
    for (const [index, result] of ["ERROR", "NOT_MODIFIED", "PARSER_NEEDS_REVIEW"].entries()) {
      state = await applyShadowPoll(state, { sourceId: "source-one", observedAt: time(index + 3), result }, context);
    }
    expect(candidate(state).missingCount).toBe(1);
    expect(state.diagnostics.map(x => x.result)).toEqual(["ERROR", "NOT_MODIFIED", "PARSER_NEEDS_REVIEW"]);
    state = await poll(state, 6, calendar(event({ uid: "other", sequence: "-1" })));
    expect(candidate(state).missingCount).toBe(1);
    state = await poll(state, 7, calendar());
    expect(candidate(state).missingCount).toBe(2);
    state = await poll(state, 8, calendar());
    expect(candidate(state)).toMatchObject({ changeType: "POSSIBLE_CANCELLED", missingCount: 3 });
    expect(suggest(state).find(x => x.candidateId === candidate(state).id).recommendation).toBe("REVIEW");
    state = await poll(state, 9, calendar(event()));
    expect(candidate(state)).toMatchObject({ changeType: "SOURCE_REAPPEARED", missingCount: 0 });
    expect(state.audit.at(-1).operation).toBe("RESTORED");
  });

  it("retains explicit calendar cancellation as review evidence only", async () => {
    const state = await poll(await poll(emptyShadowState(), 1, calendar(event())), 2,
      calendar(event({ sequence: "1", status: "CANCELLED" })));
    expect(candidate(state)).toMatchObject({ changeType: "STATUS_CHANGED", sourceEvidenceSummary: {
      authoritativeCancellation: false, calendarCancellationReported: true,
    } });
    const jobs = [baseJob];
    expect(suggest(state, jobs)[0]).toMatchObject({ recommendation: "REVIEW", reasons: ["CALENDAR_CANCELLATION_REPORTED"], conflictingJobIds: ["job-one"] });
    expect(jobs).toEqual([baseJob]);
  });

  it("keeps both cross-source records, annotates exact duplicates, and does not infer Guesty disappearance", async () => {
    const external = source({ id: "source-two", provider: "GUESTY" });
    let state = await poll(emptyShadowState(), 1, calendar(event()));
    state = await poll(state, 2, calendar(event()), external);
    const [first, second] = Object.values(state.candidates);
    expect(first.id).not.toBe(second.id);
    expect(first.possibleDuplicateOf).toEqual([second.id]);
    expect(second.possibleDuplicateOf).toEqual([first.id]);
    for (let day = 3; day <= 5; day += 1) state = await poll(state, day, calendar(), external);
    expect(state.candidates[second.id].missingCount).toBe(0);
    expect(suggest(state).every(x => x.reasons.includes("POSSIBLE_DUPLICATE_SOURCE"))).toBe(true);
  });

  it("does not merge cross-source events for different or ambiguous property mappings", async () => {
    const options = { ...context, mappings: [context.mappings[0],
      { sourceId: "source-two", listingExternalId: null, propertyId: "elsewhere" },
      { sourceId: "source-two", listingExternalId: null, propertyId: "another" }] };
    let state = await poll(emptyShadowState(), 1, calendar(event()), source(), options);
    state = await poll(state, 2, calendar(event()), source({ id: "source-two" }), options);
    expect(Object.values(state.candidates).map(x => x.possibleDuplicateOf)).toEqual([[], []]);
    expect(suggest(state).some(x => x.reasons.includes("PROPERTY_MAPPING_REQUIRED"))).toBe(true);
  });

  it("fails closed for contradictory duplicate source identities", async () => {
    const initial = await poll(emptyShadowState(), 1, calendar(event()));
    const after = await poll(initial, 2, calendar(event(), event({ checkOut: "20261209" })));
    expect(after.candidates).toEqual(initial.candidates);
    expect(after.diagnostics.at(-1).errorCategory).toBe("DUPLICATE_ID_CONFLICT");
  });

  it.each([
    [calendar(event({ extra: ["RRULE:FREQ=DAILY"] })), "RECURRENCE_OR_DURATION_UNSUPPORTED"],
    [calendar(event({ extra: ["DTEND:20261120"] })), "DUPLICATE_ICAL_FIELD"],
    [calendar(event()).replace("END:VEVENT", "END:VALARM"), "MALFORMED_ICAL"],
    [calendar(event()).replace("VERSION:2.0", "VERSION:1.0"), "MALFORMED_ICAL"],
    [calendar(event()).replace("VERSION:2.0\r\nBEGIN:VEVENT", "BEGIN:VEVENT\r\nVERSION:2.0"), "MALFORMED_ICAL"],
  ])("flags unsupported or malformed calendars without inventing data", async (text, error) => {
    await expect(parseIcal(text, source(), time(1))).rejects.toThrow(error);
  });

  it.each([
    ["DTSTART", "20261201T100000", "DTEND", "20261205T100000"],
    ["DTSTART;TZID=America/New_York", "20261201T100000", "DTEND;TZID=America/New_York", "20261205T100000"],
    ["DTSTART;VALUE=DATE", "20261201", "DTEND", "20261205T100000Z"],
    ["DTSTART;VALUE=DATE", "20260230", "DTEND;VALUE=DATE", "20260306"],
  ])("leaves ambiguous or invalid times incomplete", async (startKey, checkIn, endKey, checkOut) => {
    const parsed = await parseIcal(calendar(event({ startKey, checkIn, endKey, checkOut })), source(), time(1));
    expect(parsed.complete).toBe(false);
    const state = await applyShadowPoll(emptyShadowState(), parsed, context);
    expect(suggest(state)[0].reasons).toContain("INCOMPLETE_DATES_OR_TIMEZONE");
  });
});

describe("read-only cleaning suggestions", () => {
  it("excludes known blocked and owner stays and sends unknown events to review", async () => {
    const state = await poll(emptyShadowState(), 1,
      calendar(event({ uid: "block" }), event({ uid: "owner" }), event({ uid: "unknown" })));
    expect(suggest(state).map(x => [x.recommendation, x.reasons[0]])).toEqual(
      expect.arrayContaining([["EXCLUDED", "BLOCK"], ["EXCLUDED", "OWNER_STAY"], ["REVIEW", "UNKNOWN_EVENT_KIND"]]),
    );
  });

  it("keeps an explicitly classified booking with unknown status in review", async () => {
    const state = await poll(emptyShadowState(), 1,
      calendar(event().replace("STATUS:CONFIRMED\r\n", "")));
    expect(suggest(state)[0].reasons).toEqual(["UNKNOWN_BOOKING_STATUS"]);
  });

  it("identifies existing, assigned, checklist-started, edited, archived and multiple Jobs for review", async () => {
    const state = await poll(emptyShadowState(), 1, calendar(event()));
    expect(suggest(state, [baseJob])[0].reasons).toEqual(["POSSIBLE_EXISTING_JOB"]);
    for (const key of ["assigned", "checklistStarted", "manuallyEdited", "archived"]) {
      expect(suggest(state, [{ ...baseJob, [key]: true }])[0].reasons).toEqual(["EXISTING_JOB_REQUIRES_REVIEW"]);
    }
    expect(suggest(state, [baseJob, { ...baseJob, id: "job-two" }])[0]).toMatchObject({
      reasons: ["EXISTING_JOB_REQUIRES_REVIEW"], conflictingJobIds: ["job-one", "job-two"],
    });
    expect(suggest(state, [{ ...baseJob, propertyId: "different" }])[0].recommendation).toBe("SUGGEST_NEW_CLEANING");
  });

  it("uses the configured operating date and exact elapsed time over a daylight-saving transition", async () => {
    const times = { startKey: "DTSTART", endKey: "DTEND" };
    const state = await poll(emptyShadowState(), 1, calendar(
      event({ ...times, checkIn: "20261031T150000Z", checkOut: "20261101T053000Z" }),
      event({ ...times, uid: "two", checkIn: "20261101T083000Z", checkOut: "20261103T030000Z" }),
    ));
    const results = suggest(state);
    expect(results.find(x => x.checkoutDate === "2026-11-01").reasons).toEqual(["INSUFFICIENT_TURNOVER"]);
    expect(results.find(x => x.checkoutDate === "2026-11-02").recommendation).toBe("SUGGEST_NEW_CLEANING");
    expect(suggest(state, [], [{ id: property.id }]).every(x => x.reasons.includes("INCOMPLETE_DATES_OR_TIMEZONE"))).toBe(true);
  });

  it("detects insufficient clearance even when the next exact check-in crosses midnight", async () => {
    const times = { startKey: "DTSTART", endKey: "DTEND" };
    const state = await poll(emptyShadowState(), 1, calendar(
      event({ ...times, checkIn: "20261201T150000Z", checkOut: "20261205T043000Z" }),
      event({ ...times, uid: "two", checkIn: "20261205T053000Z", checkOut: "20261207T160000Z" }),
    ));
    expect(suggest(state).find(x => x.checkoutDate === "2026-12-04").reasons).toEqual(["INSUFFICIENT_TURNOVER"]);
  });

  it("shows same-day date-only ambiguity without guessing check-in or cleaning hours", async () => {
    const state = await poll(emptyShadowState(), 1, calendar(event(), event({ uid: "two", checkIn: "20261206", checkOut: "20261209" })));
    expect(suggest(state).find(x => x.checkoutDate === "2026-12-06").reasons).toEqual(["TURNOVER_TIME_UNKNOWN"]);
  });
});

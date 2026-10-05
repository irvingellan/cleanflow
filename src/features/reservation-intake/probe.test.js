// @vitest-environment node
import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { probeSource } from "../../../tools/reservation-observer/probe.mjs";
import { parseIcal } from "../../../tools/reservation-observer/icalAdapter.mjs";
import { validateConfig } from "../../../tools/reservation-observer/config.mjs";
import { normalizeReservationObservation } from "./reservationNormalizer.js";
import { applyShadowPoll, emptyShadowState } from "./reservationShadowState.js";
const config = provider => ({ target: { projectId: "clean-flow-sandbox-irving", origin: "https://clean-flow-sandbox-irving.web.app" },
  organizationId: "synthetic-org", sources: [{ id: "synthetic-source", type: "ICAL", provider, enabled: true,
    url: "https://calendar.example.invalid/synthetic-secret?private=never-print", allowedHosts: ["calendar.example.invalid"], listingExternalId: "synthetic-listing" }] });
const observedAt = "2026-10-05T12:00:00Z";
const ics = extra => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:synthetic-event\r\nDTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261012\r\n${extra || ""}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
afterEach(() => vi.restoreAllMocks());
describe("first authorized feed probe — synthetic only", () => {
  it.each(["HOSPITABLE", "GUESTY"])("%s has explicit semantics and completeness defaults false", async provider => {
    const source = config(provider).sources[0];
    const poll = parseIcal(ics(), source, observedAt);
    expect(poll.complete).toBe(false);
    const row = await normalizeReservationObservation(poll.observations[0], config(provider));
    expect(row.sourceSemantics).toBe(provider === "HOSPITABLE" ? "HOSPITABLE_PROPERTY_ICAL" : "GUESTY_LISTING_ICAL");
    expect(row.sourceEvidenceType).toBe(provider === "HOSPITABLE" ? "RESERVATION_CALENDAR_CANDIDATE" : "CALENDAR_EVENT");
    expect(row.sourceEvidenceSummary.reservationProven).toBe(false); expect(row.reviewState).toBe("REQUIRED");
  });
  it("Guesty cancellation is calendar evidence, and disappearance never promotes it", async () => {
    const source = { ...config("GUESTY").sources[0], completeSnapshot: true };
    const poll = parseIcal(ics("STATUS:CANCELLED"), source, observedAt);
    expect(poll.complete).toBe(false);
    let state = await applyShadowPoll(emptyShadowState(), poll, config("GUESTY"));
    for (const hour of [13, 14, 15]) state = await applyShadowPoll(state, { ...poll, observations: [], complete: true, observedAt: `2026-10-05T${hour}:00:00Z` }, config("GUESTY"));
    const row = Object.values(state.candidates)[0];
    expect(row.missingCount).toBe(0); expect(row.changeType).toBe("NEW");
    expect(row.sourceEvidenceSummary.authoritativeCancellation).toBe(false);
  });
  it("probe fetches once, normalizes, and cannot write or advance existing state", async () => {
    const state = await applyShadowPoll(emptyShadowState(), parseIcal(ics(), config("HOSPITABLE").sources[0], observedAt), config("HOSPITABLE"));
    const before = structuredClone(state);
    const write = vi.spyOn(fs, "writeFileSync"), mkdir = vi.spyOn(fs, "mkdirSync"), rename = vi.spyOn(fs, "renameSync"), open = vi.spyOn(fs, "openSync");
    const checkHost = vi.fn().mockResolvedValue(), fetchImpl = vi.fn().mockResolvedValue(new Response(ics("CONTACT:private@example.invalid\r\nATTENDEE:mailto:private@example.invalid\r\nDESCRIPTION:+19995550123\r\nSUMMARY:Secret guest")));
    const result = await probeSource(config("HOSPITABLE"), "synthetic-source", { checkHost, fetchImpl });
    expect(result).toMatchObject({ fetch: "OK", eventsAccepted: 1, dateOnly: 1, stableUidPresent: 1, persistentWrites: "NONE", disappearanceCounters: "UNCHANGED", confidenceCeiling: "SHADOW_ONLY" });
    expect(fetchImpl).toHaveBeenCalledOnce(); expect(checkHost).toHaveBeenCalledWith("calendar.example.invalid");
    expect(JSON.stringify(result)).not.toMatch(/synthetic-secret|private|19995550123|Secret guest|synthetic-event/);
    for (const spy of [write, mkdir, rename, open]) expect(spy).not.toHaveBeenCalled();
    expect(state).toEqual(before);
  });
  it.each(["network", "malformed", "recurrence"])("%s returns bounded redacted failure, never raw ICS/URL", async reason => {
    const fetchImpl = reason === "network" ? async () => { throw Error(config("GUESTY").sources[0].url); }
      : async () => new Response(reason === "malformed" ? "secret malformed" : ics("RRULE:FREQ=DAILY"));
    const result = await probeSource(config("GUESTY"), "synthetic-source", { checkHost: async () => {}, fetchImpl });
    expect(result.fetch).toBe("ERROR"); expect(result.candidates).toEqual([]); expect(result.persistentWrites).toBe("NONE");
    expect(JSON.stringify(result)).not.toMatch(/synthetic-secret|never-print|secret malformed|https:/);
    if (reason === "recurrence") expect(result.errorCategory).toBe("RECURRENCE_OR_DURATION_UNSUPPORTED");
  });
  it("config refuses mismatched semantics and Production before any request", async () => {
    const bad = config("GUESTY"); bad.sources[0].semantics = "HOSPITABLE_PROPERTY_ICAL";
    expect(() => validateConfig(bad)).toThrow("INVALID_SOURCE_SEMANTICS");
    const fetchImpl = vi.fn(); bad.target.projectId = "clean-flow-prototipo";
    await expect(probeSource(bad, "synthetic-source", { fetchImpl })).rejects.toThrow("SHADOW_TARGET_DENIED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("network guard rejection cannot leak its exception or initiate fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await probeSource(config("HOSPITABLE"), "synthetic-source", { fetchImpl,
      checkHost: async () => { throw Error(config("HOSPITABLE").sources[0].url); } });
    expect(result.errorCategory).toBe("FEED_NETWORK_DENIED"); expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/https:|synthetic-secret|never-print/);
  });
  it("committed provider templates are placeholder-only and local trial files stay ignored", () => {
    for (const provider of ["hospitable", "guesty"]) {
      const template = JSON.parse(fs.readFileSync(`tools/reservation-observer/${provider}.example.json`, "utf8"));
      expect(() => validateConfig(template)).not.toThrow();
      expect(new URL(template.sources[0].url).hostname).toBe("calendar.example.invalid");
      expect(template.sources[0].completeSnapshot).toBe(false);
    }
    const ignore = fs.readFileSync(".gitignore", "utf8");
    expect(ignore).toContain("reservation-observer.local.json"); expect(ignore).toContain("reservation-intake-acceptance.local.md");
  });
});

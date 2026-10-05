import { describe, expect, it } from "vitest";
import { normalizeReservationObservation } from "./reservationNormalizer.js";
import { emptyShadowState, applyShadowPoll } from "./reservationShadowState.js";
const context = { organizationId: "demo-org", mappings: [{ sourceId: "demo", listingExternalId: "listing", propertyId: "demo-property" }] };
const row = { sourceProvider: "GENERIC_ICAL", sourceType: "ICAL", sourceId: "demo", sourceListingExternalId: "listing",
  sourceEventUid: "event-one", checkIn: "2026-10-10", checkOut: "2026-10-12", observedAt: "2026-10-04T12:00:00Z",
  sourceUpdatedAt: "2026-10-04T11:00:00Z" };
const poll = (observations = [row], observedAt = row.observedAt, options = {}) => ({ sourceId: "demo", observedAt, observations: observations.map(o => ({ ...o, observedAt })), result: "SUCCESS", complete: true, ...options });
const only = state => Object.values(state.candidates)[0];
describe("synthetic shadow A–L evidence", () => {
  it("same provider/account in independent feeds retains separate source ownership", async () => {
    const first = await normalizeReservationObservation({ ...row, externalReservationId: "stable", sourceAccountExternalId: "account" }, context);
    const second = await normalizeReservationObservation({ ...row, sourceId: "second", externalReservationId: "stable", sourceAccountExternalId: "account" }, context);
    expect(first.id).not.toBe(second.id);
  });
  it("indistinguishable fallback events fail closed rather than silently collapse", async () => {
    const fallback = { ...row, sourceEventUid: null };
    const next = await applyShadowPoll(emptyShadowState(), poll([fallback, fallback]), context);
    expect(Object.keys(next.candidates)).toHaveLength(0);
    expect(next.diagnostics.at(-1).errorCategory).toBe("FALLBACK_ID_COLLISION");
  });
  it("A/B first appearance and repeated poll have one stable candidate", async () => {
    let state = await applyShadowPoll(emptyShadowState(), poll([]), context);
    state = await applyShadowPoll(state, poll(), context);
    expect(only(state).changeType).toBe("NEW");
    state = await applyShadowPoll(state, poll(), context);
    state = await applyShadowPoll(state, poll(), context);
    expect(Object.keys(state.candidates)).toHaveLength(1); expect(only(state).changeType).toBe("UNCHANGED");
  });
  it("C/G date change has explicit diff; old late snapshot cannot revert", async () => {
    let state = await applyShadowPoll(emptyShadowState(), poll(), context);
    state = await applyShadowPoll(state, poll([{ ...row, checkOut: "2026-10-13", sourceUpdatedAt: "2026-10-04T13:00:00Z" }], "2026-10-04T14:00:00Z"), context);
    expect(only(state).changeType).toBe("DATES_CHANGED");
    expect(only(state).changeSet.checkOut).toEqual({ before: "2026-10-12", after: "2026-10-13" });
    state = await applyShadowPoll(state, poll([row], "2026-10-04T15:00:00Z"), context);
    expect(only(state).checkOut).toBe("2026-10-13"); expect(only(state).conflict.reason).toBe("OLDER_OBSERVATION");
  });
  it("D/E/F one disappearance is not cancellation; failures and duplicate snapshots do not count; restored stays", async () => {
    let state = await applyShadowPoll(emptyShadowState(), poll(), context);
    state = await applyShadowPoll(state, poll([], "2026-10-04T13:00:00Z"), context);
    expect(only(state).changeType).toBe("SOURCE_DISAPPEARED");
    state = await applyShadowPoll(state, poll([], "2026-10-04T13:00:00Z"), context);
    expect(only(state).missingCount).toBe(1);
    state = await applyShadowPoll(state, poll([], "2026-10-04T14:00:00Z", { result: "ERROR", errorCategory: "NETWORK_TIMEOUT" }), context);
    expect(only(state).missingCount).toBe(1);
    state = await applyShadowPoll(state, poll([], "2026-10-04T15:00:00Z"), context);
    state = await applyShadowPoll(state, poll([], "2026-10-04T16:00:00Z"), context);
    expect(only(state).changeType).toBe("POSSIBLE_CANCELLED"); expect(only(state).sourceReservationStatus).toBeNull();
    state = await applyShadowPoll(state, poll([row], "2026-10-04T17:00:00Z"), context);
    expect(only(state).missingCount).toBe(0); expect(only(state).changeType).toBe("UNCHANGED");
  });
  it("incomplete DOM / feed snapshots never establish disappearance", async () => {
    let state = await applyShadowPoll(emptyShadowState(), poll(), context);
    state = await applyShadowPoll(state, poll([], "2026-10-04T13:00:00Z", { complete: false }), context);
    expect(only(state).missingCount).toBe(0);
  });
  it("changed state without source ordering is a conflict, not silent overwrite", async () => {
    let state = await applyShadowPoll(emptyShadowState(), poll([{ ...row, sourceUpdatedAt: null }]), context);
    state = await applyShadowPoll(state, poll([{ ...row, sourceUpdatedAt: null, checkOut: "2026-10-13" }], "2026-10-04T13:00:00Z"), context);
    expect(only(state).checkOut).toBe("2026-10-12"); expect(only(state).conflict.reason).toBe("ORDER_UNPROVEN");
  });
  it("H/I/L mapping exact only, ambiguous separate, guest optional, floating date unknown", async () => {
    const unknown = await normalizeReservationObservation({ ...row, sourceListingExternalId: null, checkIn: "20261010T120000" }, context);
    expect(unknown.propertyMappingState).toBe("UNKNOWN"); expect(unknown.guestName).toBeNull(); expect(unknown.checkIn).toBeNull();
    const ambiguous = await normalizeReservationObservation(row, { ...context, mappings: [...context.mappings, { ...context.mappings[0], propertyId: "other" }] });
    expect(ambiguous.propertyMappingState).toBe("AMBIGUOUS"); expect(ambiguous.propertyMappingCandidateId).toBeNull();
  });
  it("stable external identity survives dates and fallback remains explicitly low confidence", async () => {
    const first = await normalizeReservationObservation({ ...row, externalReservationId: "stable" }, context);
    const changed = await normalizeReservationObservation({ ...row, externalReservationId: "stable", checkOut: "2026-10-14" }, context);
    expect(first.id).toBe(changed.id); expect(first.identityStrategy).toBe("EXTERNAL_ID");
    const fallback = await normalizeReservationObservation({ ...row, sourceEventUid: null }, context);
    expect(fallback.identityStrategy).toBe("CONSERVATIVE_FINGERPRINT"); expect(fallback.confidence).toBe("LOW");
  });
  it("J multi-source correlation never merges", async () => {
    const state = await applyShadowPoll(emptyShadowState(), poll(), context);
    const other = { ...row, sourceId: "second", sourceProvider: "GUESTY" };
    const next = await applyShadowPoll(state, { ...poll([other]), sourceId: "second", observations: [other] }, context);
    expect(Object.keys(next.candidates)).toHaveLength(2);
    expect(Object.values(next.candidates)[1].possibleDuplicateOf).toEqual([only(state).id]);
  });
  it("conflicting duplicate UID invalidates whole poll, no disappearance", async () => {
    const state = await applyShadowPoll(emptyShadowState(), poll(), context);
    const next = await applyShadowPoll(state, poll([row, { ...row, checkOut: "2026-10-13" }], "2026-10-04T13:00:00Z"), context);
    expect(next.candidates).toEqual(state.candidates); expect(next.diagnostics.at(-1).errorCategory).toBe("DUPLICATE_ID_CONFLICT");
  });
});

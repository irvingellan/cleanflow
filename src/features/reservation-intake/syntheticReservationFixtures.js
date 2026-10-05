import { emptyShadowState, applyShadowPoll } from "./reservationShadowState.js";
export async function buildSyntheticReservationState() {
  const context = { organizationId: "synthetic-shadow-org", mappings: [{ sourceId: "synthetic-feed", listingExternalId: "listing-one", propertyId: "synthetic-property-one" }] };
  const base = { sourceProvider: "GUESTY", sourceType: "ICAL", sourceId: "synthetic-feed", sourceListingExternalId: "listing-one",
    sourcePropertyName: "Demo Harbor House", checkIn: "2026-10-10", checkOut: "2026-10-12", sourceUpdatedAt: "2026-10-04T11:00:00Z" };
  const rows = [
    { ...base, sourceEventUid: "synthetic-new", checkIn: "2026-10-20", checkOut: "2026-10-23" },
    { ...base, sourceEventUid: "synthetic-change", guestName: "Demo Guest Alpha" },
    { ...base, sourceEventUid: "synthetic-missing", checkIn: "2026-10-15", checkOut: "2026-10-18" },
    { ...base, sourceProvider: "HOSPITABLE", sourceEventUid: "synthetic-unknown", sourceListingExternalId: "unmapped-listing", sourcePropertyName: "Demo Garden Studio", checkIn: "2026-10-25", checkOut: "2026-10-28" },
  ];
  const poll = (observations, observedAt) => ({ sourceId: base.sourceId, observedAt, result: "SUCCESS", complete: true,
    observations: observations.map(row => ({ ...row, observedAt })) });
  let state = await applyShadowPoll(emptyShadowState(), poll(rows, "2026-10-04T12:00:00Z"), context);
  for (const hour of [13, 14, 15]) {
    state = await applyShadowPoll(state, poll(rows.filter(row => row.sourceEventUid !== "synthetic-missing"), `2026-10-04T${hour}:00:00Z`), context);
  }
  // Partial snapshot updates only changed/new candidates, without disappearance.
  state = await applyShadowPoll(state, { ...poll([
    { ...rows[1], checkOut: "2026-10-13", sourceUpdatedAt: "2026-10-04T15:00:00Z" },
    { ...rows[0], sourceEventUid: "synthetic-new-last", checkIn: "2026-11-02", checkOut: "2026-11-05" },
  ], "2026-10-04T16:00:00Z"), complete: false }, context);
  return state;
}

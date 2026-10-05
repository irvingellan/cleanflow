export async function hashValue(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function reservationIdentity(observation) {
  // Independent feeds retain ownership; cross-source resemblance is review evidence, not a merge.
  const scope = [observation.sourceProvider, observation.sourceId, observation.sourceAccountExternalId || null];
  let identityStrategy, parts;
  if (observation.externalReservationId) {
    identityStrategy = "EXTERNAL_ID";
    parts = [...scope, observation.externalReservationId];
  } else if (observation.sourceListingExternalId && observation.sourceEventUid) {
    identityStrategy = "LISTING_EVENT_UID";
    parts = [...scope, observation.sourceListingExternalId, observation.sourceEventUid];
  } else {
    identityStrategy = "CONSERVATIVE_FINGERPRINT";
    parts = [...scope, observation.sourceId, observation.sourceListingExternalId,
      observation.sourcePropertyName, observation.sourceEventUid, observation.checkIn,
      observation.checkOut, observation.guestName];
  }
  return { id: await hashValue(parts), identityStrategy };
}

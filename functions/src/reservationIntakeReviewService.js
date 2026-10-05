import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { requireOrganizationManager, isActiveManagerMembership } from "./managerAuthorization.js";
import { normalizeReservationObservation } from "./reservationIntake/reservationNormalizer.js";
import { hashValue } from "./reservationIntake/reservationFingerprint.js";

const fail = reason => new HttpsError("failed-precondition", "Reservation intake requires review.", { reason });
const validId = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function assertIntakeReviewEnvironment(database) {
  if (database.projectId === "clean-flow-sandbox-irving") return;
  if (database.projectId === "demo-cleanflow" && /^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) return;
  throw new HttpsError("permission-denied", "Intake review is restricted to Sandbox or local emulator.");
}
export function reservationDiscrepancy(promoted, current, signal) {
  const changes = {};
  for (const field of ["checkIn", "checkOut", "guestName", "sourcePropertyName", "sourceListingExternalId", "sourceReservationStatus", "timezone"]) {
    if ((promoted[field] ?? null) !== (current[field] ?? null)) changes[field] = { before: promoted[field] ?? null, after: current[field] ?? null };
  }
  const reviewSignal = ["SOURCE_DISAPPEARED", "POSSIBLE_CANCELLED", "CONFLICT", "PROPERTY_MAPPING_CHANGED"].includes(signal);
  return { changes, signal: reviewSignal ? signal : null, reviewRequired: Object.keys(changes).length > 0 || reviewSignal };
}

/** Human actions only. Ingestion never calls this service. No Job path/trigger. */
export async function reviewReservationIntake(database, request, organizationId) {
  assertIntakeReviewEnvironment(database);
  if (!validId(organizationId)) throw new HttpsError("invalid-argument", "Invalid organization.");
  await requireOrganizationManager(database, request, organizationId);
  const input = request.data || {};
  if (Object.keys(input).some(key => !["operation", "candidateId", "observation", "signal", "propertyId", "confirmed", "expectedRevision"].includes(key))
    || !["READ", "RESOLVE", "IGNORE", "PROMOTE"].includes(input.operation)
    || !/^[a-f0-9]{64}$/.test(input.candidateId || "")
    || !["NEW", "UNCHANGED", "DATES_CHANGED", "STATUS_CHANGED", "PROPERTY_MAPPING_CHANGED", "SOURCE_DISAPPEARED", "POSSIBLE_CANCELLED", "CONFLICT", "UNKNOWN"].includes(input.signal)) {
    throw new HttpsError("invalid-argument", "Invalid review request.");
  }
  let candidate;
  try { candidate = await normalizeReservationObservation(input.observation, { organizationId }); }
  catch { throw new HttpsError("invalid-argument", "Invalid normalized observation."); }
  if (candidate.id !== input.candidateId) throw fail("identity-mismatch");
  const identity = await hashValue([candidate.sourceProvider, candidate.sourceAccountExternalId || candidate.sourceId,
    candidate.externalReservationId ? "RESERVATION_ID" : "LISTING_UID",
    candidate.externalReservationId || candidate.sourceListingExternalId, candidate.externalReservationId ? null : candidate.sourceEventUid]);
  const root = `organizations/${organizationId}`;
  const reviewRef = database.doc(`${root}/reservationIntakeReviews/${candidate.id}`);
  const identityRef = database.doc(`${root}/reservationIntakeIdentities/${identity}`);
  const reservationRef = database.doc(`${root}/reservations/${identity}`);
  const membershipRef = database.doc(`${root}/members/${request.auth.uid}`);
  const snapshot = Object.fromEntries(["sourceProvider", "sourceType", "sourceId", "sourceAccountExternalId", "sourceListingExternalId", "externalReservationId", "sourceEventUid", "sourcePropertyName", "checkIn", "checkOut", "guestName", "timezone", "sourceReservationStatus", "observedAt", "sourceUpdatedAt", "sourceSequence", "parserVersion"].map(key => [key, candidate[key] ?? null]));

  return database.runTransaction(async transaction => {
    const [reviewDoc, identityDoc, reservationDoc, memberDoc] = await Promise.all([
      transaction.get(reviewRef), transaction.get(identityRef), transaction.get(reservationRef), transaction.get(membershipRef),
    ]);
    if (!isActiveManagerMembership(memberDoc.data())) throw new HttpsError("permission-denied", "Manager access was revoked.");
    const previous = reviewDoc.data();
    if (identityDoc.exists !== reservationDoc.exists || identityDoc.exists && identityDoc.data().reservationId !== reservationRef.id) throw fail("identity-ledger-inconsistent");
    if (previous?.state === "PROMOTED" && (!reservationDoc.exists || previous.reservationId !== reservationRef.id)) throw fail("promotion-ledger-inconsistent");
    const result = review => ({ state: review?.state || (input.signal === "NEW" ? "NEW" : "NEEDS_REVIEW"), revision: review?.revision || 0,
      propertyId: review?.propertyId || null, reservationId: review?.reservationId || null,
      firstObservedAt: review?.firstObservedAt || candidate.observedAt,
      lastObservedAt: candidate.observedAt,
      discrepancy: reservationDoc.exists ? reservationDiscrepancy(reservationDoc.data().intakeProvenance.observation, snapshot, input.signal) : null });
    if (input.operation === "READ") return result(previous);
    if (previous?.state === "PROMOTED") {
      if (input.operation === "PROMOTE" && input.confirmed === true) return result(previous);
      throw fail("already-promoted");
    }
    if (previous?.state === "IGNORED") throw fail("ignored");
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== (previous?.revision || 0)) throw fail("review-changed-reload");
    const revision = (previous?.revision || 0) + 1;
    const base = { candidateId: candidate.id, organizationId, revision,
      firstObservedAt: previous?.firstObservedAt || candidate.observedAt, lastObservedAt: candidate.observedAt,
      observation: snapshot, actorUid: request.auth.uid, updatedAt: FieldValue.serverTimestamp() };
    const auditRef = reviewRef.collection("history").doc(String(revision));
    const audit = { operation: input.operation, actorUid: request.auth.uid, at: FieldValue.serverTimestamp(),
      candidateId: candidate.id, observation: snapshot, propertyId: previous?.propertyId || null };
    if (input.operation === "IGNORE") {
      const next = { ...base, state: "IGNORED", propertyId: previous?.propertyId || null };
      transaction.set(reviewRef, next); transaction.create(auditRef, audit); return result(next);
    }
    const propertyId = input.operation === "RESOLVE" ? input.propertyId : previous?.propertyId;
    if (!validId(propertyId)) throw fail("property-unresolved");
    const propertyRef = database.doc(`${root}/properties/${propertyId}`);
    const propertyDoc = await transaction.get(propertyRef);
    const property = propertyDoc.data();
    if (!propertyDoc.exists || property.archivedAt || property.active !== true || typeof property.name !== "string") throw fail("property-unavailable");
    if (input.operation === "RESOLVE") {
      const next = { ...base, state: "NEEDS_REVIEW", propertyId, propertyName: property.name, mappingMethod: "EXPLICIT_MANAGER_SELECTION" };
      transaction.set(reviewRef, next); transaction.create(auditRef, { ...audit, propertyId }); return result(next);
    }
    if (input.confirmed !== true) throw fail("human-confirmation-required");
    if (!candidate.checkIn || !candidate.checkOut || candidate.checkIn.length !== candidate.checkOut.length || candidate.checkOut <= candidate.checkIn
      || candidate.identityStrategy === "CONSERVATIVE_FINGERPRINT") throw fail("insufficient-stay-evidence");
    if (["CANCELLED", "CANCELED"].includes(candidate.sourceReservationStatus?.toUpperCase()) || ["SOURCE_DISAPPEARED", "POSSIBLE_CANCELLED", "CONFLICT"].includes(input.signal)) throw fail("external-state-needs-review");
    if (Object.keys(snapshot).filter(key => key !== "observedAt").some(key => previous.observation[key] !== snapshot[key])) throw fail("observation-changed-review-again");
    const next = { ...base, state: "PROMOTED", propertyId, propertyName: property.name,
      mappingMethod: "EXPLICIT_MANAGER_SELECTION", reservationId: reservationRef.id, promotedAt: FieldValue.serverTimestamp() };
    if (!reservationDoc.exists) {
      transaction.create(reservationRef, { organizationId, propertyId, clientId: validId(property.clientId) ? property.clientId : null,
        checkIn: snapshot.checkIn, checkOut: snapshot.checkOut, timezone: snapshot.timezone, guestName: snapshot.guestName,
        status: "ACTIVE", dataProvenance: "DEMO", createdAt: FieldValue.serverTimestamp(),
        intakeProvenance: { candidateId: candidate.id, identityStrategy: candidate.identityStrategy, sourceIdentity: identity,
          observation: snapshot, mappingMethod: "EXPLICIT_MANAGER_SELECTION", actorUid: request.auth.uid,
          humanApproved: true, promotedAt: FieldValue.serverTimestamp() } });
      transaction.create(identityRef, { reservationId: reservationRef.id, candidateId: candidate.id, createdAt: FieldValue.serverTimestamp() });
    } else {
      const saved = reservationDoc.data();
      if (saved.propertyId !== propertyId) throw fail("identity-property-conflict");
      if (reservationDiscrepancy(saved.intakeProvenance.observation, snapshot, input.signal).reviewRequired) throw fail("identity-observation-conflict");
    }
    transaction.set(reviewRef, next); transaction.create(auditRef, { ...audit, propertyId, reservationId: reservationRef.id });
    return { ...result(next), discrepancy: reservationDoc.exists ? reservationDiscrepancy(reservationDoc.data().intakeProvenance.observation, snapshot, input.signal) : null };
  });
}

import { normalizeReservationObservation } from "./reservationNormalizer.js";
import { compareObservationOrder } from "./reservationObservationOrdering.js";
import { diffReservation } from "./reservationDiff.js";
import { possibleDuplicates } from "./reservationDeduplicator.js";
import { hashValue } from "./reservationFingerprint.js";
import { validInstant, validSourceId } from "./reservationCandidateModel.js";

export function emptyShadowState() { return { version: 1, candidates: {}, polls: {}, diagnostics: [] }; }
export async function applyShadowPoll(state, poll, context) {
  if (!poll || !validSourceId(poll.sourceId) || !validInstant(poll.observedAt)
    || !["SUCCESS", "ERROR", "NOT_MODIFIED", "PARSER_NEEDS_REVIEW"].includes(poll.result)
    || poll.errorCategory && !/^[A-Z_]{1,80}$/.test(poll.errorCategory)) throw new Error("INVALID_POLL");
  if (poll.complete != null && typeof poll.complete !== "boolean") throw new Error("INVALID_POLL");
  if (poll.result !== "SUCCESS") {
    const diagnostic = { sourceId: poll.sourceId, observedAt: new Date(poll.observedAt).toISOString(), result: poll.result,
      errorCategory: poll.result === "NOT_MODIFIED" ? null : poll.errorCategory || "SOURCE_UNAVAILABLE" };
    if (state.diagnostics.some(entry => Object.keys(diagnostic).every(key => entry[key] === diagnostic[key]))) return state;
    return { ...state, diagnostics: [...state.diagnostics.slice(-99), diagnostic] };
  }
  if (!Array.isArray(poll.observations) || poll.observations.length > 1000) throw new Error("INVALID_POLL");
  const next = structuredClone(state), seen = new Set();
  const observedAt = new Date(poll.observedAt).toISOString();
  const receipt = await hashValue([poll.sourceId, observedAt, poll.complete === true, poll.observations]);
  if (state.receipts?.includes(receipt)) return state;
  const lastPoll = Object.hasOwn(state.polls, poll.sourceId) ? state.polls[poll.sourceId] : null;
  if (lastPoll && observedAt <= lastPoll) {
    return applyShadowPoll(state, { ...poll, result: "ERROR", errorCategory: "STALE_OR_REPLAYED_SNAPSHOT" }, context);
  }
  next.audit ||= [];
  const audit = (candidate, operation) => {
    next.audit.push({ candidateId: candidate.id, operation, observedAt, changeType: candidate.changeType,
      changes: candidate.changeSet, conflictReason: candidate.conflict?.reason ?? null,
      missingCount: candidate.missingCount });
  };
  const normalized = await Promise.all(poll.observations.map(observation => {
    if (observation.sourceId !== poll.sourceId || observation.observedAt !== poll.observedAt) throw new Error("SOURCE_SCOPE_MISMATCH");
    return normalizeReservationObservation(observation, context);
  }));
  // A conflicting duplicate identity means the poll cannot prove completeness.
  const byId = new Map();
  for (const candidate of normalized) {
    if (byId.has(candidate.id) && candidate.identityStrategy === "CONSERVATIVE_FINGERPRINT") {
      return applyShadowPoll(state, { ...poll, result: "ERROR", errorCategory: "FALLBACK_ID_COLLISION" }, context);
    }
    const duplicate = byId.get(candidate.id);
    if (duplicate && (duplicate.rawSourceHash !== candidate.rawSourceHash
      || duplicate.sourceSequence !== candidate.sourceSequence || duplicate.sourceUpdatedAt !== candidate.sourceUpdatedAt)) {
      return applyShadowPoll(state, { ...poll, result: "ERROR", errorCategory: "DUPLICATE_ID_CONFLICT" }, context);
    }
    byId.set(candidate.id, candidate);
  }
  for (const candidate of byId.values()) {
    seen.add(candidate.id);
    const previous = next.candidates[candidate.id];
    candidate.missingCount = 0;
    candidate.firstObservedAt = previous?.firstObservedAt || previous?.observedAt || candidate.observedAt;
    if (!previous) {
      next.candidates[candidate.id] = candidate;
      audit(candidate, "OBSERVED");
      continue;
    }
    const diff = diffReservation(previous, candidate);
    if (diff.changeType === "UNCHANGED") {
      // Duplicate polls may refresh last-seen, never downgrade source ordering.
      const order = compareObservationOrder(previous, candidate);
      if (order === "OLDER") continue;
      const reordered = order === "NEWER";
      const restored = previous.missingCount > 0;
      next.candidates[candidate.id] = { ...previous, observedAt: candidate.observedAt,
        missingCount: 0,
        ...(restored ? { changeType: "SOURCE_REAPPEARED", changeSet: {} } : {}),
        ...(reordered ? { sourceUpdatedAt: candidate.sourceUpdatedAt, sourceSequence: candidate.sourceSequence } : {}) };
      if (restored) audit(next.candidates[candidate.id], "RESTORED");
      continue;
    }
    const versionsEqual = previous.sourceUpdatedAt === candidate.sourceUpdatedAt
      && previous.sourceSequence === candidate.sourceSequence;
    const classificationChanged = Object.keys(diff.changeSet).every(key => key === "calendarEventKind" || key.startsWith("propertyMapping"));
    const order = (previous.checkIn && !candidate.checkIn || previous.checkOut && !candidate.checkOut)
      ? "UNPROVEN" : versionsEqual && classificationChanged ? "NEWER" : compareObservationOrder(previous, candidate);
    if (order !== "NEWER") {
      next.candidates[candidate.id] = { ...previous, changeType: "CONFLICT", changeSet: diff.changeSet, reviewState: "REQUIRED",
        conflict: { reason: order === "OLDER" ? "OLDER_OBSERVATION" : "ORDER_UNPROVEN" }, missingCount: 0 };
    } else {
      const previousCheckouts = previous.previousCheckouts || [];
      const prior = { propertyId: previous.propertyMappingCandidateId, checkOut: previous.checkOut };
      const changedCheckout = prior.propertyId !== candidate.propertyMappingCandidateId || prior.checkOut !== candidate.checkOut;
      const alreadyTracked = previousCheckouts.some(entry => entry.propertyId === prior.propertyId && entry.checkOut === prior.checkOut);
      const history = changedCheckout && prior.checkOut && !alreadyTracked ? [...previousCheckouts, prior] : previousCheckouts;
      next.candidates[candidate.id] = { ...candidate, ...diff, previousCheckouts: history.slice(-32),
        checkoutHistoryTruncated: Boolean(previous.checkoutHistoryTruncated) || history.length > 32, conflict: null };
    }
    audit(next.candidates[candidate.id], "CHANGED");
  }
  // Never infer disappearance unless the provider and snapshot explicitly support it.
  if (poll.complete === true) {
    for (const candidate of Object.values(next.candidates)) {
      if (candidate.sourceId !== poll.sourceId || seen.has(candidate.id)
        || candidate.sourceProvider !== "HOSPITABLE" || candidate.calendarEventKind !== "BOOKING"
        || Date.parse(poll.observedAt) <= Date.parse(candidate.observedAt)) continue;
      candidate.missingCount = (candidate.missingCount || 0) + 1;
      candidate.changeType = candidate.missingCount >= 3 ? "POSSIBLE_CANCELLED" : "SOURCE_DISAPPEARED";
      candidate.changeSet = {};
      candidate.reviewState = "REQUIRED";
      audit(candidate, "CHANGED");
    }
  }
  next.audit = next.audit.slice(-1000);
  next.polls[poll.sourceId] = observedAt;
  next.receipts = [...(state.receipts || []).slice(-999), receipt];
  const candidates = Object.values(next.candidates);
  if (candidates.length > 2000) throw new Error("LOCAL_CANDIDATE_LIMIT");
  const bookings = candidates.filter(candidate => candidate.calendarEventKind === "BOOKING");
  for (const candidate of candidates) {
    const correlation = candidate.calendarEventKind === "BOOKING"
      ? possibleDuplicates(candidate, bookings) : [];
    candidate.possibleDuplicateOf = correlation;
    candidate.correlationConfidence = correlation.length ? "LOW" : null;
  }
  return next;
}

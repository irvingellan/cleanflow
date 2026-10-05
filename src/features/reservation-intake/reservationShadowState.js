import { normalizeReservationObservation } from "./reservationNormalizer.js";
import { compareObservationOrder } from "./reservationObservationOrdering.js";
import { diffReservation } from "./reservationDiff.js";
import { possibleDuplicates } from "./reservationDeduplicator.js";
import { validInstant } from "./reservationCandidateModel.js";

export function emptyShadowState() { return { version: 1, candidates: {}, polls: {}, diagnostics: [] }; }
export async function applyShadowPoll(state, poll, context) {
  if (!poll || !/^[a-zA-Z0-9_-]{1,80}$/.test(poll.sourceId || "") || !validInstant(poll.observedAt)
    || !["SUCCESS", "ERROR", "NOT_MODIFIED", "PARSER_NEEDS_REVIEW"].includes(poll.result)
    || poll.errorCategory && !/^[A-Z_]{1,80}$/.test(poll.errorCategory)) throw new Error("INVALID_POLL");
  if (poll.complete != null && typeof poll.complete !== "boolean") throw new Error("INVALID_POLL");
  if (poll.result !== "SUCCESS") {
    return { ...state, diagnostics: [...state.diagnostics.slice(-99), { sourceId: poll.sourceId,
      observedAt: poll.observedAt, result: poll.result, errorCategory: poll.result === "NOT_MODIFIED" ? null : poll.errorCategory || "SOURCE_UNAVAILABLE" }] };
  }
  if (!Array.isArray(poll.observations) || poll.observations.length > 1000) throw new Error("INVALID_POLL");
  const next = structuredClone(state), seen = new Set();
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
    if (byId.has(candidate.id) && byId.get(candidate.id).rawSourceHash !== candidate.rawSourceHash) {
      return applyShadowPoll(state, { ...poll, result: "ERROR", errorCategory: "DUPLICATE_ID_CONFLICT" }, context);
    }
    byId.set(candidate.id, candidate);
  }
  for (const candidate of byId.values()) {
    seen.add(candidate.id);
    const previous = next.candidates[candidate.id];
    const duplicates = possibleDuplicates(candidate, Object.values(next.candidates));
    candidate.possibleDuplicateOf = duplicates;
    candidate.correlationConfidence = duplicates.length ? "LOW" : null;
    candidate.missingCount = 0;
    if (!previous) { next.candidates[candidate.id] = candidate; continue; }
    const diff = diffReservation(previous, candidate);
    if (diff.changeType === "UNCHANGED") {
      // Duplicate polls may refresh last-seen, never downgrade source ordering.
      next.candidates[candidate.id] = { ...previous, observedAt: [previous.observedAt, candidate.observedAt].sort().at(-1),
        sourceSemantics: candidate.sourceSemantics, sourceEvidenceType: candidate.sourceEvidenceType,
        sourceEvidenceSummary: candidate.sourceEvidenceSummary,
        missingCount: 0, changeType: "UNCHANGED", changeSet: {},
        sourceUpdatedAt: [previous.sourceUpdatedAt, candidate.sourceUpdatedAt].filter(Boolean).sort().at(-1) || null,
        sourceSequence: previous.sourceSequence == null ? candidate.sourceSequence
          : candidate.sourceSequence == null ? previous.sourceSequence : Math.max(previous.sourceSequence, candidate.sourceSequence) };
      continue;
    }
    const order = (previous.checkIn && !candidate.checkIn || previous.checkOut && !candidate.checkOut)
      ? "UNPROVEN" : compareObservationOrder(previous, candidate);
    if (order !== "NEWER") {
      next.candidates[candidate.id] = { ...previous, changeType: "CONFLICT", reviewState: "REQUIRED",
        conflict: { reason: order === "OLDER" ? "OLDER_OBSERVATION" : "ORDER_UNPROVEN", observation: candidate },
        missingCount: 0 };
    } else {
      const snapshot = { ...previous }; delete snapshot.previousObservation; delete snapshot.conflict;
      next.candidates[candidate.id] = { ...candidate, ...diff, previousObservation: snapshot,
        conflict: null };
    }
  }
  const lastPoll = next.polls[poll.sourceId];
  // Only newer complete, successful snapshots count as disappearance evidence.
  if (poll.complete === true && (!lastPoll || Date.parse(poll.observedAt) > Date.parse(lastPoll))) {
    for (const candidate of Object.values(next.candidates)) {
      if (candidate.sourceId !== poll.sourceId || seen.has(candidate.id)
        || candidate.sourceProvider === "GUESTY" && candidate.sourceType === "ICAL"
        || Date.parse(poll.observedAt) <= Date.parse(candidate.observedAt)) continue;
      candidate.missingCount = (candidate.missingCount || 0) + 1;
      candidate.changeType = candidate.missingCount >= 3 ? "POSSIBLE_CANCELLED" : "SOURCE_DISAPPEARED";
      candidate.reviewState = "REQUIRED";
    }
    next.polls[poll.sourceId] = poll.observedAt;
  }
  return next;
}

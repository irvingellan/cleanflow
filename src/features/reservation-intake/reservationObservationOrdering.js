export function compareObservationOrder(previous, next) {
  if (previous.sourceUpdatedAt && next.sourceUpdatedAt) {
    const delta = Date.parse(next.sourceUpdatedAt) - Date.parse(previous.sourceUpdatedAt);
    if (delta) return delta > 0 ? "NEWER" : "OLDER";
    if (previous.sourceSequence != null && next.sourceSequence != null) {
      if (next.sourceSequence !== previous.sourceSequence) return next.sourceSequence > previous.sourceSequence ? "NEWER" : "OLDER";
    }
    return "UNPROVEN";
  }
  if (previous.sourceSequence != null && next.sourceSequence != null) {
    return next.sourceSequence > previous.sourceSequence ? "NEWER" : next.sourceSequence < previous.sourceSequence ? "OLDER" : "UNPROVEN";
  }
  // Arrival time alone cannot prove that a delayed source snapshot is newer.
  return "UNPROVEN";
}

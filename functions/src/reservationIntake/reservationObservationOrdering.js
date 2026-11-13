export function compareObservationOrder(previous, next) {
  const differences = [];
  if (previous.sourceUpdatedAt && next.sourceUpdatedAt) {
    differences.push(Date.parse(next.sourceUpdatedAt) - Date.parse(previous.sourceUpdatedAt));
  }
  if (previous.sourceSequence != null && next.sourceSequence != null) {
    differences.push(next.sourceSequence - previous.sourceSequence);
  }
  const newer = differences.some(delta => delta > 0);
  const older = differences.some(delta => delta < 0);
  // Arrival time or contradictory provider versions cannot prove ordering.
  if (newer === older) return "UNPROVEN";
  return newer ? "NEWER" : "OLDER";
}

export function currentCleanerName(
  cleanerId,
  snapshotName,
  cleanerNamesById,
  fallback,
) {
  return (cleanerId && cleanerNamesById[cleanerId]) || snapshotName || fallback;
}

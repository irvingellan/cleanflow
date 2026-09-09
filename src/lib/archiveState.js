export function isArchived(record = {}) {
  return Boolean(record?.archivedAt);
}

export function filterArchivedRecords(records, includeArchived = false) {
  return includeArchived ? records : records.filter((record) => !isArchived(record));
}

function assertActorUid(actorUid) {
  if (!actorUid || typeof actorUid !== "string") {
    throw new Error("An authenticated user is required to change record visibility.");
  }
}

export function buildArchiveUpdate(actorUid, timestamp) {
  assertActorUid(actorUid);
  return { archivedAt: timestamp, archivedBy: actorUid };
}

export function buildRestoreUpdate(actorUid, timestamp) {
  assertActorUid(actorUid);
  // archivedAt is the operational visibility flag. Retaining archive/restoration actors
  // keeps this reversible action attributable without a separate audit-log system.
  return { archivedAt: null, restoredAt: timestamp, restoredBy: actorUid };
}

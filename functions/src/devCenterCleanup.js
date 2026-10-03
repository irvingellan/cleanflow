// Cleanup is intentionally conservative: only untouched generated batches are
// candidates. A workflow-created child or a surviving reference protects the
// entire batch; this is not a recursive delete of manually created test data.
function recordReferences(data = {}) {
  return [
    ["clients", data.clientId], ["properties", data.propertyId],
    ["cleaners", data.cleanerId], ["cleaners", data.assignedCleanerId],
    ["jobs", data.jobId], ["payouts", data.payoutId],
    ...(Array.isArray(data.assignedCleanerIds) ? data.assignedCleanerIds.map((id) => ["cleaners", id]) : []),
    ...(Array.isArray(data.jobIds) ? data.jobIds.map((id) => ["jobs", id]) : []),
  ].filter(([, id]) => typeof id === "string" && id).map(([kind, id]) => `${kind}:${id}`);
}

function sameTimestamp(left, right) {
  if (left === right) return true;
  if (typeof left?.isEqual === "function") return left.isEqual(right);
  return false;
}

export function planDemoCleanup(records) {
  const batchOf = (record) => record.data?.demoSeed === true
    && typeof record.data.demoSeedBatch === "string" && record.data.demoSeedBatch.startsWith("dev-center-")
    ? record.data.demoSeedBatch : null;
  const batches = new Set(records.map(batchOf).filter(Boolean));
  const protectedBatches = new Set();
  const byKey = new Map(records.map((record) => [`${record.kind}:${record.id}`, record]));
  for (const record of records) {
    const batch = batchOf(record);
    if (batch && (record.hasProtectedChildren
      || (record.data.updatedAt !== undefined && !sameTimestamp(record.data.updatedAt, record.data.createdAt)))) {
      protectedBatches.add(batch);
    }
  }
  // A protected batch can reference another batch. Iterate until all surviving
  // records' references are protected, never deleting their referenced parents.
  let changed;
  do {
    changed = false;
    for (const record of records) {
      const sourceBatch = batchOf(record);
      if (sourceBatch && !protectedBatches.has(sourceBatch)) continue;
      for (const key of recordReferences(record.data)) {
        const targetBatch = batchOf(byKey.get(key) || {});
        if (targetBatch && !protectedBatches.has(targetBatch)) {
          protectedBatches.add(targetBatch);
          changed = true;
        }
      }
    }
  } while (changed);
  return {
    targets: records.filter((record) => batchOf(record) && !protectedBatches.has(batchOf(record))),
    skippedBatches: [...batches].filter((batch) => protectedBatches.has(batch)).length,
  };
}

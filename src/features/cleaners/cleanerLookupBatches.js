const cleanerLookupBatchSize = 30;

export function cleanerLookupBatches(cleanerIds) {
  const uniqueCleanerIds = [...new Set(cleanerIds.filter(Boolean))];
  return Array.from(
    { length: Math.ceil(uniqueCleanerIds.length / cleanerLookupBatchSize) },
    (_, index) =>
      uniqueCleanerIds.slice(
        index * cleanerLookupBatchSize,
        (index + 1) * cleanerLookupBatchSize,
      ),
  );
}

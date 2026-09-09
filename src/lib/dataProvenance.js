export const dataProvenanceValues = ["REAL", "DEMO", "UNKNOWN"];

export function isDataProvenance(value) {
  return dataProvenanceValues.includes(value);
}

export function buildDataProvenanceUpdate(dataProvenance, updatedBy, updatedAt) {
  if (!isDataProvenance(dataProvenance)) {
    throw new Error("Invalid data provenance.");
  }

  if (typeof updatedBy !== "string" || !updatedBy.trim()) {
    throw new Error("A manager identity is required to update data provenance.");
  }

  return {
    dataProvenance,
    provenanceUpdatedAt: updatedAt,
    provenanceUpdatedBy: updatedBy,
  };
}

export function normalizeDataProvenance(record = {}) {
  const provenance = record?.dataProvenance;

  // An explicit manager confirmation is authoritative over older demo markers.
  if (isDataProvenance(provenance)) {
    return provenance;
  }

  if (
    record?.demoSeed === true ||
    record?.fixture === true ||
    typeof record?.demoSeedBatch === "string" ||
    typeof record?.demoSeedScenario === "string" ||
    String(record?.id || "").startsWith("dashboard-demo-")
  ) {
    return "DEMO";
  }

  return "UNKNOWN";
}

export function withNormalizedDataProvenance(record = {}) {
  return {
    ...record,
    dataProvenance: normalizeDataProvenance(record),
  };
}

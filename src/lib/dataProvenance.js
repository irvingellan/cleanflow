export const dataProvenanceValues = ["REAL", "DEMO", "UNKNOWN"];

export function normalizeDataProvenance(record = {}) {
  const provenance = record?.dataProvenance;

  if (dataProvenanceValues.includes(provenance)) {
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

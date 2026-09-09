import { describe, expect, it } from "vitest";
import {
  buildDataProvenanceUpdate,
  normalizeDataProvenance,
  withNormalizedDataProvenance,
} from "./dataProvenance.js";

describe("data provenance", () => {
  it.each(["REAL", "DEMO", "UNKNOWN"])("keeps explicit %s", (dataProvenance) => {
    expect(normalizeDataProvenance({ dataProvenance })).toBe(dataProvenance);
  });

  it("recognizes reliable legacy demo markers", () => {
    expect(normalizeDataProvenance({ demoSeed: true })).toBe("DEMO");
    expect(normalizeDataProvenance({ fixture: true })).toBe("DEMO");
    expect(normalizeDataProvenance({ demoSeedScenario: "quick" })).toBe("DEMO");
  });

  it("keeps an explicit manager confirmation authoritative over legacy demo markers", () => {
    expect(normalizeDataProvenance({ dataProvenance: "REAL", demoSeed: true })).toBe("REAL");
    expect(normalizeDataProvenance({ dataProvenance: "DEMO", fixture: true })).toBe("DEMO");
    expect(normalizeDataProvenance({ dataProvenance: "UNKNOWN", demoSeedScenario: "quick" })).toBe("UNKNOWN");
  });

  it("treats unmarked and malformed records as unknown without mutation", () => {
    const legacyRecord = { id: "legacy", dataProvenance: "real" };
    expect(normalizeDataProvenance(legacyRecord)).toBe("UNKNOWN");
    expect(withNormalizedDataProvenance(legacyRecord)).toEqual({ ...legacyRecord, dataProvenance: "UNKNOWN" });
    expect(legacyRecord.dataProvenance).toBe("real");
  });

  it("builds an isolated provenance-only audit update", () => {
    const updatedAt = { sentinel: "server-timestamp" };

    expect(buildDataProvenanceUpdate("REAL", "manager-uid", updatedAt)).toEqual({
      dataProvenance: "REAL",
      provenanceUpdatedAt: updatedAt,
      provenanceUpdatedBy: "manager-uid",
    });
  });

  it("rejects malformed provenance or a missing manager identity before a write", () => {
    expect(() => buildDataProvenanceUpdate("TEST", "manager-uid", {})).toThrow(
      "Invalid data provenance.",
    );
    expect(() => buildDataProvenanceUpdate("REAL", "", {})).toThrow(
      "manager identity",
    );
  });
});

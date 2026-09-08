import { describe, expect, it } from "vitest";
import { normalizeDataProvenance, withNormalizedDataProvenance } from "./dataProvenance.js";

describe("data provenance", () => {
  it.each(["REAL", "DEMO", "UNKNOWN"])("keeps explicit %s", (dataProvenance) => {
    expect(normalizeDataProvenance({ dataProvenance })).toBe(dataProvenance);
  });

  it("recognizes reliable legacy demo markers", () => {
    expect(normalizeDataProvenance({ demoSeed: true })).toBe("DEMO");
    expect(normalizeDataProvenance({ fixture: true })).toBe("DEMO");
    expect(normalizeDataProvenance({ demoSeedScenario: "quick" })).toBe("DEMO");
  });

  it("treats unmarked and malformed records as unknown without mutation", () => {
    const legacyRecord = { id: "legacy", dataProvenance: "real" };
    expect(normalizeDataProvenance(legacyRecord)).toBe("UNKNOWN");
    expect(withNormalizedDataProvenance(legacyRecord)).toEqual({ ...legacyRecord, dataProvenance: "UNKNOWN" });
    expect(legacyRecord.dataProvenance).toBe("real");
  });
});

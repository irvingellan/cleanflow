import { describe, expect, it } from "vitest";
import { buildChecklistRunSnapshot, projectChecklistRunForCleaner } from "./checklistRunDefinition.js";

describe("cleaner checklist Property projection", () => {
  it("does not expose manager-only access fields", () => {
    const snapshot = buildChecklistRunSnapshot({
      job: { propertyId: "property-1", propertyName: "Example Property" },
      property: {
        id: "property-1",
        name: "Example Property",
        keyCodeInfo: "manager-only key details",
        accessInstructions: "manager-only entry instructions",
        checklistSettings: { cleanerInstructions: "Clean the patio." },
      },
    });

    const projection = projectChecklistRunForCleaner(snapshot);
    const serializedProjection = JSON.stringify(projection);

    expect(serializedProjection).not.toContain("keyCodeInfo");
    expect(serializedProjection).not.toContain("accessInstructions");
    expect(serializedProjection).not.toContain("manager-only");
    expect(projection.cleanerInstructions).toBe("Clean the patio.");
  });
});

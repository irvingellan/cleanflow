import { describe, expect, it } from "vitest";
import {
  isPilotChecklistPhotoRequirement,
  maximumChecklistEvidenceSizeBytes,
  pilotChecklistPhotoRequirementId,
  projectChecklistEvidence,
} from "./checklistEvidenceDefinition.js";

const run = {
  resolvedDefinition: {
    sections: [{ items: [{ id: "living-belongings", requiresPhoto: true }, { id: "other", requiresPhoto: true }] }],
  },
};

describe("pilot checklist evidence definition", () => {
  it("allows only the validated frozen photo requirement", () => {
    expect(isPilotChecklistPhotoRequirement(run, pilotChecklistPhotoRequirementId)).toBe(true);
    expect(isPilotChecklistPhotoRequirement(run, "other")).toBe(false);
    expect(isPilotChecklistPhotoRequirement({ resolvedDefinition: { sections: [] } }, pilotChecklistPhotoRequirementId)).toBe(false);
  });

  it("projects only safe evidence display metadata", () => {
    const projection = projectChecklistEvidence({
      status: "SAVED",
      requirementId: pilotChecklistPhotoRequirementId,
      contentType: "image/jpeg",
      sizeBytes: maximumChecklistEvidenceSizeBytes,
      storagePath: "organizations/cleanflow-demo/private-object",
      contentHash: "sensitive-server-reference",
    });
    expect(projection).toEqual([{
      requirementId: pilotChecklistPhotoRequirementId,
      contentType: "image/jpeg",
      sizeBytes: maximumChecklistEvidenceSizeBytes,
      createdAt: null,
    }]);
    expect(JSON.stringify(projection)).not.toContain("storagePath");
    expect(JSON.stringify(projection)).not.toContain("sensitive-server-reference");
  });
});

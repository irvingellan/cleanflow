import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  clientReportCapabilityState,
  projectClientReport,
} from "./clientReportService.js";

function frozenRun(overrides = {}) {
  return {
    status: "READY_FOR_REVIEW",
    readyForReviewDraftRevision: 2,
    propertySnapshot: {
      propertyId: "private-property-id",
      propertyName: "Seaside House",
      accessInstructions: "private access",
    },
    jobSnapshot: {
      scheduledDate: "2026-09-23",
      managerNotes: "internal manager note",
      clientPrice: 400,
    },
    propertyChecklistSettingsSnapshot: { keyCodeInfo: "private code" },
    resolvedDefinition: {
      sections: [{
        id: "bathrooms",
        titleKey: "checklistPreview.bathrooms",
        internalField: "do not expose",
        items: [{
          id: "bathroom-sanitize",
          labelKey: "checklistPreview.bathroomSanitize",
          answer: "manager injected",
        }],
      }],
      inventoryItems: [{ id: "hand-soap", labelKey: "checklistPreview.handSoap" }],
    },
    ...overrides,
  };
}

describe("client report projection", () => {
  it("preserves saved checklist and inventory answers, notes, and photo while excluding internal fields", () => {
    const report = projectClientReport(
      frozenRun(),
      {
        revision: 2,
        checklistAnswers: { "bathroom-sanitize": "DONE" },
        inventoryAnswers: { "hand-soap": "NEEDS_RESTOCK" },
        issueNotes: "A bulb needs replacement.",
        generalNotes: "The cleaning is ready.",
      },
      {
        status: "SAVED",
        requirementId: "living-belongings",
        storagePath: "private/storage/path",
        contentHash: "private-hash",
      },
    );

    expect(report).toEqual({
      titleKey: "clientReport.title",
      propertyName: "Seaside House",
      serviceDate: "2026-09-23",
      sections: [{
        titleKey: "checklistPreview.bathrooms",
        items: [{ labelKey: "checklistPreview.bathroomSanitize", answer: "DONE" }],
      }],
      inventoryItems: [{ labelKey: "checklistPreview.handSoap", answer: "NEEDS_RESTOCK" }],
      issueNotes: "A bulb needs replacement.",
      generalNotes: "The cleaning is ready.",
      hasPhoto: true,
    });
    const serialized = JSON.stringify(report);
    for (const secret of ["private-property-id", "accessInstructions", "private access", "private code",
      "managerNotes", "clientPrice", "private/storage/path", "private-hash", "bathroom-sanitize"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("does not publish a report unless the saved READY_FOR_REVIEW revision matches", () => {
    expect(() => projectClientReport(frozenRun({ status: "DRAFT" }), null, null))
      .toThrow("A checklist ready for review is required.");
    expect(() => projectClientReport(frozenRun(), {
      revision: 1,
      checklistAnswers: { "bathroom-sanitize": "DONE" },
      inventoryAnswers: { "hand-soap": "LOW" },
      issueNotes: "",
      generalNotes: "",
    }, null))
      .toThrow("The saved checklist revision is unavailable.");
  });

  it("reports active, expired, revoked and replaced capability states without token data", () => {
    const future = Timestamp.fromMillis(Date.now() + 1000);
    const past = Timestamp.fromMillis(Date.now() - 1000);
    expect(clientReportCapabilityState(null)).toBe("NONE");
    expect(clientReportCapabilityState({ status: "ACTIVE", expiresAt: future })).toBe("ACTIVE");
    expect(clientReportCapabilityState({ status: "ACTIVE", expiresAt: past })).toBe("EXPIRED");
    expect(clientReportCapabilityState({ status: "REVOKED" })).toBe("REVOKED");
    expect(clientReportCapabilityState({ status: "REPLACED" })).toBe("REPLACED");
  });
});

import { describe, expect, it } from "vitest";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  clientReportCapabilityState,
  projectClientReport,
} from "./clientReportService.js";
import { correctChecklistAnswerForManager } from "./checklistManagerCorrection.js";
import { projectChecklistRunForManager } from "./checklistRunService.js";

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
      managerNote: "",
      summary: { tasksDone: 1, tasksNotApplicable: 0, tasksTotal: 1, photoCount: 1, restockCount: 1 },
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

  it("overlays a new stock correction for the report and preserves the original only in manager view", async () => {
    const run = frozenRun({ definitionVersion: 2 });
    const draft = {
      revision: 2,
      checklistAnswers: { "bathroom-sanitize": "DONE" },
      inventoryAnswers: { "hand-soap": "LOW" },
      inventoryQuantities: { "hand-soap": 3 },
      issueNotes: "",
      generalNotes: "",
    };
    const savedDraft = structuredClone(draft);
    const runRef = {};
    let stored;
    const database = {
      doc: () => runRef,
      runTransaction: (work) => work({
        get: async () => ({ data: () => run }),
        update: (ref, field, value) => {
          expect(ref).toBe(runRef);
          expect(field.isEqual(new FieldPath("managerCorrections", "inventory", "hand-soap"))).toBe(true);
          stored = value;
        },
      }),
    };
    const params = { organizationId: "org", jobId: "job", kind: "inventory", itemId: "hand-soap", actorUid: "fake-manager-uid" };
    await expect(correctChecklistAnswerForManager(database, { ...params, answer: { level: "EMPTY", quantity: 0 } }))
      .resolves.toEqual({ kind: "inventory", itemId: "hand-soap", corrected: true, answer: "EMPTY", quantity: 0 });
    expect(stored).toEqual({ answer: "EMPTY", quantity: 0, byUid: "fake-manager-uid", at: FieldValue.serverTimestamp() });
    run.managerCorrections = { inventory: { "hand-soap": stored } };

    expect(projectChecklistRunForManager(run, undefined, draft).inventoryItems).toEqual([
      expect.objectContaining({ answer: "EMPTY", quantity: 0, correctedByManager: true, cleanerAnswer: "LOW", originalQuantity: 3 }),
    ]);
    expect(projectClientReport(run, draft, null)).toMatchObject({
      inventoryItems: [{ labelKey: "checklistPreview.handSoap", answer: "EMPTY", quantity: 0 }],
      summary: { restockCount: 1 },
    });
    expect(projectClientReport(run, draft, null).inventoryItems[0])
      .toEqual({ labelKey: "checklistPreview.handSoap", answer: "EMPTY", quantity: 0 });

    await expect(correctChecklistAnswerForManager(database, { ...params, answer: "LOW" })).resolves.toMatchObject({ answer: "LOW" });
    run.managerCorrections.inventory["hand-soap"] = stored;
    expect(projectClientReport(run, draft, null).inventoryItems[0]).not.toHaveProperty("quantity");

    await expect(correctChecklistAnswerForManager(database, { ...params, answer: null })).resolves.toMatchObject({ corrected: false });
    expect(stored.isEqual(FieldValue.delete())).toBe(true);
    delete run.managerCorrections.inventory["hand-soap"];
    expect(projectClientReport(run, draft, null).inventoryItems[0]).toMatchObject({ answer: "LOW", quantity: 3 });
    expect(draft).toEqual(savedDraft);
  });

  it("rejects quantity corrections on legacy Runs or above the allowed stock levels", async () => {
    const run = frozenRun();
    const database = {
      doc: () => ({}),
      runTransaction: (work) => work({ get: async () => ({ data: () => run }) }),
    };
    const input = { organizationId: "org", jobId: "job", kind: "inventory", itemId: "hand-soap", actorUid: "uid" };
    await expect(correctChecklistAnswerForManager(database, { ...input, answer: { level: "LOW", quantity: 2 } }))
      .rejects.toMatchObject({ code: "invalid-argument" });
    run.definitionVersion = 2;
    for (const answer of [{ level: "HIGH", quantity: 2 }, { level: "LOW", quantity: 100 }, { level: "LOW", quantity: 1, extra: true }]) {
      await expect(correctChecklistAnswerForManager(database, { ...input, answer })).rejects.toMatchObject({ code: "invalid-argument" });
    }
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

describe("FB07 report photo visibility", () => {
  it("leaves hidden photos out of the client report while the evidence stays", async () => {
    const { projectClientReport, reportHiddenEvidenceIds } = await import("./clientReportService.js");
    const run = {
      status: "READY_FOR_REVIEW", readyForReviewDraftRevision: 0, evidencePolicy: { version: 2, maxPhotos: 60, maxTotalBytes: 1 },
      resolvedDefinition: { sections: [], inventoryItems: [] },
      reportHiddenEvidence: { "photo-bbbbbbbb": { hidden: true, reason: "wrong house" }, "photo-cccccccc": { hidden: false } },
    };
    const photos = ["photo-aaaaaaaa", "photo-bbbbbbbb", "photo-cccccccc"].map((evidenceId) => ({ evidenceId, status: "SAVED", requirementId: "additional", contentType: "image/jpeg", sizeBytes: 10 }));
    const report = projectClientReport(run, null, { photos });
    expect(report.evidence.map((photo) => photo.evidenceId)).toEqual(["photo-aaaaaaaa", "photo-cccccccc"]);
    expect([...reportHiddenEvidenceIds(run)]).toEqual(["photo-bbbbbbbb"]);
    expect(projectClientReport({ ...run, reportHiddenEvidence: { "photo-aaaaaaaa": { hidden: true }, "photo-bbbbbbbb": { hidden: true }, "photo-cccccccc": { hidden: true } } }, null, { photos }).hasPhoto).toBe(false);
  });
});

describe("client report presentation", () => {
  const draft = {
    revision: 2,
    checklistAnswers: { "bathroom-sanitize": "DONE" },
    inventoryAnswers: { "hand-soap": "HIGH" },
    issueNotes: "Internal remark about the lockbox.",
    generalNotes: "All good.",
  };

  it("adds the manager note and can leave the cleaner's notes out", async () => {
    const report = projectClientReport(frozenRun(), draft, null, { managerNote: "  Thank you!  ", includeCleanerNotes: false });
    expect(report.managerNote).toBe("Thank you!");
    expect(report.issueNotes).toBe("");
    expect(report.generalNotes).toBe("");
    expect(JSON.stringify(report)).not.toContain("lockbox");
    expect(report.summary).toEqual({ tasksDone: 1, tasksNotApplicable: 0, tasksTotal: 1, photoCount: 0, restockCount: 0 });
  });

  it("rejects an invalid presentation", async () => {
    const { normalizeClientReportPresentation, clientReportNoteMaximum } = await import("./clientReportService.js");
    expect(normalizeClientReportPresentation({})).toEqual({ managerNote: "", includeCleanerNotes: true });
    expect(() => normalizeClientReportPresentation({ managerNote: "x".repeat(clientReportNoteMaximum + 1) })).toThrow();
    expect(() => normalizeClientReportPresentation({ includeCleanerNotes: "no" })).toThrow();
    expect(() => normalizeClientReportPresentation([])).toThrow();
  });

  it("updates the active link's presentation and sent log without a new token", async () => {
    const { updateClientReportForManager } = await import("./clientReportService.js");
    const stored = { status: "ACTIVE", tokenHash: "a".repeat(64), expiresAt: Timestamp.fromMillis(Date.now() + 60_000) };
    const writes = [];
    const ref = { collection: () => ({ doc: () => ref }) };
    const database = {
      collection: ref.collection,
      doc: () => ref,
      runTransaction: async (callback) => callback({
        get: async () => ({ exists: true, data: () => stored }),
        update: (_, changes) => writes.push(changes),
      }),
    };
    const result = await updateClientReportForManager(database, {
      organizationId: "org", jobId: "job-1", actorUid: "manager", presentation: { managerNote: "Hi", includeCleanerNotes: false },
      markSent: { channel: "WHATSAPP" },
    });
    expect(result.capability.presentation).toEqual({ managerNote: "Hi", includeCleanerNotes: false });
    expect(result.capability.lastSent.channel).toBe("WHATSAPP");
    expect(writes[0].presentation).toEqual({ managerNote: "Hi", includeCleanerNotes: false });
    expect(writes[0].lastSent.byUid).toBe("manager");
    expect(JSON.stringify(result)).not.toContain("a".repeat(64));
    await expect(updateClientReportForManager(database, { organizationId: "org", jobId: "job-1", actorUid: "manager", markSent: { channel: "SMS" } }))
      .rejects.toThrow();
    stored.status = "REVOKED";
    await expect(updateClientReportForManager(database, { organizationId: "org", jobId: "job-1", actorUid: "manager", markSent: { channel: "EMAIL" } }))
      .rejects.toThrow("An active report link is required.");
  });
});

import { describe, expect, it } from "vitest";
import { maximumChecklistEvidenceSizeBytes } from "./checklistEvidenceDefinition.js";
import { normalizeImageUpload, uploadPublicChecklistEvidence } from "./checklistEvidenceService.js";

const imageFixtures = [
  ["image/jpeg", "jpg", Buffer.from([0xff, 0xd8, 0xff, 0x00])],
  ["image/png", "png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ["image/webp", "webp", Buffer.from("RIFF0000WEBP", "ascii")],
];

describe("checklist photo upload validation", () => {
  it.each(imageFixtures)("accepts a valid %s image signature", (contentType, extension, bytes) => {
    expect(normalizeImageUpload({ contentType, bytes })).toMatchObject({
      contentType,
      extension,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("rejects an oversized image before storage access", () => {
    const bytes = Buffer.alloc(maximumChecklistEvidenceSizeBytes + 1);
    Buffer.from([0xff, 0xd8, 0xff]).copy(bytes);
    let thrown;
    try {
      normalizeImageUpload({ contentType: "image/jpeg", bytes });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "invalid-argument" });
    expect(thrown.message).toContain("too large");
  });

  it.each([
    ["HEIC MIME", "image/heic", Buffer.from("ftypheic")],
    ["HEIF MIME", "image/heif", Buffer.from("ftypheif")],
    ["missing content type", undefined, imageFixtures[0][2]],
    ["incorrect content type", "image/png", imageFixtures[0][2]],
  ])("rejects %s explicitly", (_label, contentType, bytes) => {
    let thrown;
    try {
      normalizeImageUpload({ contentType, bytes });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "invalid-argument" });
  });
});

function createUploadDependencies({ save = async () => {}, transactionFailure = null, noCapability = false } = {}) {
  const organizationId = "cleanflow-demo";
  const stored = new Map();
  const evidencePath = `organizations/${organizationId}/jobs/job/checklistRuns/initial/evidence/living-belongings`;
  const capabilityPath = `organizations/${organizationId}/jobs/job/checklistRuns/initial/checklistCapabilities/active`;
  const records = new Map([
    [capabilityPath, {
      status: "ACTIVE", tokenHash: "hash", contextRevision: 0, cleanerId: "cleaner",
      expiresAt: { toMillis: () => Date.now() + 60_000 },
    }],
    [`organizations/${organizationId}/jobs/job`, {
      operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner"], checklistContextRevision: 0,
    }],
    [`organizations/${organizationId}/jobs/job/checklistRuns/initial`, {
      status: "DRAFT",
      resolvedDefinition: { sections: [{ items: [{ id: "living-belongings", requiresPhoto: true }] }] },
    }],
  ]);
  const snapshot = (path) => ({ exists: records.has(path), data: () => records.get(path) });
  const ref = (path) => ({
    path,
    get: async () => snapshot(path),
    collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
  });
  const database = {
    collectionGroup: () => ({ where: () => ({ limit: () => ({
      get: async () => noCapability ? { size: 0, docs: [] } : { size: 1, docs: [{ ref: ref(capabilityPath) }] },
    }) }) }),
    doc: ref,
    runTransaction: async (callback) => {
      if (transactionFailure) throw transactionFailure;
      return callback({
        get: async (document) => snapshot(document.path),
        create: (document, value) => records.set(document.path, value),
      });
    },
  };
  const file = { save, delete: async () => {} };
  const storage = { bucket: () => ({ file: () => file }) };
  return { database, storage, records, evidencePath, file };
}

const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const uploadArgs = {
  organizationId: "cleanflow-demo", tokenHash: "hash", requirementId: "living-belongings",
  contentType: "image/jpeg", bytes: validJpeg,
};

describe("checklist photo upload diagnostic stages", () => {
  it("marks a provider Storage failure without exposing its raw message", async () => {
    const { database, storage } = createUploadDependencies({
      save: async () => { throw Object.assign(new Error("bucket account detail"), { code: 403 }); },
    });
    await expect(uploadPublicChecklistEvidence(database, { ...uploadArgs, storage }))
      .rejects.toMatchObject({ checklistPhotoDiagnosticStage: "storage-write" });
  });

  it("marks a Firestore evidence metadata failure and cleans up the uploaded object", async () => {
    const file = { save: async () => {}, delete: async () => {} };
    let cleanupCount = 0;
    file.delete = async () => { cleanupCount += 1; };
    const { database } = createUploadDependencies({ transactionFailure: new Error("private Firestore details") });
    const storage = { bucket: () => ({ file: () => file }) };

    await expect(uploadPublicChecklistEvidence(database, { ...uploadArgs, storage }))
      .rejects.toMatchObject({ checklistPhotoDiagnosticStage: "metadata-write" });
    expect(cleanupCount).toBe(1);
  });

  it("returns confirmed evidence only after the server metadata transaction persists it", async () => {
    const { database, storage, records, evidencePath } = createUploadDependencies();
    expect(records.has(evidencePath)).toBe(false);
    const result = await uploadPublicChecklistEvidence(database, { ...uploadArgs, storage, now: new Date() });

    expect(result).toMatchObject({ duplicate: false, evidence: [{ requirementId: "living-belongings", contentType: "image/jpeg", sizeBytes: 4 }] });
    expect(records.get(evidencePath)).toMatchObject({ status: "SAVED", contentType: "image/jpeg", sizeBytes: 4 });
  });

  it("classifies a rejected capability as server validation rather than a Storage failure", async () => {
    const { database, storage } = createUploadDependencies({ noCapability: true });
    await expect(uploadPublicChecklistEvidence(database, { ...uploadArgs, storage }))
      .rejects.toMatchObject({ checklistPhotoDiagnosticStage: "server-validation" });
  });
});

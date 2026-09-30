import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { maximumChecklistEvidenceSizeBytes } from "./checklistEvidenceDefinition.js";
import { normalizeImageUpload, uploadPublicChecklistEvidence } from "./checklistEvidenceService.js";

const imageFixtures = [
  ["image/jpeg", "jpg", Buffer.from([0xff, 0xd8, 0xff, 0x00])],
  ["image/png", "png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ["image/webp", "webp", Buffer.from("RIFF0000WEBP", "ascii")],
];

function jpegBytes(size) {
  const bytes = Buffer.alloc(size);
  Buffer.from([0xff, 0xd8, 0xff]).copy(bytes);
  if (size >= 5) Buffer.from([0xff, 0xd9]).copy(bytes, size - 2);
  return bytes;
}

const rejectedUploadFixtures = [
  ["unsupported content type", "image/heic", Buffer.from("ftypheic"), "unsupported_content_type"],
  ["missing content type", undefined, imageFixtures[0][2], "unsupported_content_type"],
  ["undefined body", "image/jpeg", undefined, "invalid_body_type"],
  ["Uint8Array body", "image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]), "invalid_body_type"],
  ["Buffer-like JSON body", "image/jpeg", { type: "Buffer", data: [0xff, 0xd8, 0xff] }, "invalid_body_type"],
  ["empty body", "image/jpeg", Buffer.alloc(0), "empty_body"],
  ["oversized body", "image/jpeg", jpegBytes(maximumChecklistEvidenceSizeBytes + 1), "file_too_large"],
  ["truncated JPEG signature", "image/jpeg", Buffer.from([0xff, 0xd8]), "signature_unrecognized"],
  ["random bytes", "image/jpeg", Buffer.from([0x01, 0x02, 0x03, 0x04]), "signature_unrecognized"],
  ["missing JPEG expected signature byte", "image/jpeg", Buffer.from([0xff, 0xd8, 0x00]), "signature_unrecognized"],
  ["JPEG declaration with PNG signature", "image/jpeg", imageFixtures[1][2], "signature_mismatch"],
  ["PNG declaration with JPEG signature", "image/png", imageFixtures[0][2], "signature_mismatch"],
];

describe("checklist photo upload validation", () => {
  it.each(imageFixtures)("accepts a valid %s image signature", (contentType, extension, bytes) => {
    expect(normalizeImageUpload({ contentType, bytes })).toMatchObject({
      contentType,
      extension,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it.each([0.5, 2, 4])("preserves an accepted JPEG-signature payload of %s MiB", (megabytes) => {
    const bytes = jpegBytes(megabytes * 1024 * 1024);
    const result = normalizeImageUpload({ contentType: "image/jpeg", bytes });

    expect(result).toMatchObject({
      contentType: "image/jpeg",
      extension: "jpg",
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(bytes.length).toBe(megabytes * 1024 * 1024);
  });

  it.each(rejectedUploadFixtures)("identifies %s using one non-enumerable safe reason", (_label, contentType, bytes, reason) => {
    let thrown;
    try {
      normalizeImageUpload({ contentType, bytes });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: "invalid-argument", checklistPhotoValidationReason: reason });
    expect(Object.getOwnPropertyDescriptor(thrown, "checklistPhotoValidationReason").enumerable).toBe(false);
    expect(Object.keys(thrown)).not.toContain("checklistPhotoValidationReason");
    expect(thrown.details).toBeUndefined();
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

function createUploadDependencies({ save = vi.fn(async () => {}), transactionFailure = null, noCapability = false, beforeTransaction = null } = {}) {
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
    collectionGroup: vi.fn(() => ({ where: () => ({ limit: () => ({
      get: async () => noCapability ? { size: 0, docs: [] } : { size: 1, docs: [{ ref: ref(capabilityPath) }] },
    }) }) })),
    doc: ref,
    runTransaction: async (callback) => {
      if (transactionFailure) throw transactionFailure;
      beforeTransaction?.(records);
      return callback({
        get: async (document) => snapshot(document.path),
        create: (document, value) => records.set(document.path, value),
      });
    },
  };
  const file = { save, delete: vi.fn(async () => {}) };
  const storage = { bucket: vi.fn(() => ({ file: () => file })) };
  return { database, storage, records, evidencePath, capabilityPath, file };
}

const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const uploadArgs = {
  organizationId: "cleanflow-demo", tokenHash: "hash", requirementId: "living-belongings",
  contentType: "image/jpeg", bytes: validJpeg,
};

describe("checklist photo upload diagnostic stages", () => {
  it.each(rejectedUploadFixtures)("rejects %s before any capability read or Storage access", async (_label, contentType, bytes, reason) => {
    const { database, storage } = createUploadDependencies();

    await expect(uploadPublicChecklistEvidence(database, { ...uploadArgs, contentType, bytes, storage }))
      .rejects.toMatchObject({
        code: "invalid-argument",
        checklistPhotoDiagnosticStage: "server-validation",
        checklistPhotoValidationReason: reason,
      });
    expect(database.collectionGroup).not.toHaveBeenCalled();
    expect(storage.bucket).not.toHaveBeenCalled();
  });
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
      .rejects.toMatchObject({ checklistPhotoDiagnosticStage: "server-validation", checklistPhotoValidationReason: "capability_unavailable" });
    expect(storage.bucket).not.toHaveBeenCalled();
  });

  it("keeps a successful same-content retry idempotent without another Storage write", async () => {
    const { database, storage, records, evidencePath, file } = createUploadDependencies();
    const first = await uploadPublicChecklistEvidence(database, { ...uploadArgs, storage });
    const storedEvidence = records.get(evidencePath);
    const retry = await uploadPublicChecklistEvidence(database, { ...uploadArgs, storage });

    expect(first.duplicate).toBe(false);
    expect(retry).toEqual({ ...first, duplicate: true });
    expect(records.get(evidencePath)).toBe(storedEvidence);
    expect(file.save).toHaveBeenCalledTimes(1);
    expect(file.save.mock.calls[0][0]).toBe(validJpeg);
  });

  it.each([
    ["run_not_draft", (records) => { records.get("organizations/cleanflow-demo/jobs/job/checklistRuns/initial").status = "READY_FOR_REVIEW"; }],
    ["invalid_requirement", (records) => { records.get("organizations/cleanflow-demo/jobs/job/checklistRuns/initial").resolvedDefinition.sections[0].items[0].requiresPhoto = false; }],
    ["evidence_exists", (records) => { records.set("organizations/cleanflow-demo/jobs/job/checklistRuns/initial/evidence/living-belongings", { status: "SAVED", contentHash: "different-content" }); }],
    ["capability_unavailable", (records) => { records.get("organizations/cleanflow-demo/jobs/job/checklistRuns/initial/checklistCapabilities/active").status = "REVOKED"; }],
  ])("distinguishes initial %s without a Storage write", async (reason, changeContext) => {
    const { database, storage, records } = createUploadDependencies();
    changeContext(records);

    await expect(uploadPublicChecklistEvidence(database, { ...uploadArgs, storage }))
      .rejects.toMatchObject({ checklistPhotoDiagnosticStage: "server-validation", checklistPhotoValidationReason: reason });
    expect(storage.bucket).not.toHaveBeenCalled();
  });

  it.each([
    ["run_not_draft", (records) => { records.get("organizations/cleanflow-demo/jobs/job/checklistRuns/initial").status = "READY_FOR_REVIEW"; }],
    ["invalid_requirement", (records) => { records.get("organizations/cleanflow-demo/jobs/job/checklistRuns/initial").resolvedDefinition.sections[0].items[0].requiresPhoto = false; }],
    ["evidence_exists", (records) => { records.set("organizations/cleanflow-demo/jobs/job/checklistRuns/initial/evidence/living-belongings", { status: "SAVED", contentHash: "different-content" }); }],
    ["capability_unavailable", (records) => { records.get("organizations/cleanflow-demo/jobs/job/checklistRuns/initial/checklistCapabilities/active").status = "REVOKED"; }],
  ])("preserves the final transaction %s rejection and cleans up the object", async (reason, beforeTransaction) => {
    const { database, storage, file } = createUploadDependencies({ beforeTransaction });

    await expect(uploadPublicChecklistEvidence(database, { ...uploadArgs, storage }))
      .rejects.toMatchObject({ checklistPhotoDiagnosticStage: "server-validation", checklistPhotoValidationReason: reason });
    expect(file.save).toHaveBeenCalledTimes(1);
    expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });
});

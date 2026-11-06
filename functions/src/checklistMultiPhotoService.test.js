import { describe, expect, it } from "vitest";
import { createChecklistEvidencePolicy } from "./checklistEvidenceDefinition.js";
import { uploadPublicChecklistEvidence, loadPublicChecklistEvidence } from "./checklistEvidenceService.js";
import { removePublicChecklistEvidence } from "./checklistMultiPhotoService.js";
import { syntheticChecklistPng } from "../../security/syntheticChecklistImages.mjs";

const root = "organizations/cleanflow-demo/jobs/job/checklistRuns/initial";
const photo = syntheticChecklistPng;
function fixture(policy = { version: 2, maxPhotos: 20, maxTotalBytes: 50 * 1024 * 1024 }) {
  const records = new Map([
    [root, { organizationId: "cleanflow-demo", jobId: "job", status: "DRAFT", evidencePolicy: policy, resolvedDefinition: { sections: [{ items: [{ id: "living-belongings", requiresPhoto: true }] }] } }],
    ["organizations/cleanflow-demo/jobs/job", { operationalStatus: "ASSIGNED", assignedCleanerIds: ["cleaner"], checklistContextRevision: 0 }],
    [`${root}/checklistCapabilities/active`, { organizationId: "cleanflow-demo", jobId: "job", runId: "initial", status: "ACTIVE", tokenHash: "hash", cleanerId: "cleaner", contextRevision: 0, rotation: 1, expiresAt: { toMillis: () => Date.now() + 60_000 } }],
  ]);
  const snap = path => ({ exists: records.has(path), data: () => records.get(path) });
  const ref = path => ({ path, get: async () => snap(path), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  let queue = Promise.resolve();
  const database = {
    doc: ref,
    collectionGroup: () => ({ where: () => ({ limit: () => ({ get: async () => ({ size: 1, docs: [{ ref: ref(`${root}/checklistCapabilities/active`) }] }) }) }) }),
    runTransaction: callback => {
      const call = queue.then(async () => {
        const writes = [];
        const result = await callback({ get: async r => snap(r.path), set: (r, v) => writes.push(() => records.set(r.path, v)), create: (r, v) => writes.push(() => records.set(r.path, v)), update: (r, v) => writes.push(() => records.set(r.path, { ...records.get(r.path), ...v })), delete: r => writes.push(() => records.delete(r.path)) });
        if (database.failCommit) { database.failCommit = false; throw new Error("synthetic failed commit"); }
        writes.forEach(w => w());
        if (database.ambiguousCommit) { database.ambiguousCommit = false; throw new Error("synthetic lost commit response"); }
        return result;
      });
      queue = call.catch(() => {});
      return call;
    },
  };
  const objects = new Map();
  const hooks = {};
  const storage = { bucket: () => ({ file: (path, fileOptions) => ({
    save: async bytes => { await hooks.beforeSave?.(); objects.set(path, bytes); await hooks.onSave?.(); },
    getMetadata: async () => { if (!objects.has(path)) throw Object.assign(new Error("missing"), { code: 404 }); return [{ generation: "1" }]; },
    delete: async () => { expect(fileOptions.preconditionOpts.ifGenerationMatch).toBe("1"); expect(fileOptions.generation).toBe("1"); await hooks.onDelete?.(); objects.delete(path); },
  }) }) };
  const upload = (n = 1, requirementId = "living-belongings", extra = {}) => uploadPublicChecklistEvidence(database, { organizationId: "cleanflow-demo", tokenHash: "hash", contentType: "image/png", bytes: photo(n), requirementId, storage, attemptStorage: storage, ...extra });
  const remove = (evidenceId, mutationId = "remove-one") => removePublicChecklistEvidence(database, { organizationId: "cleanflow-demo", tokenHash: "hash", evidenceId, mutationId, storage });
  return { records, database, objects, storage, upload, remove, hooks };
}

describe("V2 multi-photo evidence", () => {
  it("freezes configurable defaults and rejects excessive trusted policy", () => {
    expect(createChecklistEvidencePolicy()).toEqual({ version: 2, maxPhotos: 60, maxTotalBytes: 120 * 1024 * 1024 });
    // Runs created before FB05 keep a valid 20-photo / 50 MB policy.
    expect(createChecklistEvidencePolicy({ maxPhotos: 20, maxTotalBytes: 50 * 1024 * 1024 })).toEqual({ version: 2, maxPhotos: 20, maxTotalBytes: 50 * 1024 * 1024 });
    expect(() => createChecklistEvidencePolicy({ maxPhotos: 61 })).toThrow();
    expect(() => createChecklistEvidencePolicy({ maxTotalBytes: 151 * 1024 * 1024 })).toThrow();
  });
  it("appends safe opaque stable identities and returns the complete gallery on duplicate", async () => {
    const f = fixture();
    const first = await f.upload();
    const second = await f.upload(2, "additional");
    const retry = await f.upload();
    expect(second.evidence).toHaveLength(2);
    expect(retry).toMatchObject({ duplicate: true, evidence: second.evidence });
    expect(first.evidence[0].evidenceId).toMatch(/^[a-f0-9-]{36}$/);
    expect(first.evidenceRevision).toBe(1);
    expect(second.evidenceRevision).toBe(2);
    expect(retry.evidenceRevision).toBe(2);
    expect(Object.keys(second.evidence[0]).sort()).toEqual(["contentType", "createdAt", "evidenceId", "requirementId", "sizeBytes"]);
    expect(f.objects.size).toBe(2);
  });
  it("reserves concurrent count and bytes before Storage", async () => {
    const f = fixture({ version: 2, maxPhotos: 1, maxTotalBytes: 100 });
    const results = await Promise.allSettled([f.upload(), f.upload(2)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(results.find(x => x.status === "rejected").reason.code).toBe("resource-exhausted");
    expect(f.objects.size).toBe(1);
    const bytes = fixture({ version: 2, maxPhotos: 20, maxTotalBytes: 100 });
    await bytes.upload();
    await expect(bytes.upload(2)).rejects.toMatchObject({ code: "resource-exhausted" });
  });
  it("rejects duplicate in-flight content without creating a second object", async () => {
    const f = fixture();
    const results = await Promise.allSettled([f.upload(), f.upload()]);
    expect(f.objects.size).toBe(1);
    expect(results.some(x => x.status === "fulfilled")).toBe(true);
  });
  it("rejects a duplicate with another purpose without claiming required evidence", async () => {
    const f = fixture();
    await f.upload(1, "additional");
    await expect(f.upload(1, "living-belongings")).rejects.toMatchObject({ code: "already-exists" });
    expect(f.records.has(`${root}/evidence/living-belongings`)).toBe(false);
  });
  it("retains quota for failed cleanup and reclaims it only after confirmed deletion", async () => {
    const f = fixture({ version: 2, maxPhotos: 1, maxTotalBytes: 100 });
    f.hooks.onSave = () => { f.database.failCommit = true; };
    f.hooks.onDelete = () => { throw new Error("synthetic deletion outage"); };
    await expect(f.upload()).rejects.toThrow();
    expect(f.records.get(`${root}/evidenceState/current`).pending).toHaveLength(1);
    await expect(f.upload(2)).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(f.objects.size).toBe(1);
    delete f.hooks.onSave;
    delete f.hooks.onDelete;
    await f.upload(2);
    expect(f.objects.size).toBe(1);
    expect(f.records.get(`${root}/evidenceState/current`).pending).toHaveLength(0);
  });
  it("caps content and removal history even when all saved photos have been removed", async () => {
    const f = fixture();
    f.records.set(`${root}/evidenceState/current`, { photos: [], pending: [], contentCount: 150 });
    await expect(f.upload()).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(f.objects.size).toBe(0);
  });
  it("retains uncertain writer obligations after expiry while allowing retries within remaining capacity", async () => {
    const f = fixture();
    const transaction = f.database.runTransaction;
    f.hooks.onSave = () => {
      let failures = 2;
      f.database.runTransaction = callback => failures-- > 0 ? Promise.reject(new Error("uncertain Firestore outage")) : transaction(callback);
    };
    await expect(f.upload()).rejects.toThrow();
    expect(f.objects.size).toBe(1);
    expect(f.records.get(`${root}/evidenceState/current`).pending).toHaveLength(1);
    f.database.runTransaction = transaction;
    delete f.hooks.onSave;
    f.records.get(`${root}/checklistCapabilities/active`).expiresAt = { toMillis: () => Date.now() + 600_000 };
    await f.upload(2, "living-belongings", { now: new Date(Date.now() + 180_000) });
    expect(f.objects.size).toBe(2);
    expect(f.records.get(`${root}/evidenceState/current`).pending).toHaveLength(1);
  });
  it("retains a charged obligation when an expired writer creates its object after an observed 404", async () => {
    const f = fixture({ version: 2, maxPhotos: 2, maxTotalBytes: 1000 });
    f.records.get(`${root}/checklistCapabilities/active`).expiresAt = { toMillis: () => Date.now() + 600_000 };
    let releaseWrite;
    let signalStarted;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const hold = new Promise(resolve => { releaseWrite = resolve; });
    f.hooks.beforeSave = async () => { delete f.hooks.beforeSave; signalStarted(); await hold; };
    const oldUpload = f.upload();
    await started;
    const future = new Date(Date.now() + 180_000);
    const retry = await f.upload(1, "living-belongings", { now: future });
    expect(retry.evidence).toHaveLength(1);
    const transaction = f.database.runTransaction;
    f.database.runTransaction = () => Promise.reject(new Error("synthetic crashed writer recovery"));
    releaseWrite();
    await expect(oldUpload).rejects.toThrow();
    f.database.runTransaction = transaction;
    expect(f.objects.size).toBe(2);
    expect(f.records.get(`${root}/evidenceState/current`).pending).toHaveLength(1);
    await expect(f.upload(2, "additional", { now: future })).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(f.records.get(`${root}/evidenceState/current`).pending).toHaveLength(1);
  });
  it.each(["beforeSave", "onSave"])("keeps rejected %s writes charged whether the object is absent or visible", async hook => {
    const f = fixture({ version: 2, maxPhotos: 2, maxTotalBytes: 1000 });
    f.hooks[hook] = () => { throw new Error("synthetic unknown write outcome"); };
    await expect(f.upload()).rejects.toThrow("synthetic unknown write outcome");
    delete f.hooks[hook];
    expect(f.records.get(`${root}/evidenceState/current`).pending[0]).toMatchObject({ status: "CLEANUP", writerSettled: false });
    await f.upload(1, "living-belongings");
    expect(f.records.get(`${root}/evidenceState/current`).pending).toHaveLength(1);
    expect(f.objects.size).toBe(hook === "beforeSave" ? 1 : 2);
    await expect(f.upload(2, "additional")).rejects.toMatchObject({ code: "resource-exhausted" });
  });
  it("removes a saved photo, releases quota, and prevents upload replay resurrecting it", async () => {
    const f = fixture({ version: 2, maxPhotos: 1, maxTotalBytes: 100 });
    const first = await f.upload();
    expect(await f.remove(first.evidence[0].evidenceId)).toMatchObject({ duplicate: false, evidence: [] });
    expect(await f.remove(first.evidence[0].evidenceId)).toMatchObject({ duplicate: true, evidence: [] });
    await expect(f.upload()).rejects.toMatchObject({ code: "failed-precondition" });
    await f.upload(2);
    expect(f.objects.size).toBe(1);
  });
  it("rejects removal after review and mutation-id reuse for another photo", async () => {
    const f = fixture();
    const a = await f.upload();
    const b = await f.upload(2, "additional");
    await f.remove(a.evidence[0].evidenceId);
    await expect(f.remove(b.evidence[1].evidenceId)).rejects.toMatchObject({ code: "already-exists" });
    f.records.get(root).status = "READY_FOR_REVIEW";
    await expect(f.remove(b.evidence[1].evidenceId, "another-remove")).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it.each(["revoked", "expired", "context", "organization"])("rechecks %s authorization after Storage and cleans only owned object", async reason => {
    const f = fixture();
    f.hooks.onSave = () => {
      const cap = f.records.get(`${root}/checklistCapabilities/active`);
      if (reason === "revoked") cap.status = "REVOKED";
      if (reason === "expired") cap.expiresAt = { toMillis: () => 1 };
      if (reason === "context") cap.contextRevision = 2;
      if (reason === "organization") cap.organizationId = "another";
    };
    await expect(f.upload()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(f.objects.size).toBe(0);
  });
  it("cleans a definite failed metadata commit and recovers an ambiguous successful commit", async () => {
    const f = fixture();
    f.hooks.onSave = () => { f.database.failCommit = true; };
    await expect(f.upload()).rejects.toThrow();
    expect(f.objects.size).toBe(0);
    f.hooks.onSave = () => { f.database.ambiguousCommit = true; };
    expect((await f.upload()).evidence).toHaveLength(1);
    expect(f.objects.size).toBe(1);
  });
  it("rejects metadata-bearing JPEG before a V2 object is created", async () => {
    const f = fixture();
    await expect(f.upload(1, "additional", { contentType: "image/jpeg", bytes: Buffer.from([255,216,255,225,0,8,69,120,105,102,0,0,255,217]) })).rejects.toMatchObject({ code: "invalid-argument" });
    expect(f.objects.size).toBe(0);
  });
  it("returns the persisted gallery after refresh", async () => {
    const f = fixture();
    const result = await f.upload();
    expect(await loadPublicChecklistEvidence(f.database, { organizationId: "cleanflow-demo", tokenHash: "hash", storage: f.storage })).toEqual(result.evidence);
  });
});

import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  getMyJobAccessPhoto, getPropertyAccessPhoto, removePropertyAccessPhoto, uploadPropertyAccessPhoto,
} from "./propertyAccessPhotos.js";

const org = "fixture-org";
const root = `organizations/${org}`;
const propertyPath = `${root}/properties/house`;
const jobPath = `${root}/jobs/job`;
const photoId = "a".repeat(32);
const objectPath = `${propertyPath}/accessPhotos/${photoId}.jpg`;
const managerAuth = { uid: "manager", token: { firebase: { sign_in_provider: "password" } } };
const cleanerAuth = {
  uid: "cleaner-account",
  token: { cleanerHub: { organizationId: org, cleanerId: "cleaner", sessionId: "session" } },
};
const serviceDay = Date.parse("2026-11-10T20:00:00Z");
let jpeg;

beforeAll(async () => {
  jpeg = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "orange" } })
    .jpeg().withMetadata({ orientation: 6 }).withExifMerge({
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "1/1 2/1 3/1" },
    }).toBuffer();
  expect((await sharp(jpeg).metadata()).exif).toBeDefined();
});

function fixture(photos = [{ id: photoId, caption: "Gate" }]) {
  const docs = new Map([
    [propertyPath, { organizationId: org, cleanerAccess: { shared: true }, cleanerAccessPhotos: photos }],
    [jobPath, { organizationId: org, propertyId: "house", schemaVersion: 2, assignedCleanerIds: ["cleaner"], operationalStatus: "ASSIGNED", scheduledDate: "2026-11-10" }],
    [`${root}/members/manager`, { role: "MANAGER", active: true }],
    [`${root}/members/inactive`, { role: "MANAGER", active: false }],
    ["organizations/other/members/other", { role: "MANAGER", active: true }],
    [`${root}/members/cleaner-account`, { role: "CLEANER", active: true, organizationId: org, cleanerId: "cleaner", sessionIds: ["session"] }],
    [`${root}/cleaners/cleaner`, { active: true }],
  ]);
  const doc = (path) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    collection: (name) => collection(`${path}/${name}`),
  });
  const collection = (path) => ({ doc: (id) => doc(`${path}/${id}`) });
  const objects = new Map([[objectPath, Buffer.from("synthetic bytes")]]);
  const calls = [];
  const update = (path, value) => docs.set(path, { ...docs.get(path), ...value });
  let queued = Promise.resolve();
  const database = { doc, collection, runTransaction: vi.fn((operation) => {
    const execution = queued.then(async () => {
      const writes = [];
      const result = await operation({ get: (ref) => ref.get(), update: (ref, values) => writes.push([ref.path, values]) });
      for (const [path, values] of writes) {
        calls.push(["commit", path]);
        update(path, values);
      }
      return result;
    });
    queued = execution.catch(() => {});
    return execution;
  }) };
  const missing = () => Object.assign(new Error("Synthetic provider path"), { code: 404 });
  const file = vi.fn((path) => ({
    async save(bytes, options) { calls.push(["save", path, options]); objects.set(path, bytes); },
    async download() {
      calls.push(["download", path]);
      if (!objects.has(path)) throw missing();
      return [objects.get(path)];
    },
    async delete() {
      calls.push(["delete", path]);
      if (!objects.delete(path)) throw missing();
    },
  }));
  const storage = { bucket: () => ({ file }) };
  return { docs, update, objects, calls, file, database, storage };
}

function upload(f, data, auth = managerAuth) {
  return uploadPropertyAccessPhoto(f.database, f.storage, { auth, data: {
    propertyId: "house", contentType: "image/jpeg", dataBase64: jpeg.toString("base64"), ...data,
  } }, org);
}

function managerPhoto(operation, f, data, auth = managerAuth) {
  return operation(f.database, f.storage, { auth, data: { propertyId: "house", photoId, ...data } }, org);
}

function cleanerPhoto(f, data, auth = cleanerAuth, now = serviceDay) {
  return getMyJobAccessPhoto(f.database, f.storage, {
    auth, data: { jobId: "job", photoId, ...data },
  }, org, now);
}

describe("Property access photos", () => {
  it("stores a rotated, resized and metadata-free JPEG before publishing its metadata", async () => {
    const f = fixture([]);
    const { photo } = await upload(f, { caption: "  Side gate  ", photoId: "client-supplied" });
    const path = `${propertyPath}/accessPhotos/${photo.id}.jpg`;
    expect(photo.id).toMatch(/^[a-f0-9]{32}$/);
    const bytes = f.objects.get(path);
    expect(photo).toEqual({
      id: photo.id, caption: "Side gate", sizeBytes: bytes.length, width: 800, height: 1600,
      createdAt: expect.objectContaining({ seconds: expect.any(Number) }), createdByUid: "manager",
    });
    expect(f.calls).toEqual([
      ["save", path, { resumable: false, metadata: { contentType: "image/jpeg", cacheControl: "private, no-store" },
        preconditionOpts: { ifGenerationMatch: 0 } }],
      ["commit", propertyPath],
    ]);
    const metadata = await sharp(bytes).metadata();
    expect(metadata).toMatchObject({ format: "jpeg", width: 800, height: 1600 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(f.docs.get(propertyPath).cleanerAccessPhotos).toEqual([photo]);
    const expected = { contentType: "image/jpeg", dataBase64: bytes.toString("base64") };
    expect(await managerPhoto(getPropertyAccessPhoto, f, { photoId: photo.id })).toEqual(expected);
    expect(await cleanerPhoto(f, { photoId: photo.id, propertyId: "caller-cannot-select-property" })).toEqual(expected);
  });

  it("accepts a small PNG without enlarging it and allows a missing caption", async () => {
    const f = fixture([]);
    const png = await sharp({ create: { width: 20, height: 30, channels: 3, background: "green" } }).png().toBuffer();
    const { photo } = await upload(f, { contentType: "image/png", dataBase64: png.toString("base64") });
    expect(photo).toMatchObject({ width: 20, height: 30, caption: "" });
  });

  it.each([
    ["non-image", { dataBase64: "aGVsbG8=" }],
    ["truncated JPEG", { dataBase64: "/9j/" }],
    ["MIME mismatch", { contentType: "image/png" }],
    ["invalid base64", { dataBase64: "!!!!" }],
    ["long caption", { caption: "c".repeat(121) }],
    ["non-text caption", { caption: { text: "caption" } }],
  ])("rejects %s before touching Storage", async (_name, input) => {
    const f = fixture();
    await expect(upload(f, input)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(f.file).not.toHaveBeenCalled();
  });

  it("accepts a 10 MiB input and rejects a 10 MiB plus one byte input", async () => {
    const f = fixture();
    const padded = Buffer.alloc(10 * 1024 * 1024 + 1);
    jpeg.copy(padded);
    await expect(upload(f, { dataBase64: padded.subarray(0, -1).toString("base64") })).resolves.toHaveProperty("photo");
    f.file.mockClear();
    await expect(upload(f, { dataBase64: padded.toString("base64") })).rejects.toMatchObject({ code: "invalid-argument" });
    expect(f.file).not.toHaveBeenCalled();
  });

  it("caps concurrent uploads at eight and cleans up the rejected object", async () => {
    const f = fixture(Array.from({ length: 7 }, (_, index) => ({ id: String(index) })));
    const results = await Promise.allSettled([upload(f), upload(f)]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(results.find((result) => result.status === "rejected").reason.code).toBe("failed-precondition");
    expect(f.docs.get(propertyPath).cleanerAccessPhotos).toHaveLength(8);
    expect(f.calls.filter(([name]) => name === "delete")).toHaveLength(1);
    const saved = results.find((result) => result.status === "fulfilled").value.photo;
    expect(f.objects.has(`${propertyPath}/accessPhotos/${saved.id}.jpg`)).toBe(true);
    f.file.mockClear();
    await expect(upload(f)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(f.file).not.toHaveBeenCalled();
  });

  it("does not publish metadata when saving the object fails", async () => {
    const f = fixture([]);
    f.file.mockReturnValueOnce({ save: async () => { throw new Error(objectPath); } });
    await expect(upload(f)).rejects.toMatchObject({ code: "unavailable", message: "The access photo is temporarily unavailable." });
    expect(f.database.runTransaction).not.toHaveBeenCalled();
  });

  it.each([false, true])("handles a transaction transport error with metadata committed: %s", async (committed) => {
    const f = fixture([]);
    const transaction = f.database.runTransaction.getMockImplementation();
    f.database.runTransaction.mockImplementationOnce(async (operation) => {
      if (committed) await transaction(operation);
      throw new Error(objectPath);
    });
    if (committed) {
      const { photo } = await upload(f);
      expect(f.objects.has(`${propertyPath}/accessPhotos/${photo.id}.jpg`)).toBe(true);
    } else {
      await expect(upload(f)).rejects.toMatchObject({ code: "unavailable" });
      expect(f.calls.map(([operation]) => operation)).toEqual(["save", "delete"]);
      expect(f.docs.get(propertyPath).cleanerAccessPhotos).toEqual([]);
    }
  });

  it.each([true, false])("deletes the object before removing metadata (object exists: %s)", async (exists) => {
    const f = fixture();
    if (!exists) f.objects.delete(objectPath);
    await expect(managerPhoto(removePropertyAccessPhoto, f)).resolves.toEqual({ removed: true });
    expect(f.calls).toEqual([["delete", objectPath], ["commit", propertyPath]]);
    expect(f.docs.get(propertyPath).cleanerAccessPhotos).toEqual([]);
    expect(await managerPhoto(removePropertyAccessPhoto, f)).toEqual({ removed: true });
    expect(f.objects.has(objectPath)).toBe(false);
  });

  it("keeps metadata when Storage deletion fails and can retry after a failed metadata update", async () => {
    const f = fixture();
    f.file.mockReturnValueOnce({ delete: async () => { throw new Error(objectPath); } });
    await expect(managerPhoto(removePropertyAccessPhoto, f)).rejects.toMatchObject({ code: "unavailable" });
    expect(f.docs.get(propertyPath).cleanerAccessPhotos).toHaveLength(1);
    f.database.runTransaction.mockRejectedValueOnce(new Error("temporary Firestore failure"));
    await expect(managerPhoto(removePropertyAccessPhoto, f)).rejects.toThrow();
    await expect(cleanerPhoto(f)).resolves.toEqual({ state: "not-available" });
    await expect(managerPhoto(removePropertyAccessPhoto, f)).resolves.toEqual({ removed: true });
  });

  it.each([
    [null, "unauthenticated"],
    [{ uid: "manager", token: { firebase: { sign_in_provider: "anonymous" } } }, "unauthenticated"],
    [{ uid: "other", token: {} }, "permission-denied"],
    [{ uid: "inactive", token: {} }, "permission-denied"],
    [cleanerAuth, "permission-denied"],
  ])("rejects unauthorized manager operations for %j", async (auth, code) => {
    const f = fixture();
    await expect(upload(f, {}, auth)).rejects.toMatchObject({ code });
    for (const op of [getPropertyAccessPhoto, removePropertyAccessPhoto]) {
      await expect(managerPhoto(op, f, {}, auth)).rejects.toMatchObject({ code });
    }
    expect(f.file).not.toHaveBeenCalled();
  });

  it.each(["a/b", "..", "x".repeat(257)])("rejects invalid id segments before reading Storage: %s", async (bad) => {
    const f = fixture();
    await expect(upload(f, { propertyId: bad })).rejects.toMatchObject({ code: "invalid-argument" });
    for (const op of [getPropertyAccessPhoto, removePropertyAccessPhoto]) {
      await expect(managerPhoto(op, f, { photoId: bad })).rejects.toMatchObject({ code: "invalid-argument" });
    }
    await expect(cleanerPhoto(f, { photoId: bad })).resolves.toEqual({ state: "denied" });
    await expect(cleanerPhoto(f, { jobId: bad })).resolves.toEqual({ state: "denied" });
    f.update(jobPath, { propertyId: bad });
    await expect(cleanerPhoto(f)).resolves.toEqual({ state: "not-provided" });
    expect(f.file).not.toHaveBeenCalled();
  });

  it("does not fetch an unlisted object or cross a Property's organization boundary", async () => {
    const f = fixture([]);
    await expect(cleanerPhoto(f)).resolves.toEqual({ state: "not-provided" });
    f.update(propertyPath, { cleanerAccessPhotos: [{ id: "b".repeat(32) }] });
    await expect(cleanerPhoto(f)).resolves.toEqual({ state: "not-available" });
    await expect(managerPhoto(getPropertyAccessPhoto, f)).rejects.toMatchObject({ code: "not-found" });
    await expect(managerPhoto(removePropertyAccessPhoto, f)).resolves.toEqual({ removed: true });
    f.update(propertyPath, { organizationId: "other", cleanerAccessPhotos: [{ id: photoId }] });
    await expect(managerPhoto(getPropertyAccessPhoto, f)).rejects.toMatchObject({ code: "not-found" });
    await expect(cleanerPhoto(f)).resolves.toEqual({ state: "denied" });
    expect(f.file).not.toHaveBeenCalled();
  });

  it("requires a signed-in cleaner with a current active session", async () => {
    const f = fixture();
    await expect(cleanerPhoto(f, {}, null)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(cleanerPhoto(f, {}, managerAuth)).rejects.toMatchObject({ code: "permission-denied" });
    f.update(`${root}/members/cleaner-account`, { sessionIds: ["new-session"] });
    await expect(cleanerPhoto(f)).rejects.toMatchObject({ code: "permission-denied" });
    expect(f.file).not.toHaveBeenCalled();
  });

  it.each([
    ["off the roster", { assignedCleanerIds: ["another"] }, {}, serviceDay, "denied"],
    ["unshared", {}, { cleanerAccess: { shared: false } }, serviceDay, "not-provided"],
    ["completed", { operationalStatus: "COMPLETED" }, {}, serviceDay, "closed"],
    ["archived", { archivedAt: {} }, {}, serviceDay, "denied"],
    ["too early", {}, {}, Date.parse("2026-11-08T20:00:00Z"), "not-yet"],
    ["too late", {}, {}, Date.parse("2026-11-11T20:00:00Z"), "closed"],
    ["missing date", { scheduledDate: null }, {}, serviceDay, "no-date"],
  ])("does not read bytes when the Job is %s", async (_label, job, property, now, state) => {
    const f = fixture();
    f.update(jobPath, job);
    f.update(propertyPath, property);
    await expect(cleanerPhoto(f, {}, cleanerAuth, now)).resolves.toEqual({ state });
    expect(f.file).not.toHaveBeenCalled();
  });

  it("keeps the photo available past the scheduled day while the Job is in progress", async () => {
    const f = fixture();
    f.update(jobPath, { operationalStatus: "IN_PROGRESS" });
    await expect(cleanerPhoto(f, {}, cleanerAuth, Date.parse("2026-11-11T20:00:00Z")))
      .resolves.toEqual({ contentType: "image/jpeg", dataBase64: Buffer.from("synthetic bytes").toString("base64") });
  });
});

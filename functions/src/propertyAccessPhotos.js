import { randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import sharp from "sharp";
import { normalizeImageUpload } from "./checklistEvidenceService.js";
import { requireActiveCleaner } from "./cleanerHubAccess.js";
import { loadCleanerJobAccessContext } from "./cleanerJobAccess.js";
import { requireOrganizationManager } from "./managerAuthorization.js";
import { validInboxSegment } from "./notificationInboxEvents.js";

const maximumPhotos = 8;
const maximumInputBytes = 10 * 1024 * 1024;
const jpeg = "image/jpeg";

function propertyReference(database, organizationId, propertyId) {
  if (![organizationId, propertyId].every(validInboxSegment)) {
    throw new HttpsError("invalid-argument", "Invalid property.");
  }
  return database.doc(`organizations/${organizationId}/properties/${propertyId}`);
}

function photoFile(storage, organizationId, propertyId, photoId) {
  if (![organizationId, propertyId, photoId].every(validInboxSegment)) {
    throw new HttpsError("invalid-argument", "Invalid photo.");
  }
  return storage.bucket().file(`organizations/${organizationId}/properties/${propertyId}/accessPhotos/${photoId}.jpg`);
}

function propertyPhotos(snapshot, organizationId) {
  const property = snapshot.data();
  if (!property || (property.organizationId != null && property.organizationId !== organizationId)) {
    throw new HttpsError("not-found", "Property is unavailable.");
  }
  return Array.isArray(property.cleanerAccessPhotos) ? property.cleanerAccessPhotos : [];
}

function requireSpace(photos) {
  if (photos.length >= maximumPhotos) throw new HttpsError("failed-precondition", "This property already has eight access photos.");
}

async function encodeUpload({ dataBase64, contentType, caption = "" }) {
  if (typeof caption !== "string" || caption.length > 120) {
    throw new HttpsError("invalid-argument", "The caption must be at most 120 characters.");
  }
  const invalidImage = () => new HttpsError("invalid-argument", "Choose a valid JPEG, PNG, or WebP image up to 10 MB.");
  if (typeof dataBase64 !== "string" || dataBase64.length > Math.ceil(maximumInputBytes / 3) * 4) {
    throw invalidImage();
  }
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length > maximumInputBytes || bytes.toString("base64") !== dataBase64) throw invalidImage();
  try {
    normalizeImageUpload({ contentType, bytes }, maximumInputBytes);
    const { data, info } = await sharp(bytes, { failOn: "truncated", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height, caption: caption.trim() };
  } catch {
    throw invalidImage();
  }
}

function storageUnavailable() {
  return new HttpsError("unavailable", "The access photo is temporarily unavailable.");
}

async function deletePhoto(file) {
  try {
    await file.delete();
  } catch (error) {
    if (Number(error?.code) !== 404) throw storageUnavailable();
  }
}

async function downloadPhoto(file) {
  try {
    const [bytes] = await file.download();
    return { contentType: jpeg, dataBase64: bytes.toString("base64") };
  } catch (error) {
    if (Number(error?.code) === 404) return { state: "not-available" };
    throw storageUnavailable();
  }
}

export async function uploadPropertyAccessPhoto(database, storage, request, organizationId) {
  await requireOrganizationManager(database, request, organizationId);
  const { propertyId } = request.data || {};
  const property = propertyReference(database, organizationId, propertyId);
  requireSpace(propertyPhotos(await property.get(), organizationId));
  const { bytes, width, height, caption } = await encodeUpload(request.data);
  const id = randomBytes(16).toString("hex");
  const photo = { id, caption, sizeBytes: bytes.length, width, height, createdAt: Timestamp.now(), createdByUid: request.auth.uid };
  const file = photoFile(storage, organizationId, propertyId, id);
  try {
    await file.save(bytes, {
      resumable: false,
      metadata: { contentType: jpeg, cacheControl: "private, no-store" },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch {
    throw storageUnavailable();
  }
  try {
    await database.runTransaction(async (transaction) => {
      const photos = propertyPhotos(await transaction.get(property), organizationId);
      requireSpace(photos);
      transaction.update(property, { cleanerAccessPhotos: [...photos, photo] });
    });
  } catch (error) {
    // A transport failure can hide a committed transaction. Only clean up a
    // definite rejection or an object whose entry is absent on read-back.
    try {
      const current = error instanceof HttpsError ? null : (await property.get()).data();
      if (!current?.cleanerAccessPhotos?.some((entry) => entry.id === id)) await deletePhoto(file);
      else return { photo };
    } catch { /* An unlisted object stays private when cleanup is unavailable. */ }
    if (error instanceof HttpsError) throw error;
    throw storageUnavailable();
  }
  return { photo };
}

export async function removePropertyAccessPhoto(database, storage, request, organizationId) {
  await requireOrganizationManager(database, request, organizationId);
  const { propertyId, photoId } = request.data || {};
  const property = propertyReference(database, organizationId, propertyId);
  if (!validInboxSegment(photoId)) throw new HttpsError("invalid-argument", "Invalid photo.");
  const photos = propertyPhotos(await property.get(), organizationId);
  if (!photos.some((photo) => photo?.id === photoId)) return { removed: true };
  await deletePhoto(photoFile(storage, organizationId, propertyId, photoId));
  await database.runTransaction(async (transaction) => {
    const current = propertyPhotos(await transaction.get(property), organizationId);
    if (current.some((photo) => photo?.id === photoId)) {
      transaction.update(property, { cleanerAccessPhotos: current.filter((photo) => photo?.id !== photoId) });
    }
  });
  return { removed: true };
}

export async function getPropertyAccessPhoto(database, storage, request, organizationId) {
  await requireOrganizationManager(database, request, organizationId);
  const { propertyId, photoId } = request.data || {};
  const property = propertyReference(database, organizationId, propertyId);
  if (!validInboxSegment(photoId)) throw new HttpsError("invalid-argument", "Invalid photo.");
  const photos = propertyPhotos(await property.get(), organizationId);
  if (!photos.some((photo) => photo?.id === photoId)) throw new HttpsError("not-found", "The access photo is unavailable.");
  const result = await downloadPhoto(photoFile(storage, organizationId, propertyId, photoId));
  if (result.state) throw new HttpsError("not-found", "The access photo is unavailable.");
  return result;
}

export async function getMyJobAccessPhoto(database, storage, request, organizationId, nowMs) {
  const { cleanerId } = await requireActiveCleaner(database, request, organizationId);
  const { jobId, photoId } = request.data || {};
  if (!validInboxSegment(photoId)) return { state: "denied" };
  const { access, propertyId } = await loadCleanerJobAccessContext(database, { organizationId, cleanerId, jobId, nowMs });
  if (access.state !== "available") return { state: access.state };
  if (!access.photos.some((photo) => photo.id === photoId)) return { state: "not-available" };
  return downloadPhoto(photoFile(storage, organizationId, propertyId, photoId));
}

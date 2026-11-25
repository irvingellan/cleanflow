import { useCallback, useEffect, useState } from "react";
import { AccessPhotoPreview } from "../../components/AccessPhotoPreview.jsx";
import { useTranslation } from "../../i18n/translations.js";
import {
  getPropertyAccessPhoto,
  listPropertyAccessPhotos,
  removePropertyAccessPhoto,
  uploadPropertyAccessPhoto,
} from "./propertyService.js";
import "./propertyAccessPhotos.css";

const maximumPhotos = 8;
const maximumFileSize = 10 * 1024 * 1024;
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Re-encode in the browser before upload: phones and Macs often hand over HEIC or
// very large photos. The server re-encodes again and strips metadata either way.
async function prepareUpload(file) {
  const fallback = supportedTypes.has(file.type) && file.size > 0 && file.size <= maximumFileSize
    ? { contentType: file.type, dataBase64: await readBase64(file) } : null;
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function"
    || /jsdom/i.test(globalThis.navigator?.userAgent || "")) return fallback;
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      setTimeout(() => reject(new Error("decode timeout")), 8000);
      element.src = url;
    });
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return fallback;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size === 0 || blob.size > maximumFileSize) return fallback;
    return { contentType: "image/jpeg", dataBase64: await readBase64(blob) };
  } catch {
    return fallback;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PropertyAccessPhotos({ propertyId }) {
  const { translate } = useTranslation();
  const [photos, setPhotos] = useState(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loadPhoto = useCallback((photoId) => getPropertyAccessPhoto(propertyId, photoId), [propertyId]);

  useEffect(() => {
    let current = true;
    listPropertyAccessPhotos(propertyId).then((list) => {
      if (current) setPhotos(list);
    }).catch(() => {
      if (current) setError("propertyAccess.photos.loadError");
    });
    return () => { current = false; };
  }, [propertyId, attempt]);

  async function addPhoto(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size === 0) {
      setError("propertyAccess.photos.invalid");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareUpload(file);
      if (!prepared) {
        setError("propertyAccess.photos.invalid");
        return;
      }
      const { photo } = await uploadPropertyAccessPhoto({ propertyId, ...prepared, caption });
      setPhotos((list) => [...list, photo]);
      setCaption("");
    } catch (failure) {
      if (failure?.code === "functions/failed-precondition") {
        setError("propertyAccess.photos.full");
        setAttempt((value) => value + 1);
      } else {
        setError("propertyAccess.photos.saveError");
      }
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(photoId) {
    if (!window.confirm(translate("propertyAccess.photos.confirm"))) return;
    setBusy(true);
    setError(null);
    try {
      await removePropertyAccessPhoto(propertyId, photoId);
      setPhotos((list) => list.filter((photo) => photo.id !== photoId));
    } catch {
      setError("propertyAccess.photos.saveError");
    } finally {
      setBusy(false);
    }
  }

  const full = photos?.length >= maximumPhotos;
  return <div className="property-access-photos">
    <p className="cf-block__subtitle">{translate("propertyAccess.photos.limit")}</p>
    {photos?.length > 0 && <ul className="access-photo-grid property-access-photos__list">
      {photos.map((photo) => <li key={photo.id}>
        <AccessPhotoPreview photo={photo} loadPhoto={loadPhoto} translate={translate} />
        <button className="button button--text" type="button" disabled={busy}
          onClick={() => removePhoto(photo.id)}>{translate("propertyAccess.photos.remove")}</button>
      </li>)}
    </ul>}
    {photos && !full && <>
      <label className="property-access__field">
        <span>{translate("propertyAccess.photos.caption")}</span>
        <input type="text" maxLength={120} value={caption} disabled={busy} onChange={(event) => setCaption(event.target.value)} />
      </label>
      <label className={`button button--primary property-access-photos__add${busy ? " is-disabled" : ""}`}>
        <input className="visually-hidden" type="file" accept="image/*" disabled={busy} onChange={addPhoto}
          aria-label={translate("propertyAccess.photos.add")} />
        <span aria-hidden="true">＋</span> {translate("propertyAccess.photos.add")}
      </label>
    </>}
    {(busy || (!photos && !error)) && <p className="cf-block__subtitle" role="status">
      {translate(busy ? "propertyAccess.photos.saving" : "propertyAccess.photos.loading")}
    </p>}
    {error && <p className="form-error" role="alert">{translate(error)}</p>}
    {!photos && error && <button className="button" type="button" onClick={() => {
      setError(null);
      setAttempt((value) => value + 1);
    }}>{translate("accessPhoto.retry")}</button>}
  </div>;
}

import { useId, useState } from "react";
import { publicChecklistEvidenceUrl } from "./checklistCapabilityService.js";
import "./checklistPhotoGallery.css";

const errorKeys = {
  checklist_photo_invalid_type: "photoUnsupportedType", checklist_photo_source_too_large: "photoSourceTooLarge",
  checklist_photo_pixels_exceeded: "photoPixelsExceeded", checklist_photo_queue_limit: "photoQueueLimit",
  checklist_photo_limit: "photoLimit", checklist_conflict: "photoConflict", checklist_unavailable: "photoActionUnavailable",
  checklist_photo_optimization_timeout: "photoOptimizationTimeout", checklist_request_timeout: "photoOptimizationTimeout",
  checklist_photo_optimization_too_large: "photoOptimizationTooLarge", checklist_photo_too_large: "photoTooLarge",
};
export function checklistGalleryError(error, translate) {
  return translate(`checklists.${errorKeys[error] || "photoUploadFailed"}`);
}

/** Saved images load only after explicit selection; no retained source preview. */
export function ChecklistPhotoGallery({ gallery, token, disabled, missing, targetRef, translate }) {
  const id = useId(); const [viewed, setViewed] = useState(null);
  const select = (event) => { gallery.append(event.target.files || []); event.target.value = ""; };
  const saved = gallery.saved;
  const viewedPhoto = saved.find((item) => item.evidenceId === viewed);
  return <div className={`checklist-photo-gallery public-checklist__photo${missing ? " public-checklist__photo--missing" : ""}`} ref={targetRef} tabIndex={-1} aria-live="polite">
    <p className="public-checklist__photo-required">{translate("checklists.photoRequired")}</p>
    <p>{translate("checklists.galleryGuidance")}</p>
    <p>{translate("checklists.photoCount", { count: saved.length })}</p>
    {!disabled && <>
      <div className="checklist-photo-gallery__actions">
        <label className="button" htmlFor={`${id}-camera`}>{translate("checklists.takePhoto")}</label>
        <input id={`${id}-camera`} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={select} />
        <label className="button button--secondary" htmlFor={`${id}-library`}>{translate("checklists.choosePhotos")}</label>
        <input id={`${id}-library`} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={select} />
      </div>
      <p>{translate("checklists.photoReplacementHelp")}</p>
      <button className="button button--secondary" type="button" disabled={gallery.refreshing} onClick={() => gallery.refreshSaved()}>{translate("checklists.refreshPhotos")}</button>
    </>}
    {gallery.refreshing && <p role="status">{translate("checklists.photoRefreshing")}</p>}
    {gallery.error && <p role="alert">{checklistGalleryError(gallery.error, translate)}</p>}
    {missing && <p className="public-checklist__missing-marker">{translate("checklists.requiredPhotoNotSaved")}</p>}
    <ol className="checklist-photo-gallery__list">
      {saved.map((item, index) => <li key={item.evidenceId}>
        <span>{translate("checklists.photoNumber", { count: index + 1 })} · {translate(item.requirementId === "living-belongings" ? "checklists.photoRequired" : "checklists.additionalPhoto")}</span>
        <p>{translate("checklists.photoSaved")}</p>
        <div className="checklist-photo-gallery__actions">
          <button className="button button--secondary" type="button" onClick={() => setViewed((current) => current === item.evidenceId ? null : item.evidenceId)}>{translate(viewed === item.evidenceId ? "checklists.hidePhoto" : "checklists.viewPhoto")}</button>
          {!disabled && <button className="button button--secondary" type="button" disabled={gallery.removing.has(item.evidenceId)} onClick={() => gallery.removeSaved(item.evidenceId)}>{translate("checklists.removePhoto")}</button>}
        </div>
      </li>)}
      {gallery.local.map((item, index) => <li key={item.id}>
        <span>{translate("checklists.photoNumber", { count: saved.length + index + 1 })} · {translate(item.requirementId === "living-belongings" ? "checklists.photoRequired" : "checklists.additionalPhoto")}</span>
        <p role="status">{translate(`checklists.gallery${item.state}`)}</p>
        {item.state === "FAILED" && <><p role="alert">{checklistGalleryError(item.error, translate)}</p><p>{translate("checklists.discardPhotoHelp")}</p>
          {!disabled && <div className="checklist-photo-gallery__actions">
            <button className="button" type="button" onClick={() => gallery.retry(item.id)}>{translate("checklists.retryPhoto")}</button>
            <button className="button button--secondary" type="button" onClick={() => gallery.discard(item.id)}>{translate("checklists.discardPhoto")}</button>
          </div>}</>}
      </li>)}
    </ol>
    {viewedPhoto && <img key={`${token}:${viewed}`} className="public-checklist__photo-preview" src={publicChecklistEvidenceUrl(token, viewedPhoto.requirementId, viewedPhoto.evidenceId)} alt={translate("checklists.savedPhoto")} loading="lazy" referrerPolicy="no-referrer" />}
  </div>;
}

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
/**
 * FB06 — explicit photo requirements. Rendered only when a requirements list is
 * provided (proposed server contract: frozen per Run/template). It never adds a
 * minimum or changes what the server validates; counts use the saved photos'
 * optional `photoRequirementId`. `example` marks a non-published sample list.
 */
export function PhotoRequirementList({ requirements, saved = [], example = false, translate }) {
  if (!Array.isArray(requirements) || !requirements.length) return null;
  const counts = new Map();
  saved.forEach((item) => { if (item.photoRequirementId) counts.set(item.photoRequirementId, (counts.get(item.photoRequirementId) || 0) + 1); });
  const done = requirements.filter((requirement) => counts.get(requirement.id) > 0).length;
  return <section className="photo-requirements" aria-labelledby="photo-requirements-title" data-testid="photo-requirements">
    <div className="photo-requirements__head">
      <h4 id="photo-requirements-title">{translate("checklists.photoRequirementsTitle")}</h4>
      <span>{translate("checklists.photoRequirementsProgress", { done, total: requirements.length })}</span>
    </div>
    {example && <p className="photo-requirements__example">{translate("checklists.photoRequirementsExample")}</p>}
    <ul>
      {requirements.map((requirement) => {
        const count = counts.get(requirement.id) || 0;
        return <li key={requirement.id} className={count ? "is-done" : "is-missing"} data-requirement={requirement.id}>
          <span aria-hidden="true" className="photo-requirements__mark">{count ? "✓" : ""}</span>
          <span className="photo-requirements__label">{requirement.label}{requirement.hint && <small>{requirement.hint}</small>}</span>
          <strong>{count ? translate("checklists.photoRequirementDone", { count }) : translate("checklists.photoRequirementMissing")}</strong>
        </li>;
      })}
    </ul>
  </section>;
}

export function ChecklistPhotoGallery({ gallery, token, disabled, missing, targetRef, translate, photoRequirements = null, requirementsAreExample = false }) {
  const id = useId(); const [viewed, setViewed] = useState(null);
  const select = (event) => { gallery.append(event.target.files || []); event.target.value = ""; };
  const saved = gallery.saved;
  const viewedPhoto = saved.find((item) => item.evidenceId === viewed);
  return <div className={`checklist-photo-gallery public-checklist__photo${missing ? " public-checklist__photo--missing" : ""}`} ref={targetRef} tabIndex={-1} aria-live="polite">
    <p className="public-checklist__photo-required">{translate("checklists.photoRequired")}</p>
    <p>{translate("checklists.galleryGuidance")}</p>
    <PhotoRequirementList requirements={photoRequirements} saved={saved} example={requirementsAreExample} translate={translate} />
    <p className="checklist-photo-gallery__count">{translate("checklists.photoCount", { count: saved.length })}</p>
    {!disabled && <>
      <div className="checklist-photo-gallery__actions">
        <label className="button" htmlFor={`${id}-camera`}>{translate("checklists.takePhoto")}</label>
        <input id={`${id}-camera`} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={select} />
        <label className="button button--secondary" htmlFor={`${id}-library`}>{translate("checklists.choosePhotos")}</label>
        <input id={`${id}-library`} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={select} />
      </div>
      <p className="checklist-photo-gallery__formats">{translate("checklists.galleryFormats")}</p>
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

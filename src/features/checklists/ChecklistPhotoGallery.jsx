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

/**
 * FB06 — explicit photo requirements. Rendered only when a requirements list is
 * provided (proposed server contract: frozen per Run/template). It never adds a
 * minimum or changes what the server validates; counts use the saved photos'
 * optional `photoRequirementId`. `example` marks a non-published sample list.
 */
export function PhotoRequirementList({ requirements, saved = [], example = false, translate }) {
  const headingId = useId();
  if (!Array.isArray(requirements) || !requirements.length) return null;
  const counts = new Map();
  saved.forEach((item) => { if (item.photoRequirementId) counts.set(item.photoRequirementId, (counts.get(item.photoRequirementId) || 0) + 1); });
  const done = requirements.filter((requirement) => counts.get(requirement.id) > 0).length;
  return <section className="photo-requirements" aria-labelledby={headingId} data-testid="photo-requirements">
    <div className="photo-requirements__head">
      <h4 id={headingId}>{translate("checklists.photoRequirementsTitle")}</h4>
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

/** The square picture of one photo: its local preview when there is one, else its number. */
function Tile({ preview, number, mark }) {
  return <>
    {preview ? <span className="checklist-photo-tile__picture" style={{ backgroundImage: `url("${preview}")` }} aria-hidden="true" />
      : <span className="checklist-photo-tile__number" aria-hidden="true">{number}</span>}
    <span className="checklist-photo-tile__mark" aria-hidden="true">{mark}</span>
  </>;
}

/**
 * A grid that fills in while photos are sent: each photo shows its own picture
 * and state. The full saved image loads only when its tile is opened.
 */
export function ChecklistPhotoGallery({ gallery, token, disabled, missing, targetRef, translate, photoRequirements = null, requirementsAreExample = false }) {
  const id = useId(); const [viewed, setViewed] = useState(undefined);
  const select = (event) => { gallery.append(event.target.files || []); event.target.value = ""; };
  const saved = gallery.saved;
  const failed = gallery.local.filter((item) => item.state === "FAILED").length;
  const sending = gallery.local.length - failed;
  const total = saved.length + gallery.local.length;
  // Until the cleaner opens or closes a tile, the first photo that failed is open.
  const open = viewed === undefined ? gallery.local.find((item) => item.state === "FAILED")?.id || null : viewed;
  const toggle = (key) => setViewed(open === key ? null : key);
  const kind = (item) => translate(item.requirementId === "living-belongings" ? "checklists.photoRequired" : "checklists.additionalPhoto");
  return <div className={`checklist-photo-gallery public-checklist__photo${missing ? " public-checklist__photo--missing" : ""}`} ref={targetRef} tabIndex={-1} aria-live="polite">
    <p className="public-checklist__photo-required">{translate("checklists.photoRequired")}</p>
    <details className="checklist-photo-gallery__help">
      <summary>{translate("checklists.photoHelpTitle")}</summary>
      <p>{translate("checklists.galleryGuidance")}</p>
      {!disabled && <p>{translate("checklists.photoReplacementHelp")}</p>}
    </details>
    <PhotoRequirementList requirements={photoRequirements} saved={saved} example={requirementsAreExample} translate={translate} />
    <p className="checklist-photo-gallery__count">{translate(saved.length === 1 ? "checklists.photoCountOne" : "checklists.photoCount", { count: saved.length })}</p>
    {(sending > 0 || failed > 0) && <div className="checklist-photo-gallery__progress" role="status" data-testid="photo-progress">
      <progress max={total} value={saved.length} aria-label={translate("checklists.photosProgress", { saved: saved.length, total })} />
      {sending > 0 && <p className="checklist-photo-gallery__sending">{translate("checklists.photosSending", { count: sending })}</p>}
      {failed > 0 && <p className="checklist-photo-gallery__failed">{translate("checklists.photosNotSaved", { count: failed })}</p>}
      {failed > 1 && !disabled && <button className="button" type="button" onClick={() => gallery.retryAll()}>{translate("checklists.retryAllPhotos")}</button>}
      {failed > 0 && !disabled && <button className="button button--secondary" type="button" onClick={() => gallery.discardFailed()}>{translate("checklists.discardFailedPhotos", { count: failed })}</button>}
    </div>}
    {!disabled && <>
      <div className="checklist-photo-gallery__actions">
        <label className="button" htmlFor={`${id}-camera`}>{translate("checklists.takePhoto")}</label>
        <input id={`${id}-camera`} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={select} />
        <label className="button button--secondary" htmlFor={`${id}-library`}>{translate("checklists.choosePhotos")}</label>
        <input id={`${id}-library`} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={select} />
      </div>
      <p className="checklist-photo-gallery__formats">{translate("checklists.galleryFormats")}</p>
      <button className="button button--secondary" type="button" disabled={gallery.refreshing} onClick={() => gallery.refreshSaved()}>{translate("checklists.refreshPhotos")}</button>
    </>}
    {gallery.refreshing && <p role="status">{translate("checklists.photoRefreshing")}</p>}
    {gallery.error && <p role="alert">{checklistGalleryError(gallery.error, translate)}</p>}
    {missing && <p className="public-checklist__missing-marker">{translate("checklists.requiredPhotoNotSaved")}</p>}
    <ol className="checklist-photo-gallery__list">
      {saved.map((item, index) => {
        const isOpen = open === item.evidenceId;
        return <li key={item.evidenceId} className={`checklist-photo-tile is-saved${isOpen ? " is-open" : ""}`}>
          <button className="checklist-photo-tile__face" type="button" aria-expanded={isOpen} aria-label={translate(isOpen ? "checklists.hidePhoto" : "checklists.viewPhoto")} onClick={() => toggle(item.evidenceId)}>
            <Tile preview={gallery.previewFor?.(item.evidenceId)} number={index + 1} mark="✓" />
          </button>
          <span className="checklist-photo-tile__label">{translate("checklists.photoNumber", { count: index + 1 })} · {kind(item)}</span>
          <p className="checklist-photo-tile__state">{translate("checklists.photoSaved")}</p>
          {isOpen && <div className="checklist-photo-tile__detail">
            <img key={`${token}:${item.evidenceId}`} className="public-checklist__photo-preview" src={publicChecklistEvidenceUrl(token, item.requirementId, item.evidenceId)} alt={translate("checklists.savedPhoto")} referrerPolicy="no-referrer" />
            {!disabled && <div className="checklist-photo-gallery__actions">
              <button className="button button--secondary" type="button" disabled={gallery.removing.has(item.evidenceId)} onClick={() => gallery.removeSaved(item.evidenceId)}>{translate("checklists.removePhoto")}</button>
            </div>}
          </div>}
        </li>;
      })}
      {gallery.local.map((item, index) => {
        const isFailed = item.state === "FAILED"; const isOpen = isFailed && open === item.id;
        const face = <Tile preview={item.preview} number={saved.length + index + 1} mark={isFailed ? "!" : ""} />;
        return <li key={item.id} className={`checklist-photo-tile is-${item.state.toLowerCase()}${isOpen ? " is-open" : ""}`}>
          {isFailed ? <button className="checklist-photo-tile__face" type="button" aria-expanded={isOpen} aria-label={translate("checklists.photoDetails")} onClick={() => toggle(item.id)}>{face}</button>
            : <span className="checklist-photo-tile__face">{face}</span>}
          <span className="checklist-photo-tile__label">{translate("checklists.photoNumber", { count: saved.length + index + 1 })} · {kind(item)}</span>
          <p className="checklist-photo-tile__state" role="status">{translate(`checklists.gallery${item.state}`)}</p>
          {isOpen && <div className="checklist-photo-tile__detail"><p role="alert">{checklistGalleryError(item.error, translate)}</p><p>{translate("checklists.discardPhotoHelp")}</p>
            {!disabled && <div className="checklist-photo-gallery__actions">
              <button className="button" type="button" onClick={() => gallery.retry(item.id)}>{translate("checklists.retryPhoto")}</button>
              <button className="button button--secondary" type="button" onClick={() => gallery.discard(item.id)}>{translate("checklists.discardPhoto")}</button>
            </div>}</div>}
        </li>;
      })}
    </ol>
  </div>;
}

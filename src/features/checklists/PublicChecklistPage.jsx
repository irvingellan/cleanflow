import { useEffect, useRef, useState } from "react";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { languageOptions, useTranslation } from "../../i18n/translations.js";
import { formatDate } from "../../lib/presentation.js";
import { checklistSaveStates, usePublicChecklistDraft } from "./usePublicChecklistDraft.js";
import {
  publicChecklistEvidenceUrl,
  uploadPublicChecklistEvidence,
} from "./checklistCapabilityService.js";

const errorKeys = {
  checklist_not_found: "checklists.publicUnavailable",
  checklist_unavailable: "checklists.publicUnavailable",
};

const saveStateKeys = {
  [checklistSaveStates.SAVED]: "checklists.saveStateSaved",
  [checklistSaveStates.SAVING]: "checklists.saveStateSaving",
  [checklistSaveStates.OFFLINE_PENDING]: "checklists.saveStateOfflinePending",
  [checklistSaveStates.CONFLICT]: "checklists.saveStateConflict",
  [checklistSaveStates.UNAVAILABLE]: "checklists.saveStateUnavailable",
  [checklistSaveStates.RETRY]: "checklists.saveStateRetry",
  [checklistSaveStates.READY_FOR_REVIEW]: "checklists.readyForReview",
};

const inventoryAnswers = ["UNANSWERED", "LOW", "MEDIUM", "HIGH", "NEEDS_RESTOCK"];
// Phase 5D.1 intentionally supports one frozen pilot evidence requirement only.
const pilotPhotoRequirementId = "living-belongings";

function itemLabel(item, translate) {
  return item.label || translate(item.labelKey || item.id);
}

function ChecklistPhoto({ item, token, evidence, disabled, translate }) {
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);
  const [state, setState] = useState(evidence ? "SAVED" : "IDLE");
  const [retryFile, setRetryFile] = useState(null);
  const [error, setError] = useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);

  useEffect(() => {
    if (evidence) {
      setState("SAVED");
      setError(null);
    }
  }, [evidence]);

  useEffect(() => () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  const upload = async (file) => {
    if (!file || disabled || state === "UPLOADING") return;
    setState("UPLOADING");
    setError(null);
    setRetryFile(file);
    try {
      await uploadPublicChecklistEvidence({ token, requirementId: item.id, file });
      setLocalPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return URL.createObjectURL(file);
      });
      setState("SAVED");
      setRetryFile(null);
    } catch (uploadError) {
      setState("FAILED");
      setError(uploadError?.code || "checklist_photo_unavailable");
    }
  };

  const sourceSelected = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    upload(file);
  };
  const isSaved = Boolean(evidence) || state === "SAVED";

  return (
    <div className="public-checklist__photo" aria-live="polite">
      <span className="public-checklist__photo-required">{translate("checklists.photoRequired")}</span>
      {isSaved && (
        <img
          className="public-checklist__photo-preview"
          src={evidence ? publicChecklistEvidenceUrl(token, item.id) : localPreviewUrl}
          alt={translate("checklists.savedPhoto")}
        />
      )}
      {!disabled && !isSaved && state !== "UPLOADING" && (
        <div className="public-checklist__photo-actions">
          <input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={sourceSelected} />
          <input ref={libraryInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={sourceSelected} />
          <button className="button button--small" type="button" onClick={() => cameraInputRef.current?.click()}>
            {translate("checklists.takePhoto")}
          </button>
          <button className="button button--small button--secondary" type="button" onClick={() => libraryInputRef.current?.click()}>
            {translate("checklists.choosePhoto")}
          </button>
        </div>
      )}
      {state === "UPLOADING" && <p className="public-checklist__photo-status">{translate("checklists.photoUploading")}</p>}
      {state === "SAVED" && <p className="public-checklist__photo-status">{translate("checklists.photoSaved")}</p>}
      {state === "FAILED" && (
        <div className="public-checklist__photo-error" role="alert">
          <p>{translate(error === "checklist_photo_too_large" ? "checklists.photoTooLarge" : "checklists.photoUploadFailed")}</p>
          {retryFile && <button className="button button--small" type="button" onClick={() => upload(retryFile)}>{translate("checklists.retryPhoto")}</button>}
        </div>
      )}
    </div>
  );
}

function ChecklistAnswer({ item, value, onChange, translate, token, evidence, disabled = false }) {
  const label = itemLabel(item, translate);
  const answerValues = ["UNANSWERED", "DONE", ...(item.canBeNotApplicable ? ["NOT_APPLICABLE"] : [])];

  return (
    <fieldset className="public-checklist__item">
      <legend>{label}</legend>
      <div className="public-checklist__answer-options">
        {answerValues.map((answer) => (
          <label key={answer} className={value === answer ? "public-checklist__answer-option--selected" : ""}>
            <input
              type="radio"
              name={`checklist-${item.id}`}
              value={answer}
              checked={value === answer}
              disabled={disabled}
              onChange={() => onChange(answer)}
            />
            {translate(`checklists.answer${answer}`)}
          </label>
        ))}
      </div>
      {item.requiresPhoto && item.id === pilotPhotoRequirementId && (
        <ChecklistPhoto item={item} token={token} evidence={evidence} disabled={disabled} translate={translate} />
      )}
    </fieldset>
  );
}

function formatReadyForReviewAt(value, language) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(
    { en: "en-US", pt: "pt-BR", es: "es-ES" }[language] || "en-US",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(date);
}

function ReviewHandoff({ checklist, saveState, isSubmittingReview, reviewError, onSubmit, language, translate }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const isReady = saveState === checklistSaveStates.READY_FOR_REVIEW;
  const canSubmit = saveState === checklistSaveStates.SAVED && !isSubmittingReview;
  const readyAt = formatReadyForReviewAt(checklist.readyForReviewAt, language);

  if (isReady) {
    return (
      <section className="public-checklist__review-state" aria-live="polite">
        <h2>{translate("checklists.readyForReview")}</h2>
        <p>{translate("checklists.readyForReviewReadOnly")}</p>
        {readyAt && <p>{translate("checklists.readyForReviewAt", { time: readyAt })}</p>}
      </section>
    );
  }

  return (
    <section className="public-checklist__review-handoff" aria-labelledby="checklist-review-handoff-title">
      <h2 id="checklist-review-handoff-title">{translate("checklists.readyForReview")}</h2>
      {!isConfirming ? (
        <>
          <p>{translate("checklists.readyForReviewPrompt")}</p>
          {!canSubmit && <p className="public-checklist__review-help">{translate("checklists.readyForReviewSaveFirst")}</p>}
          {reviewError && <p className="form-error" role="alert">{translate(reviewError === "checklist_conflict" ? "checklists.readyForReviewConflict" : "checklists.readyForReviewError")}</p>}
          <button className="button" type="button" disabled={!canSubmit} onClick={() => setIsConfirming(true)}>
            {translate("checklists.readyForReview")}
          </button>
        </>
      ) : (
        <div className="public-checklist__review-confirmation" role="dialog" aria-labelledby="checklist-review-confirm-title">
          <h3 id="checklist-review-confirm-title">{translate("checklists.readyForReviewConfirmTitle")}</h3>
          <p>{translate("checklists.readyForReviewConfirmBody")}</p>
          {reviewError && <p className="form-error" role="alert">{translate(reviewError === "checklist_conflict" ? "checklists.readyForReviewConflict" : "checklists.readyForReviewError")}</p>}
          <div className="public-checklist__review-actions">
            <button className="button" type="button" disabled={isSubmittingReview} onClick={onSubmit}>
              {isSubmittingReview ? translate("checklists.readyForReviewSending") : translate("checklists.readyForReviewConfirm")}
            </button>
            <button className="button button--secondary" type="button" disabled={isSubmittingReview} onClick={() => setIsConfirming(false)}>
              {translate("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SaveStatus({ saveState, hasRecoveryWarning, isResolvingConflict, onSaveNow, onDiscard, onReapply, translate }) {
  const isUnavailable = saveState === checklistSaveStates.UNAVAILABLE;
  const isConflict = saveState === checklistSaveStates.CONFLICT;
  const needsRetry = saveState === checklistSaveStates.OFFLINE_PENDING || saveState === checklistSaveStates.RETRY;
  const canSaveNow = saveState === checklistSaveStates.SAVING || needsRetry;

  return (
    <aside className={`public-checklist__save-status public-checklist__save-status--${saveState.toLowerCase()}`} aria-live="polite">
      <p role={isUnavailable || isConflict ? "alert" : "status"}>
        {translate(saveStateKeys[saveState] || "checklists.saveStateSaving")}
      </p>
      {isConflict && <p className="public-checklist__conflict-help">{translate("checklists.conflictLocalPreserved")}</p>}
      <div className="public-checklist__save-actions">
        {!isUnavailable && !isConflict && canSaveNow && (
          <button className="button button--small" type="button" onClick={onSaveNow}>
            {translate(needsRetry ? "common.retry" : "checklists.saveNow")}
          </button>
        )}
        {isConflict && (
          <>
            <button className="button button--small" type="button" disabled={isResolvingConflict} onClick={onReapply}>
              {translate("checklists.reapplyLocalChanges")}
            </button>
            <button className="button button--small button--secondary" type="button" disabled={isResolvingConflict} onClick={onDiscard}>
              {translate("checklists.reloadSavedDraft")}
            </button>
          </>
        )}
      </div>
      {hasRecoveryWarning && <p className="public-checklist__recovery-warning" role="status">{translate("checklists.recoveryWarning")}</p>}
    </aside>
  );
}

/** The only public editing surface; all mutations remain capability-gated HTTP calls. */
export function PublicChecklistPage({ token }) {
  const { language, setLanguage, translate } = useTranslation();
  const {
    checklist,
    draft,
    isLoading,
    loadError,
    saveState,
    hasRecoveryWarning,
    isResolvingConflict,
    isSubmittingReview,
    reviewError,
    queueChanges,
    saveNow,
    discardLocalChanges,
    reapplyLocalChanges,
    submitForManagerReview,
  } = usePublicChecklistDraft(token);

  if (isLoading) {
    return <main className="public-offer-page checklist-public-page"><section className="panel"><StateCard message={translate("checklists.publicLoading")} status="status" /></section></main>;
  }

  if (loadError || !checklist || !draft) {
    return <main className="public-offer-page checklist-public-page"><section className="panel"><StateCard message={translate(errorKeys[loadError] || "checklists.publicUnavailable")} status="alert" isError /></section></main>;
  }

  const isReadOnly = saveState === checklistSaveStates.READY_FOR_REVIEW;
  const evidenceByRequirement = new Map((checklist.evidence || []).map((evidence) => [evidence.requirementId, evidence]));

  return (
    <main className="public-offer-page checklist-public-page">
      <section className="panel public-checklist" aria-labelledby="public-checklist-title">
        <header className="public-checklist__header">
          <div>
            <p className="eyebrow">CleanFlow</p>
            <h1 id="public-checklist-title" className="panel__title">{translate("checklists.publicTitle")}</h1>
            {checklist.propertyName && <p className="public-checklist__context">{checklist.propertyName}</p>}
            {checklist.scheduledDate && <p className="public-checklist__context">{formatDate(checklist.scheduledDate, translate, language)}{checklist.scheduledStart ? ` · ${checklist.scheduledStart}` : ""}</p>}
          </div>
          <label className="public-checklist__language">
            <span>{translate("common.language")}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
          </label>
        </header>

        <SaveStatus
          saveState={saveState}
          hasRecoveryWarning={hasRecoveryWarning}
          isResolvingConflict={isResolvingConflict}
          onSaveNow={saveNow}
          onDiscard={discardLocalChanges}
          onReapply={reapplyLocalChanges}
          translate={translate}
        />

        {checklist.cleanerInstructions && (
          <section className="public-checklist__instructions" aria-labelledby="public-checklist-instructions-title">
            <h2 id="public-checklist-instructions-title">{translate("checklists.cleanerInstructions")}</h2>
            <p>{checklist.cleanerInstructions}</p>
          </section>
        )}

        {checklist.sections.map((section) => (
          <section className="public-checklist__section" key={section.id} aria-labelledby={`public-section-${section.id}`}>
            <h2 id={`public-section-${section.id}`}>{section.title || section.label || translate(section.titleKey || section.id)}</h2>
            {section.items.map((item) => (
              <ChecklistAnswer
                key={item.id}
                item={item}
                value={draft.checklistAnswers?.[item.id] || "UNANSWERED"}
                onChange={(answer) => queueChanges({ checklistAnswers: { [item.id]: answer } })}
                translate={translate}
                token={token}
                evidence={evidenceByRequirement.get(item.id)}
                disabled={isReadOnly}
              />
            ))}
          </section>
        ))}

        {checklist.inventoryItems?.length > 0 && (
          <section className="public-checklist__section" aria-labelledby="public-checklist-inventory-title">
            <h2 id="public-checklist-inventory-title">{translate("checklists.inventoryCount")}</h2>
            <div className="public-checklist__inventory">
              {checklist.inventoryItems.map((item) => (
                <label key={item.id}>
                  <span>{itemLabel(item, translate)}</span>
                  <select
                    value={draft.inventoryAnswers?.[item.id] || "UNANSWERED"}
                    disabled={isReadOnly}
                    onChange={(event) => queueChanges({ inventoryAnswers: { [item.id]: event.target.value } })}
                  >
                    {inventoryAnswers.map((answer) => <option key={answer} value={answer}>{translate(`checklists.inventory${answer}`)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>
        )}

        <section className="public-checklist__section" aria-labelledby="public-checklist-notes-title">
          <h2 id="public-checklist-notes-title">{translate("checklists.notes")}</h2>
          <label>
            <span>{translate("checklists.issueNotes")}</span>
            <textarea
              rows="4"
              maxLength="2000"
              value={draft.issueNotes || ""}
              disabled={isReadOnly}
              onChange={(event) => queueChanges({ issueNotes: event.target.value }, { debounce: true })}
            />
          </label>
          <label>
            <span>{translate("checklists.generalNotes")}</span>
            <textarea
              rows="3"
              maxLength="2000"
              value={draft.generalNotes || ""}
              disabled={isReadOnly}
              onChange={(event) => queueChanges({ generalNotes: event.target.value }, { debounce: true })}
            />
          </label>
        </section>

        {checklist.requiredPhotoTypes?.length > 0 && (
          <section className="public-checklist__future-note" aria-labelledby="public-checklist-photos-title">
            <h2 id="public-checklist-photos-title">{translate("checklists.requiredPhotos")}</h2>
            <p>{translate("checklists.photosLater")}</p>
          </section>
        )}

        <ReviewHandoff
          checklist={checklist}
          saveState={saveState}
          isSubmittingReview={isSubmittingReview}
          reviewError={reviewError}
          onSubmit={submitForManagerReview}
          language={language}
          translate={translate}
        />
      </section>
      <ScrollToTopButton />
    </main>
  );
}

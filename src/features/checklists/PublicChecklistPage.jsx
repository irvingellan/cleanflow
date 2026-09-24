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
import {
  buildPublicChecklistLoadDiagnostic,
  getPublicChecklistSessionId,
  publicChecklistClientClass,
  recordPublicChecklistLoadDiagnostic,
} from "./publicChecklistLoadDiagnostics.js";

const errorKeys = {
  checklist_not_found: "checklists.publicUnavailable",
  checklist_unavailable: "checklists.publicUnavailable",
  checklist_request_failed: "checklists.publicLoadFailed",
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

function ChecklistPhoto({ item, token, evidence, disabled, missing, onEvidenceSaved, targetRef, translate }) {
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
      const result = await uploadPublicChecklistEvidence({ token, requirementId: item.id, file });
      const confirmed = result?.evidence?.some((saved) => saved.requirementId === item.id);
      if (!confirmed) throw Object.assign(new Error("Saved evidence was not confirmed."), { code: "checklist_photo_unavailable" });
      onEvidenceSaved?.(item.id);
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
    <div className={`public-checklist__photo${missing ? " public-checklist__photo--missing" : ""}`} aria-live="polite" ref={targetRef} tabIndex={-1}>
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
      {missing && <p className="public-checklist__missing-marker">{translate("checklists.requiredPhotoNotSaved")}</p>}
      {state === "FAILED" && (
        <div className="public-checklist__photo-error" role="alert">
          <p>{translate(error === "checklist_photo_too_large" ? "checklists.photoTooLarge" : "checklists.photoUploadFailed")}</p>
          {retryFile && <button className="button button--small" type="button" onClick={() => upload(retryFile)}>{translate("checklists.retryPhoto")}</button>}
        </div>
      )}
    </div>
  );
}

function ChecklistAnswer({
  item, value, onChange, translate, token, evidence, disabled = false,
  missing = false, photoMissing = false, answerTargetRef, photoTargetRef, onEvidenceSaved,
}) {
  const label = itemLabel(item, translate);
  const answerValues = ["UNANSWERED", "DONE", ...(item.canBeNotApplicable ? ["NOT_APPLICABLE"] : [])];
  const missingAnswerId = `checklist-missing-${item.id}`;

  return (
    <fieldset className={`public-checklist__item${missing ? " public-checklist__item--missing" : ""}`} aria-describedby={missing ? missingAnswerId : undefined}>
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
              ref={answer === "DONE" ? answerTargetRef : undefined}
              onChange={() => onChange(answer)}
            />
            {translate(`checklists.answer${answer}`)}
          </label>
        ))}
      </div>
      {missing && <p className="public-checklist__missing-marker" id={missingAnswerId}>{translate("checklists.answerRequiredBeforeReview")}</p>}
      {item.requiresPhoto && item.id === pilotPhotoRequirementId && (
        <ChecklistPhoto
          item={item}
          token={token}
          evidence={evidence}
          disabled={disabled}
          missing={photoMissing}
          onEvidenceSaved={onEvidenceSaved}
          targetRef={photoTargetRef}
          translate={translate}
        />
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

function reviewErrorMessage(reviewError, translate) {
  if (reviewError === "checklist_conflict") return translate("checklists.readyForReviewConflict");
  return translate("checklists.readyForReviewError");
}

function ReviewHandoff({ checklist, saveState, isSubmittingReview, reviewError, onSubmit, language, translate }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const isReady = saveState === checklistSaveStates.READY_FOR_REVIEW;
  const canSubmit = saveState === checklistSaveStates.SAVED && !isSubmittingReview;
  const showReviewError = Boolean(reviewError && reviewError !== "checklist_requirements_missing");
  const readyAt = formatReadyForReviewAt(checklist.readyForReviewAt, language);

  useEffect(() => {
    if (reviewError === "checklist_requirements_missing") setIsConfirming(false);
  }, [reviewError]);

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
          {showReviewError && <p className="form-error" role="alert">{reviewErrorMessage(reviewError, translate)}</p>}
          <button className="button" type="button" disabled={!canSubmit} onClick={() => setIsConfirming(true)}>
            {translate("checklists.sendForReview")}
          </button>
        </>
      ) : (
        <div className="public-checklist__review-confirmation" role="dialog" aria-labelledby="checklist-review-confirm-title">
          <h3 id="checklist-review-confirm-title">{translate("checklists.sendForReviewConfirmTitle")}</h3>
          <p>{translate("checklists.readyForReviewConfirmBody")}</p>
          {showReviewError && <p className="form-error" role="alert">{reviewErrorMessage(reviewError, translate)}</p>}
          <div className="public-checklist__review-actions">
            <button className="button" type="button" disabled={isSubmittingReview} onClick={onSubmit}>
              {isSubmittingReview ? translate("checklists.sendForReviewSending") : translate("checklists.sendForReview")}
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
  const routeOpenedAtRef = useRef(globalThis.performance?.now?.() ?? Date.now());
  const diagnosticSessionRef = useRef(getPublicChecklistSessionId());
  const diagnosticRecordedRef = useRef(false);
  const {
    checklist,
    draft,
    loadDiagnostics,
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
    retryLoad,
  } = usePublicChecklistDraft(token);
  const fieldTargetsRef = useRef(new Map());
  const [hasAttemptedValidation, setHasAttemptedValidation] = useState(false);
  const [confirmedEvidenceIds, setConfirmedEvidenceIds] = useState(() => new Set());

  useEffect(() => {
    setHasAttemptedValidation(false);
    setConfirmedEvidenceIds(new Set());
    fieldTargetsRef.current.clear();
  }, [token]);

  useEffect(() => {
    if (reviewError === "checklist_requirements_missing") {
      setHasAttemptedValidation(true);
    }
  }, [reviewError]);

  useEffect(() => {
    if (checklist?.evidence?.length) {
      setConfirmedEvidenceIds((current) => new Set([
        ...current,
        ...checklist.evidence.map((item) => item.requirementId),
      ]));
    }
  }, [checklist?.evidence]);

  useEffect(() => {
    if (isLoading || diagnosticRecordedRef.current) return;
    diagnosticRecordedRef.current = true;
    const finishedAt = globalThis.performance?.now?.() ?? Date.now();
    const diagnostic = buildPublicChecklistLoadDiagnostic({
      sessionId: diagnosticSessionRef.current,
      totalReadyMs: finishedAt - routeOpenedAtRef.current,
      result: loadError ? "error" : "success",
      capabilityResolutionMs: loadDiagnostics?.capabilityResolutionMs ?? null,
      capabilityResult: loadDiagnostics?.capabilityResult || (loadError ? "error" : "unknown"),
      draftLoadMs: loadDiagnostics?.draftLoadMs ?? null,
      draftResult: loadDiagnostics?.draftResult || (loadError ? "error" : "loaded"),
      errorStage: loadError ? loadDiagnostics?.errorStage || "request" : null,
      errorCode: loadDiagnostics?.errorCode || loadError || null,
      client: publicChecklistClientClass(),
    });
    recordPublicChecklistLoadDiagnostic(diagnostic);
  }, [isLoading, loadDiagnostics, loadError]);

  if (isLoading) {
    return <main className="public-offer-page checklist-public-page"><section className="panel"><StateCard message={translate("checklists.publicLoading")} status="status" /></section></main>;
  }

  if (loadError || !checklist || !draft) {
    const terminalUnavailable = loadError === "checklist_not_found" || loadError === "checklist_unavailable";
    return (
      <main className="public-offer-page checklist-public-page">
        <section className="panel">
          <StateCard message={translate(errorKeys[loadError] || "checklists.publicLoadFailed")} status="alert" isError />
          {!terminalUnavailable && (
            <button className="button" type="button" onClick={retryLoad}>
              {translate("checklists.retryPublicLoad")}
            </button>
          )}
        </section>
      </main>
    );
  }

  const isReadOnly = saveState === checklistSaveStates.READY_FOR_REVIEW;
  const evidenceByRequirement = new Map((checklist.evidence || []).map((evidence) => [evidence.requirementId, evidence]));
  const missingItems = [];
  for (const section of checklist.sections) {
    for (const item of section.items) {
      const answer = draft.checklistAnswers?.[item.id] || "UNANSWERED";
      const answered = answer === "DONE" || (answer === "NOT_APPLICABLE" && item.canBeNotApplicable === true);
      if (!answered) missingItems.push({ key: `checklist:${item.id}`, label: itemLabel(item, translate), kind: "checklist" });
      if (item.requiresPhoto && item.id === pilotPhotoRequirementId
        && !evidenceByRequirement.has(item.id) && !confirmedEvidenceIds.has(item.id)) {
        missingItems.push({ key: `photo:${item.id}`, label: itemLabel(item, translate), kind: "photo" });
      }
    }
  }
  for (const item of checklist.inventoryItems || []) {
    if ((draft.inventoryAnswers?.[item.id] || "UNANSWERED") === "UNANSWERED") {
      missingItems.push({ key: `inventory:${item.id}`, label: itemLabel(item, translate), kind: "inventory" });
    }
  }
  const missingChecklistCount = missingItems.filter((item) => item.kind === "checklist").length;
  const missingInventoryCount = missingItems.filter((item) => item.kind === "inventory").length;
  const missingPhotoCount = missingItems.filter((item) => item.kind === "photo").length;
  const moveToFirstMissing = () => {
    const target = fieldTargetsRef.current.get(missingItems[0]?.key);
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    target?.focus?.({ preventScroll: true });
  };

  return (
    <main className="public-offer-page checklist-public-page">
      <section className="panel public-checklist" aria-labelledby="public-checklist-title">
        <header className="public-checklist__header">
          <div>
            <p className="eyebrow">CleanFlow</p>
            <h1 id="public-checklist-title" className="panel__title">{translate("checklists.publicTitle")}</h1>
            {checklist.propertyName && <p className="public-checklist__context">{checklist.propertyName}</p>}
            {checklist.scheduledDate && <p className="public-checklist__context">{formatDate(checklist.scheduledDate, translate, language)}{checklist.scheduledStart ? ` · ${checklist.scheduledStart}` : ""}</p>}
            {checklist.assignedCleanerName && <p className="public-checklist__context">{translate("jobs.assignedCleaner")}: {checklist.assignedCleanerName}</p>}
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

        {hasAttemptedValidation && (
          <section className="public-checklist__validation-summary" aria-labelledby="public-checklist-validation-title" role="status">
            <h2 id="public-checklist-validation-title">{translate("checklists.reviewValidationTitle")}</h2>
            {missingItems.length > 0 ? (
              <>
                <p>{translate("checklists.reviewValidationSummary", {
                  checklist: missingChecklistCount,
                  inventory: missingInventoryCount,
                  photos: missingPhotoCount,
                })}</p>
                <ul>
                  {missingItems.map((item, index) => (
                    <li key={`${item.key}-${index}`}>
                      {translate(`checklists.reviewMissing${item.kind === "checklist" ? "Answer" : item.kind === "inventory" ? "Inventory" : "Photo"}`)}: {item.label}
                    </li>
                  ))}
                </ul>
                <button className="button button--secondary" type="button" onClick={moveToFirstMissing}>
                  {translate("checklists.goToFirstMissingItem")}
                </button>
              </>
            ) : (
              <p>{translate("checklists.reviewValidationNowComplete")}</p>
            )}
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
                missing={hasAttemptedValidation && missingItems.some((missingItem) => missingItem.key === `checklist:${item.id}`)}
                photoMissing={hasAttemptedValidation && missingItems.some((missingItem) => missingItem.key === `photo:${item.id}`)}
                answerTargetRef={(node) => {
                  if (node) fieldTargetsRef.current.set(`checklist:${item.id}`, node);
                  else fieldTargetsRef.current.delete(`checklist:${item.id}`);
                }}
                photoTargetRef={(node) => {
                  if (node) fieldTargetsRef.current.set(`photo:${item.id}`, node);
                  else fieldTargetsRef.current.delete(`photo:${item.id}`);
                }}
                onEvidenceSaved={(requirementId) => setConfirmedEvidenceIds((current) => new Set([...current, requirementId]))}
              />
            ))}
          </section>
        ))}

        {checklist.inventoryItems?.length > 0 && (
          <section className="public-checklist__section" aria-labelledby="public-checklist-inventory-title">
            <h2 id="public-checklist-inventory-title">{translate("checklists.inventoryCount")}</h2>
            <div className="public-checklist__inventory">
              {checklist.inventoryItems.map((item) => (
                <div className="public-checklist__inventory-item" key={item.id}>
                  <label htmlFor={`inventory-answer-${item.id}`}>{itemLabel(item, translate)}</label>
                  <select
                    id={`inventory-answer-${item.id}`}
                    value={draft.inventoryAnswers?.[item.id] || "UNANSWERED"}
                    disabled={isReadOnly}
                    className={hasAttemptedValidation && missingItems.some((missingItem) => missingItem.key === `inventory:${item.id}`) ? "public-checklist__control--missing" : undefined}
                    ref={(node) => {
                      if (node) fieldTargetsRef.current.set(`inventory:${item.id}`, node);
                      else fieldTargetsRef.current.delete(`inventory:${item.id}`);
                    }}
                    aria-describedby={hasAttemptedValidation && missingItems.some((missingItem) => missingItem.key === `inventory:${item.id}`) ? `inventory-missing-${item.id}` : undefined}
                    onChange={(event) => queueChanges({ inventoryAnswers: { [item.id]: event.target.value } })}
                  >
                    {inventoryAnswers.map((answer) => <option key={answer} value={answer}>{translate(`checklists.inventory${answer}`)}</option>)}
                  </select>
                  {hasAttemptedValidation && missingItems.some((missingItem) => missingItem.key === `inventory:${item.id}`) && (
                    <small className="public-checklist__missing-marker" id={`inventory-missing-${item.id}`}>{translate("checklists.inventoryRequiredBeforeReview")}</small>
                  )}
                </div>
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

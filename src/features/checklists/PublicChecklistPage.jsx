import { Icon } from "../../components/Icon.jsx";
import { useEffect, useRef, useState } from "react";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { languageOptions, usePublicTranslation } from "../../i18n/translations.js";
import { formatDate } from "../../lib/presentation.js";
import { checklistSaveStates, usePublicChecklistDraft } from "./usePublicChecklistDraft.js";
import { useChecklistPhotoGallery } from "./useChecklistPhotoGallery.js";
import { ChecklistPhotoGallery } from "./ChecklistPhotoGallery.jsx";
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

/** How much of one part is answered, with a check once it is all done. */
function SectionCount({ done, total, translate }) {
  if (!total) return null;
  return <span className={`public-checklist__count${done === total ? " is-complete" : ""}`}>
    {done === total && <span aria-hidden="true">✓ </span>}{translate("checklists.sectionProgress", { done, total })}
  </span>;
}

function itemLabel(item, translate) {
  return item.label || translate(item.labelKey || item.id);
}

function ChecklistPhoto({ item, token, evidence, disabled, missing, onEvidenceSaved, targetRef, translate }) {
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);
  const [state, setState] = useState(evidence ? "SAVED" : "IDLE");
  const [retryFile, setRetryFile] = useState(null);
  const [error, setError] = useState(null);
  const [diagnosticCode, setDiagnosticCode] = useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);

  useEffect(() => {
    if (evidence) {
      setState("SAVED");
      setError(null);
      setDiagnosticCode(null);
    }
  }, [evidence]);

  useEffect(() => () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  const upload = async (file) => {
    if (!file || disabled || state === "UPLOADING") return;
    setState("UPLOADING");
    setError(null);
    setDiagnosticCode(null);
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
      setDiagnosticCode(uploadError?.diagnosticCode || null);
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
      {!isSaved && <p className="public-checklist__photo-guidance">{translate("checklists.photoFormatGuidance")}</p>}
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
          <p>{translate(error === "checklist_photo_too_large"
            ? "checklists.photoTooLarge"
            : error === "checklist_photo_invalid_type"
              ? "checklists.photoUnsupportedType"
              : "checklists.photoUploadFailed")}</p>
          {diagnosticCode && <small>{translate("checklists.photoDiagnosticCode", { code: diagnosticCode })}</small>}
          {retryFile && <button className="button button--small" type="button" onClick={() => upload(retryFile)}>{translate("checklists.retryPhoto")}</button>}
        </div>
      )}
    </div>
  );
}

function ChecklistAnswer({
  item, value, onChange, translate, token, evidence, disabled = false,
  missing = false, photoMissing = false, answerTargetRef, photoTargetRef, onEvidenceSaved, gallery,
  photoRequirements = null, photoRequirementsAreExample = false,
}) {
  const label = itemLabel(item, translate);
  const answerValues = ["UNANSWERED", "DONE", ...(item.canBeNotApplicable ? ["NOT_APPLICABLE"] : [])];
  const missingAnswerId = `checklist-missing-${item.id}`;

  return (
    <fieldset className={`public-checklist__item public-checklist__item--task${value !== "UNANSWERED" ? " is-answered" : ""}${missing ? " public-checklist__item--missing" : ""}`} aria-describedby={missing ? missingAnswerId : undefined}>
      <legend>{label}</legend>
      <div className="public-checklist__answer-options">
        {answerValues.map((answer) => (
          <label key={answer} data-answer={answer}
            className={[value === answer ? "public-checklist__answer-option--selected" : "", answer === "UNANSWERED" ? "visually-hidden" : ""].join(" ").trim()}
            // One tap marks the task; tapping the chosen answer again clears it.
            onClick={(event) => { if (answer !== "UNANSWERED" && value === answer && !disabled) { event.preventDefault(); onChange("UNANSWERED"); } }}>
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
        // Photos have their own section at the end; the task only points to it.
        gallery ? <p className={`public-checklist__photo-pointer${photoMissing ? " public-checklist__photo-pointer--missing" : ""}`}>
          <span className="public-checklist__photo-required">{translate("checklists.photoRequired")}</span>
          <a href="#public-checklist-photos-section">{translate("checklists.photosAtEnd")}</a>
        </p> : <ChecklistPhoto
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

function ReviewHandoff({ checklist, saveState, isSubmittingReview, reviewError, onCheckReadiness, onSubmit, language, translate, pendingPhotos, refreshingPhotos, remotePendingPhotos }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const isReady = saveState === checklistSaveStates.READY_FOR_REVIEW;
  const canSubmit = saveState === checklistSaveStates.SAVED && !isSubmittingReview && !refreshingPhotos;
  const showReviewError = Boolean(reviewError && reviewError !== "checklist_requirements_missing");
  const readyAt = formatReadyForReviewAt(checklist.readyForReviewAt, language);

  useEffect(() => {
    if (reviewError === "checklist_requirements_missing") setIsConfirming(false);
  }, [reviewError]);
  useEffect(() => { setIsConfirming(false); }, [checklist.evidenceRevision, pendingPhotos]);
  const check = (onReady) => {
    const result = onCheckReadiness();
    if (typeof result?.then === "function") result.then((ready) => { if (ready) onReady(); else setIsConfirming(false); });
    else if (result) onReady();
    else setIsConfirming(false);
  };

  if (isReady) {
    return (
      <section className="public-checklist__review-state" aria-live="polite">
        <h2>{translate("checklists.readyForReview")}</h2>
        <p className="public-checklist__receipt">{translate("checklists.submissionReceipt")}</p>
        <p>{translate("checklists.readyForReviewReadOnly")}</p>
        {readyAt && <p>{translate("checklists.readyForReviewAt", { time: readyAt })}</p>}
      </section>
    );
  }

  return (
    <section className="public-checklist__review-handoff" aria-labelledby="checklist-review-handoff-title">
      <h2 id="checklist-review-handoff-title" tabIndex={-1}>{translate("checklists.sendForReview")}</h2>
      {isSubmittingReview && <p role="status">{translate("checklists.submissionPending")}</p>}
      {pendingPhotos > 0 && <p role="status">{translate("checklists.pendingPhotos")}</p>}
      {remotePendingPhotos > 0 && <p role="status">{translate("checklists.remotePendingPhotos")}</p>}
      {!isConfirming ? (
        <>
          <p>{translate("checklists.readyForReviewPrompt")}</p>
          {!canSubmit && <p className="public-checklist__review-help">{translate("checklists.readyForReviewSaveFirst")}</p>}
          {showReviewError && <p className="form-error" role="alert">{reviewErrorMessage(reviewError, translate)}</p>}
          <button className="button" type="button" disabled={!canSubmit} onClick={() => {
            check(() => setIsConfirming(true));
          }}>
            {translate("checklists.sendForReview")}
          </button>
        </>
      ) : (
        <div className="public-checklist__review-confirmation" role="dialog" aria-labelledby="checklist-review-confirm-title">
          <h3 id="checklist-review-confirm-title">{translate("checklists.sendForReviewConfirmTitle")}</h3>
          <p>{translate("checklists.readyForReviewConfirmBody")}</p>
          {showReviewError && <p className="form-error" role="alert">{reviewErrorMessage(reviewError, translate)}</p>}
          <div className="public-checklist__review-actions">
            <button className="button" type="button" disabled={isSubmittingReview} onClick={() => {
              check(onSubmit);
            }}>
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
    reviewRequirements,
    queueChanges,
    saveNow,
    discardLocalChanges,
    reapplyLocalChanges,
    submitForManagerReview,
    retryLoad,
    updateEvidence,
  } = usePublicChecklistDraft(token);
  const { language, setLanguage, translate } = usePublicTranslation(checklist?.preferredLanguage);
  const fieldTargetsRef = useRef(new Map());
  const [hasAttemptedValidation, setHasAttemptedValidation] = useState(false);
  const [confirmedEvidenceIds, setConfirmedEvidenceIds] = useState(() => new Set());
  const isV2 = checklist?.evidencePolicy?.version === 2;
  const gallery = useChecklistPhotoGallery({ token, checklist, disabled: isSubmittingReview || saveState === checklistSaveStates.READY_FOR_REVIEW, onEvidence: updateEvidence });
  const canReviewRef = useRef(false);
  canReviewRef.current = saveState === checklistSaveStates.SAVED && !isSubmittingReview;

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
        && !evidenceByRequirement.has(item.id) && (isV2 || !confirmedEvidenceIds.has(item.id))) {
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
  const photoItem = checklist.sections.flatMap((section) => section.items).find((item) => item.requiresPhoto && item.id === pilotPhotoRequirementId);
  const failedPhotos = isV2 ? gallery.local.filter((item) => item.state === "FAILED").length : 0;
  const sendingPhotos = isV2 ? gallery.local.length - failedPhotos : 0;
  const moveToPhotos = () => {
    const target = fieldTargetsRef.current.get(`photo:${pilotPhotoRequirementId}`);
    target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    target?.focus?.({ preventScroll: true });
  };
  const moveToFirstMissing = () => {
    const target = fieldTargetsRef.current.get(missingItems[0]?.key);
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    target?.focus?.({ preventScroll: true });
  };
  const reviewHandoff = <ReviewHandoff
    checklist={checklist}
    saveState={saveState}
    isSubmittingReview={isSubmittingReview}
    reviewError={reviewError}
    pendingPhotos={isV2 ? gallery.pendingCount : 0}
    refreshingPhotos={isV2 && gallery.refreshing}
    remotePendingPhotos={reviewRequirements?.pendingPhotoCount || 0}
    onCheckReadiness={() => {
      const validate = () => {
        if (isV2 && gallery.getSnapshot().pendingCount > 0) {
          // Photos still sending or not saved block the review; take the cleaner to them.
          setHasAttemptedValidation(true);
          requestAnimationFrame(moveToPhotos);
          return false;
        }
        const missing = isV2 ? missingItems.filter((item) => item.kind !== "photo").length > 0
          || !gallery.getSnapshot().saved.some((item) => item.requirementId === pilotPhotoRequirementId) : missingItems.length > 0;
        if (!missing && canReviewRef.current) return true;
        setHasAttemptedValidation(true); requestAnimationFrame(moveToFirstMissing); return false;
      };
      if (!isV2 || gallery.pendingCount > 0 || missingItems.length > 0) return validate();
      return gallery.refreshSaved().then((loaded) => loaded && validate());
    }}
    onSubmit={submitForManagerReview}
    language={language}
    translate={translate}
  />;

  return (
    <main className="public-offer-page checklist-public-page">
      <section className="panel public-checklist" aria-labelledby="public-checklist-title">
        <header className="public-checklist__header">
          <div>
            <p className="public-checklist__brand"><span className="public-checklist__mark" aria-hidden="true"><Icon name="broom" size={14} /></span>CleanFlow</p>
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

        {!isReadOnly && (() => {
          const tasks = checklist.sections.flatMap((section) => section.items);
          const inventory = checklist.inventoryItems || [];
          const total = tasks.length + inventory.length;
          const done = tasks.filter((item) => (draft.checklistAnswers?.[item.id] || "UNANSWERED") !== "UNANSWERED").length
            + inventory.filter((item) => (draft.inventoryAnswers?.[item.id] || "UNANSWERED") !== "UNANSWERED").length;
          if (!total) return null;
          return <div className="public-checklist__progress" data-testid="checklist-progress">
            <p>{translate("checklists.overallProgress", { done, total })}</p>
            <progress max={total} value={done} aria-label={translate("checklists.overallProgress", { done, total })} />
          </div>;
        })()}

        {isReadOnly && reviewHandoff}

        {!isReadOnly && (
          <section className="public-checklist__completion" aria-labelledby="checklist-completion-title" aria-live="polite">
            <h2 id="checklist-completion-title">{translate(isSubmittingReview ? "checklists.sendForReviewSending" : missingItems.length > 0
              ? "checklists.completionIncomplete"
              : failedPhotos > 0 ? "checklists.completionPhotosFailed"
              : sendingPhotos > 0 ? "checklists.completionPhotosSending"
              : isV2 && (gallery.pendingCount > 0 || gallery.refreshing) ? "checklists.completionSaving"
              : saveState === checklistSaveStates.SAVED ? "checklists.completionReady" : "checklists.completionSaving", { count: failedPhotos })}</h2>
            {/* Both wordings reserve their height, so saving an answer never moves the list below. */}
            <p className="public-checklist__steady" data-alternate={translate(saveState === checklistSaveStates.SAVED ? "checklists.draftPending" : "checklists.draftNotSubmitted")}><span>{translate(saveState === checklistSaveStates.SAVED ? "checklists.draftNotSubmitted" : "checklists.draftPending")}</span></p>
            {missingItems.length > 0 ? (
              <>
                {!hasAttemptedValidation && <p>{translate("checklists.reviewValidationSummary", { checklist: missingChecklistCount, inventory: missingInventoryCount, photos: missingPhotoCount })}</p>}
                {!hasAttemptedValidation && <button className="button button--secondary" type="button" onClick={moveToFirstMissing}>{translate("checklists.goToFirstMissingItem")}</button>}
              </>
            ) : failedPhotos > 0 ? <><p>{translate("checklists.completionPhotosFailedHelp")}</p><button className="button button--secondary" type="button" onClick={moveToPhotos}>{translate("checklists.goToPhotos")}</button></>
            : saveState === checklistSaveStates.SAVED && (!isV2 || gallery.pendingCount === 0) && <><p>{translate("checklists.completionReadyHelp")}</p><a className="button button--secondary" href="#checklist-review-handoff-title">{translate("checklists.goToSendStep")}</a></>}
          </section>
        )}

        {checklist.cleanerInstructions && (
          <section className="public-checklist__instructions" aria-labelledby="public-checklist-instructions-title">
            <h2 id="public-checklist-instructions-title">{translate("checklists.cleanerInstructions")}</h2>
            <p>{checklist.cleanerInstructions}</p>
          </section>
        )}

        {!isReadOnly && hasAttemptedValidation && (
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
              isV2 && gallery.pendingCount > 0
                ? <><p>{translate("checklists.completionPhotosFailedHelp")}</p><button className="button button--secondary" type="button" onClick={moveToPhotos}>{translate("checklists.goToPhotos")}</button></>
                : <p>{translate("checklists.reviewValidationNowComplete")}</p>
            )}
          </section>
        )}

        {checklist.sections.map((section) => (
          <section className="public-checklist__section" key={section.id} aria-labelledby={`public-section-${section.id}`}>
            <h2 id={`public-section-${section.id}`} className="public-checklist__section-title">
              <span>{section.title || section.label || translate(section.titleKey || section.id)}</span>
              <SectionCount done={section.items.filter((item) => (draft.checklistAnswers?.[item.id] || "UNANSWERED") !== "UNANSWERED").length} total={section.items.length} translate={translate} />
            </h2>
            {section.items.map((item) => (
              <ChecklistAnswer
                key={item.id}
                item={item}
                value={draft.checklistAnswers?.[item.id] || "UNANSWERED"}
                onChange={(answer) => queueChanges({ checklistAnswers: { [item.id]: answer } })}
                translate={translate}
                token={token}
                gallery={isV2 ? gallery : null}
                evidence={evidenceByRequirement.get(item.id)}
                disabled={isReadOnly || isSubmittingReview}
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
                // FB06: optional frozen list from the Run (proposed contract). Absent on current Runs.
                photoRequirements={Array.isArray(checklist.photoRequirements) ? checklist.photoRequirements : null}
                photoRequirementsAreExample={checklist.photoRequirementsSample === true}
              />
            ))}
          </section>
        ))}

        {checklist.inventoryItems?.length > 0 && (
          <section className="public-checklist__section" aria-labelledby="public-checklist-inventory-title">
            <h2 id="public-checklist-inventory-title" className="public-checklist__section-title">
              <span>{translate("checklists.inventoryCount")}</span>
              <SectionCount done={checklist.inventoryItems.filter((item) => (draft.inventoryAnswers?.[item.id] || "UNANSWERED") !== "UNANSWERED").length} total={checklist.inventoryItems.length} translate={translate} />
            </h2>
            <div className="public-checklist__inventory">
              {checklist.inventoryItems.map((item) => (
                <fieldset key={item.id} aria-describedby={hasAttemptedValidation && missingItems.some((missingItem) => missingItem.key === `inventory:${item.id}`) ? `inventory-missing-${item.id}` : undefined}
                  className={`public-checklist__inventory-item${hasAttemptedValidation && missingItems.some((missingItem) => missingItem.key === `inventory:${item.id}`) ? " public-checklist__control--missing" : ""}`}>
                  <legend>{itemLabel(item, translate)}</legend>
                  <div className="public-checklist__levels">
                    {inventoryAnswers.map((answer) => {
                      const current = draft.inventoryAnswers?.[item.id] || "UNANSWERED";
                      return <label key={answer} data-level={answer} className={answer === "UNANSWERED" ? "visually-hidden" : undefined}
                        // One tap sets the level; tapping the chosen level again clears it.
                        onClick={(event) => { if (answer !== "UNANSWERED" && current === answer && !isReadOnly) { event.preventDefault(); queueChanges({ inventoryAnswers: { [item.id]: "UNANSWERED" } }); } }}>
                        <input type="radio" name={`inventory-answer-${item.id}`} value={answer} checked={current === answer} disabled={isReadOnly}
                          ref={answer === "LOW" ? (node) => {
                            if (node) fieldTargetsRef.current.set(`inventory:${item.id}`, node);
                            else fieldTargetsRef.current.delete(`inventory:${item.id}`);
                          } : undefined}
                          onChange={() => queueChanges({ inventoryAnswers: { [item.id]: answer } })} />
                        {translate(answer === "NEEDS_RESTOCK" ? "checklists.inventoryRestockShort" : `checklists.inventory${answer}`)}
                      </label>;
                    })}
                  </div>
                  {hasAttemptedValidation && missingItems.some((missingItem) => missingItem.key === `inventory:${item.id}`) && (
                    <small className="public-checklist__missing-marker" id={`inventory-missing-${item.id}`}>{translate("checklists.inventoryRequiredBeforeReview")}</small>
                  )}
                </fieldset>
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

        {!isV2 && checklist.requiredPhotoTypes?.length > 0 && (
          <section className="public-checklist__future-note" aria-labelledby="public-checklist-photos-title">
            <h2 id="public-checklist-photos-title">{translate("checklists.requiredPhotos")}</h2>
            <p>{translate("checklists.photosLater")}</p>
          </section>
        )}

        {isV2 && photoItem && (
          <section className="public-checklist__section" id="public-checklist-photos-section" aria-labelledby="public-checklist-photos-section-title">
            <h2 id="public-checklist-photos-section-title" className="public-checklist__section-title">
              <span>{translate("checklists.photosSectionTitle")}</span>
            </h2>
            <ChecklistPhotoGallery gallery={gallery} token={token} disabled={isReadOnly || isSubmittingReview}
              missing={hasAttemptedValidation && missingItems.some((missingItem) => missingItem.key === `photo:${photoItem.id}`)}
              targetRef={(node) => {
                if (node) fieldTargetsRef.current.set(`photo:${photoItem.id}`, node);
                else fieldTargetsRef.current.delete(`photo:${photoItem.id}`);
              }}
              translate={translate}
              // FB06: optional frozen list from the Run (proposed contract). Absent on current Runs.
              photoRequirements={Array.isArray(checklist.photoRequirements) ? checklist.photoRequirements : null}
              requirementsAreExample={checklist.photoRequirementsSample === true} />
          </section>
        )}

        {!isReadOnly && reviewHandoff}
      </section>
      <ScrollToTopButton />
    </main>
  );
}

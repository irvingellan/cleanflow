import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { languageOptions, useTranslation } from "../../i18n/translations.js";
import { formatDate } from "../../lib/presentation.js";
import { checklistSaveStates, usePublicChecklistDraft } from "./usePublicChecklistDraft.js";

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
};

const inventoryAnswers = ["UNANSWERED", "LOW", "MEDIUM", "HIGH", "NEEDS_RESTOCK"];

function itemLabel(item, translate) {
  return item.label || translate(item.labelKey || item.id);
}

function ChecklistAnswer({ item, value, onChange, translate }) {
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
              onChange={() => onChange(answer)}
            />
            {translate(`checklists.answer${answer}`)}
          </label>
        ))}
      </div>
    </fieldset>
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
    queueChanges,
    saveNow,
    discardLocalChanges,
    reapplyLocalChanges,
  } = usePublicChecklistDraft(token);

  if (isLoading) {
    return <main className="public-offer-page checklist-public-page"><section className="panel"><StateCard message={translate("checklists.publicLoading")} status="status" /></section></main>;
  }

  if (loadError || !checklist || !draft) {
    return <main className="public-offer-page checklist-public-page"><section className="panel"><StateCard message={translate(errorKeys[loadError] || "checklists.publicUnavailable")} status="alert" isError /></section></main>;
  }

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
              onChange={(event) => queueChanges({ issueNotes: event.target.value }, { debounce: true })}
            />
          </label>
          <label>
            <span>{translate("checklists.generalNotes")}</span>
            <textarea
              rows="3"
              maxLength="2000"
              value={draft.generalNotes || ""}
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
      </section>
      <ScrollToTopButton />
    </main>
  );
}

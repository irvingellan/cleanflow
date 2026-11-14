import { useState } from "react";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { BackButton, DetailItem, StateCard } from "../../components/UiPrimitives.jsx";
import { formatDate } from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";
import { formatChecklistInventoryAnswer, withChecklistInventoryMessages } from "../../i18n/checklistInventoryMessages.js";
import {
  checklistInventoryLevels,
  checklistInventoryQuantityMax,
  supportsChecklistInventoryQuantity,
  validChecklistInventoryQuantity,
} from "../../../functions/src/checklistInventory.js";
import { correctChecklistAnswer, getChecklistEvidence, setReportPhotoVisibility } from "./checklistRunService.js";
import { ClientReportControls } from "./ClientReportControls.jsx";
import { ChecklistPhotoGrid } from "./ChecklistPhotoGrid.jsx";

function checklistLabel(item, translate) {
  return item?.label || translate(item?.labelKey || item?.id || "checklists.itemCount");
}

function formatRunCreatedAt(value, language) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(
    { en: "en-US", pt: "pt-BR", es: "es-ES" }[language] || "en-US",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(date);
}

function assignedCleanerDisplayName(job, assignments, fallback) {
  const assignmentNames = (assignments || [])
    .filter((assignment) => assignment.isActive === true)
    .map((assignment) => assignment.cleanerNameSnapshot?.trim())
    .filter(Boolean);

  if (assignmentNames.length > 0) {
    return [...new Set(assignmentNames)].join(" · ");
  }

  return job.assignedCleanerName?.trim() || fallback;
}

function attentionSummary(checklistRun, translate) {
  const checklistItems = (checklistRun.sections || []).flatMap((section) => section.items || []);
  const inventoryItems = checklistRun.inventoryItems || [];
  const done = checklistItems.filter((item) => item.answer === "DONE").length;
  const notApplicable = checklistItems.filter((item) => item.answer === "NOT_APPLICABLE").length;
  const unansweredChecklist = checklistItems
    .filter((item) => !item.answer || item.answer === "UNANSWERED")
    .map((item) => ({ id: `checklist-${item.id}`, label: checklistLabel(item, translate) }));
  const unansweredInventory = inventoryItems
    .filter((item) => !item.answer || item.answer === "UNANSWERED")
    .map((item) => ({ id: `inventory-${item.id}`, label: checklistLabel(item, translate) }));
  const restockItems = inventoryItems.filter((item) => item.answer === "NEEDS_RESTOCK"
    || (checklistRun.definitionVersion === 2 && ["LOW", "EMPTY"].includes(item.answer)));

  return {
    done,
    notApplicable,
    unanswered: unansweredChecklist.length,
    unansweredItems: [...unansweredChecklist, ...unansweredInventory],
    restockItems,
  };
}

function AttentionNames({ title, items, emptyMessage, translate }) {
  const visibleItems = items.slice(0, 3);
  const remainingItems = items.slice(3);
  return (
    <div className="checklist-run__attention-group">
      <h4>{title}</h4>
      {items.length === 0 ? <p>{emptyMessage}</p> : (
        <>
          <ul>{visibleItems.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
          {remainingItems.length > 0 && (
            <details>
              <summary>{translate("checklists.showMoreAttentionItems", { count: remainingItems.length })}</summary>
              <ul>{remainingItems.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** Displays the server-projected manager summary, never a raw Property or Run. */
export function ChecklistRunDetail({
  job, checklistRun, isRefreshing = false, hasRefreshError = false, onRefresh, onBack,
  loadEvidence = getChecklistEvidence, assignments = [], onApproveAndComplete, onAbandonAndComplete,
  onSubmitForReview, setPhotoVisibility = setReportPhotoVisibility, correctAnswer = correctChecklistAnswer,
}) {
  const { language, translate: baseTranslate } = useTranslation();
  const translate = withChecklistInventoryMessages(baseTranslate, language);
  const definitionVersion = checklistRun.definitionVersion;
  const createdAt = formatRunCreatedAt(checklistRun.createdAt, language);
  const requiredPhotoTypes = checklistRun.requiredPhotoTypes || [];
  const requiredPhotoCount = Number.isInteger(checklistRun.requiredPhotoCount)
    ? checklistRun.requiredPhotoCount
    : requiredPhotoTypes.length;
  const draft = checklistRun.draft;
  const lastSavedAt = formatRunCreatedAt(draft?.lastSavedAt, language);
  const readyForReviewAt = formatRunCreatedAt(checklistRun.readyForReviewAt, language);
  const abandonedAt = formatRunCreatedAt(checklistRun.abandonedAt, language);
  const isDraft = checklistRun.status === "DRAFT";
  const isReadyForReview = checklistRun.status === "READY_FOR_REVIEW";
  const isAbandoned = checklistRun.status === "ABANDONED";
  const canApproveAndComplete = isReadyForReview
    && job.operationalStatus !== "COMPLETED"
    && typeof onApproveAndComplete === "function";
  const canAbandonAndComplete = isDraft
    && !job.archivedAt
    && ["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus)
    && typeof onAbandonAndComplete === "function";
  const [isCompletionConfirmationVisible, setIsCompletionConfirmationVisible] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [hasCompletionError, setHasCompletionError] = useState(false);
  const [isAbandonConfirmationVisible, setIsAbandonConfirmationVisible] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [hasAbandonError, setHasAbandonError] = useState(false);
  const evidence = checklistRun.evidence || [];
  const assignedCleanerName = assignedCleanerDisplayName(
    job,
    assignments,
    translate("dashboard.notAssigned"),
  );
  const attention = attentionSummary(checklistRun, translate);
  const issueNotes = draft?.issueNotes?.trim() || "";
  const generalNotes = draft?.generalNotes?.trim() || "";
  const hasCleanerNotes = Boolean(issueNotes || generalNotes);
  // Section 8: say exactly what keeps a draft from being sent for review.
  const missingRequiredPhoto = (checklistRun.sections || []).some((section) => (section.items || [])
    .some((item) => item.id === "living-belongings"))
    && !evidence.some((item) => item.requirementId === "living-belongings");
  const blockers = isDraft ? [
    ...attention.unansweredItems.map((item) => ({ id: item.id, label: item.label })),
    ...(missingRequiredPhoto ? [{ id: "photo", label: translate("checklists.blockerRequiredPhoto") }] : []),
  ] : [];
  const canSubmitForReview = isDraft && typeof onSubmitForReview === "function"
    && !job.archivedAt && ["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus) && Number.isInteger(draft?.revision);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hiddenOverrides, setHiddenOverrides] = useState({});
  const [photoVisibilityError, setPhotoVisibilityError] = useState(false);
  // One answer at a time can be open for correction: "checklist:<id>" or "inventory:<id>".
  const [correcting, setCorrecting] = useState(null);
  const [inventoryCorrectionLevel, setInventoryCorrectionLevel] = useState("");
  const [inventoryCorrectionQuantity, setInventoryCorrectionQuantity] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState(false);
  const canCorrect = isReadyForReview && !job.archivedAt && typeof onRefresh === "function";
  const saveCorrection = async (kind, itemId, answer) => {
    setSavingCorrection(true); setCorrectionError(false);
    try { await correctAnswer(job.id, kind, itemId, answer); setCorrecting(null); await onRefresh(); }
    catch { setCorrectionError(true); }
    finally { setSavingCorrection(false); }
  };
  const answerRow = (kind, item) => {
    const key = `${kind}:${item.id}`;
    const inventory = kind === "inventory";
    const newInventory = inventory && definitionVersion === 2;
    const prefix = inventory ? "checklists.inventory" : "checklists.answer";
    const options = inventory ? (newInventory ? checklistInventoryLevels(definitionVersion) : ["LOW", "MEDIUM", "HIGH", "NEEDS_RESTOCK"])
      : ["DONE", ...(item.canBeNotApplicable ? ["NOT_APPLICABLE"] : [])];
    const displayAnswer = (answer, quantity) => inventory
      ? formatChecklistInventoryAnswer(translate, answer, quantity)
      : translate(`${prefix}${answer || "UNANSWERED"}`);
    const quantityApplicable = newInventory && supportsChecklistInventoryQuantity(definitionVersion, inventoryCorrectionLevel);
    const parsedQuantity = quantityApplicable && inventoryCorrectionQuantity !== "" ? Number(inventoryCorrectionQuantity) : null;
    const validCorrection = options.includes(inventoryCorrectionLevel)
      && (parsedQuantity === null || validChecklistInventoryQuantity(parsedQuantity));
    return <li key={item.id} className={item.correctedByManager ? "is-corrected" : undefined}>
      <span>{checklistLabel(item, translate)}</span>
      <strong>{displayAnswer(item.answer, item.quantity)}</strong>
      {item.correctedByManager && <small className="checklist-run__corrected">{translate("checklists.correctedByManager", { answer: displayAnswer(item.cleanerAnswer, item.originalQuantity) })}</small>}
      {canCorrect && correcting !== key && <button className="button button--text checklist-run__correct" type="button" onClick={() => {
        setCorrectionError(false);
        setCorrecting(key);
        setInventoryCorrectionLevel(options.includes(item.answer) ? item.answer : "");
        setInventoryCorrectionQuantity(Number.isInteger(item.quantity) ? String(item.quantity) : "");
      }}>{translate("checklists.correctAnswer")}</button>}
      {canCorrect && correcting === key && <div className="checklist-run__correction" role="group" aria-label={translate("checklists.correctAnswerFor", { item: checklistLabel(item, translate) })}>
        {newInventory ? <>
          <label>{translate("checklists.inventoryLevel")}
            <select value={inventoryCorrectionLevel} disabled={savingCorrection} onChange={(event) => {
              setInventoryCorrectionLevel(event.target.value);
              if (!supportsChecklistInventoryQuantity(definitionVersion, event.target.value)) setInventoryCorrectionQuantity("");
            }}>
              <option value="">{translate("checklists.inventoryUNANSWERED")}</option>
              {options.map((level) => <option key={level} value={level}>{translate(`${prefix}${level}`)}</option>)}
            </select>
          </label>
          {quantityApplicable && <label>{translate("checklists.inventoryQuantityOptional")}
            <input type="number" inputMode="numeric" min={0} max={checklistInventoryQuantityMax} step={1}
              value={inventoryCorrectionQuantity} disabled={savingCorrection} onChange={(event) => setInventoryCorrectionQuantity(event.target.value)} />
          </label>}
          <button className="button button--small" type="button" disabled={savingCorrection || !validCorrection} onClick={() => saveCorrection(
            kind, item.id, parsedQuantity === null ? inventoryCorrectionLevel : { level: inventoryCorrectionLevel, quantity: parsedQuantity },
          )}>{translate("checklists.inventorySaveCorrection")}</button>
        </> : options.filter((answer) => answer !== item.answer).map((answer) => (
          <button key={answer} className="button button--small" type="button" disabled={savingCorrection} onClick={() => saveCorrection(kind, item.id, answer)}>{translate(`${prefix}${answer}`)}</button>
        ))}
        {item.correctedByManager && <button className="button button--small button--secondary" type="button" disabled={savingCorrection} onClick={() => saveCorrection(kind, item.id, null)}>{translate("checklists.undoCorrection")}</button>}
        <button className="button button--small button--secondary" type="button" disabled={savingCorrection} onClick={() => setCorrecting(null)}>{translate("common.cancel")}</button>
        {correctionError && <p className="form-error" role="alert">{translate("checklists.correctionError")}</p>}
      </div>}
    </li>;
  };

  // FB07: hiding keeps the evidence; the client report no longer shows it.
  async function togglePhotoInReport(item) {
    const hidden = !(hiddenOverrides[item.evidenceId] ?? item.hiddenFromReport === true);
    const reason = hidden ? window.prompt(translate("checklists.hidePhotoReason")) : "";
    if (hidden && reason === null) return;
    setPhotoVisibilityError(false);
    try {
      await setPhotoVisibility(job.id, item.evidenceId, hidden, (reason || "").slice(0, 300));
      setHiddenOverrides((current) => ({ ...current, [item.evidenceId]: hidden }));
    } catch {
      setPhotoVisibilityError(true);
    }
  }
  const [submitError, setSubmitError] = useState(null);

  async function submitForReview() {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmitForReview(draft.revision);
    } catch (error) {
      setSubmitError(error?.code === "functions/aborted" || error?.code === "aborted"
        ? "checklists.submitForReviewChanged" : "checklists.submitForReviewError");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function approveAndComplete() {
    setIsCompleting(true);
    setHasCompletionError(false);
    try {
      await onApproveAndComplete();
      setIsCompletionConfirmationVisible(false);
    } catch {
      setHasCompletionError(true);
    } finally {
      setIsCompleting(false);
    }
  }

  async function abandonAndComplete() {
    setIsAbandoning(true);
    setHasAbandonError(false);
    try {
      await onAbandonAndComplete();
      setIsAbandonConfirmationVisible(false);
    } catch {
      setHasAbandonError(true);
    } finally {
      setIsAbandoning(false);
    }
  }

  const runDescriptionKey = isDraft ? "checklists.draftDescription"
    : isReadyForReview ? "checklists.readyForReviewDescription"
      : isAbandoned ? "checklists.abandonedDescription" : "checklists.unknownRunDescription";
  const runStateKey = isDraft ? "checklists.draft"
    : isReadyForReview ? "checklists.readyForReview"
      : isAbandoned ? "checklists.abandoned" : "checklists.unknownRunState";

  return (
    <section className="panel checklist-run" aria-labelledby="checklist-run-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("checklists.managerEyebrow")}</p>
      <h2 id="checklist-run-title" className="panel__title">
        {translate("checklists.runTitle")}
      </h2>
      {onRefresh && (
        <button className="button button--small" type="button" disabled={isRefreshing} onClick={onRefresh}>
          {isRefreshing ? translate("checklists.refreshingSavedProgress") : translate("checklists.refreshSavedProgress")}
        </button>
      )}
      {hasRefreshError && <StateCard message={translate("checklists.loadError")} status="alert" isError />}

      <StateCard
        message={translate(runDescriptionKey)}
        status="status"
      />
      {isDraft && <p className="checklist-run__draft-action-note">
        {translate(canAbandonAndComplete ? "checklists.draftCompletionGuidance" : "checklists.draftReviewGuidance")}
      </p>}

      <dl className="detail-list checklist-run__details">
        <DetailItem
          label={translate("common.property")}
          value={checklistRun.property?.name || job.propertyName || translate("properties.unnamed")}
        />
        <DetailItem
          label={translate("jobs.scheduledDate")}
          value={formatDate(checklistRun.serviceDate || job.scheduledDate, translate, language)}
        />
        <DetailItem label={translate("jobs.assignedCleaner")} value={assignedCleanerName} />
        <DetailItem
          label={translate("checklists.runState")}
          value={translate(runStateKey)}
        />
        {readyForReviewAt && <DetailItem label={translate("checklists.sentForReviewAt")} value={readyForReviewAt} />}
        {isAbandoned && abandonedAt && <DetailItem label={translate("checklists.abandonedAt")} value={abandonedAt} />}
        <DetailItem
          label={translate("checklists.itemCount")}
          value={translate("checklists.itemCountValue", { count: checklistRun.checklistItemCount })}
        />
        <DetailItem
          label={translate("checklists.inventoryCount")}
          value={translate("checklists.inventoryCountValue", { count: checklistRun.inventoryItemCount })}
        />
        <DetailItem
          label={translate("checklists.requiredPhotos")}
          value={translate("checklists.requiredPhotosValue", {
            count: requiredPhotoCount,
          })}
        />
      </dl>

      <section className="checklist-run__attention" aria-labelledby="checklist-attention-title">
        <h3 id="checklist-attention-title">{translate("checklists.attentionSummary")}</h3>
        <p className="checklist-run__answer-summary">
          {translate("checklists.answerSummary", {
            done: attention.done,
            notApplicable: attention.notApplicable,
            unanswered: attention.unanswered,
          })}
        </p>
        <div className="checklist-run__attention-grid">
          <AttentionNames
            title={translate("checklists.restockItems")}
            items={attention.restockItems.map((item) => ({ id: item.id, label: checklistLabel(item, translate) }))}
            emptyMessage={translate("checklists.noRestockItems")}
            translate={translate}
          />
          <AttentionNames
            title={translate("checklists.unansweredItems")}
            items={attention.unansweredItems}
            emptyMessage={translate("checklists.noUnansweredItems")}
            translate={translate}
          />
        </div>
        <div className="checklist-run__attention-notes">
          <h4>{translate("checklists.cleanerNotes")}</h4>
          {issueNotes && <p><strong>{translate("checklists.issueNotes")}:</strong> {issueNotes}</p>}
          {generalNotes && <p><strong>{translate("checklists.generalNotes")}:</strong> {generalNotes}</p>}
          {!hasCleanerNotes && <p>{translate("checklists.noObservationsRecorded")}</p>}
        </div>
        {isReadyForReview ? (
          <a className="button button--small button--secondary" href="#checklist-manager-actions">
            {translate("checklists.jumpToManagerActions")}
          </a>
        ) : canAbandonAndComplete ? (
          <a className="button button--small button--secondary" href="#checklist-manager-actions">
            {translate("checklists.jumpToDraftCompletion")}
          </a>
        ) : (
          <p className="checklist-run__draft-action-note">{translate(
            isAbandoned ? "checklists.abandonedActionsUnavailable" : "checklists.draftActionsUnavailable",
          )}</p>
        )}
      </section>

      {requiredPhotoTypes.length > 0 && (
        <section className="checklist-run__section" aria-labelledby="checklist-required-photos-title">
          <h3 id="checklist-required-photos-title">{translate("checklists.requiredPhotos")}</h3>
          <ul className="checklist-run__list">
            {requiredPhotoTypes.map((photoType) => (
              <li key={photoType.id}>
                {photoType.label}
                {photoType.maximum ? ` · ${translate("checklists.photoMaximum", { count: photoType.maximum })}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {checklistRun.cleanerInstructions && (
        <section className="checklist-run__section" aria-labelledby="checklist-instructions-title">
          <h3 id="checklist-instructions-title">{translate("checklists.cleanerInstructions")}</h3>
          <p className="cleaner-internal-notes">{checklistRun.cleanerInstructions}</p>
        </section>
      )}

      {draft && (
        <section className="checklist-run__section" aria-labelledby="checklist-draft-progress-title">
          <h3 id="checklist-draft-progress-title">{translate("checklists.draftProgress")}</h3>
          <dl className="detail-list checklist-run__details">
            <DetailItem
              label={translate("checklists.title")}
              value={translate("checklists.draftChecklistProgress", {
                done: draft.progress?.checklist?.done || 0,
                unanswered: draft.progress?.checklist?.unanswered || 0,
              })}
            />
            <DetailItem
              label={translate("checklists.inventoryCount")}
              value={translate("checklists.draftInventoryProgress", {
                answered: draft.progress?.inventory?.answered || 0,
                restock: draft.progress?.inventory?.needsRestock || 0,
              })}
            />
            {lastSavedAt && <DetailItem label={translate("checklists.lastSavedAt")} value={lastSavedAt} />}
          </dl>
        </section>
      )}

      {checklistRun.sections?.map((section) => (
        <section className="checklist-run__section" aria-labelledby={`run-section-${section.id}`} key={section.id}>
          <h3 id={`run-section-${section.id}`}>{section.title || translate(section.titleKey || section.id)}</h3>
          <ul className="checklist-run__answers">
            {section.items?.map((item) => answerRow("checklist", item))}
          </ul>
        </section>
      ))}

      {checklistRun.inventoryItems?.length > 0 && (
        <section className="checklist-run__section" aria-labelledby="checklist-saved-inventory-title">
          <h3 id="checklist-saved-inventory-title">{translate("checklists.inventoryCount")}</h3>
          <ul className="checklist-run__answers">
            {checklistRun.inventoryItems.map((item) => answerRow("inventory", item))}
          </ul>
        </section>
      )}

      {evidence.length > 0 && (
        <section className="checklist-run__section" aria-labelledby="checklist-evidence-title">
          <h3 id="checklist-evidence-title">{translate("checklists.savedEvidence")}</h3>
          {photoVisibilityError && <p className="form-error" role="alert">{translate("checklists.photoVisibilityError")}</p>}
          <p className="cf-block__subtitle">{translate("photoViewer.gridHint", { count: evidence.length })}</p>
          <ChecklistPhotoGrid
            jobId={job.id}
            evidence={evidence}
            loadEvidence={loadEvidence}
            translate={translate}
            isHidden={(item) => Boolean(item.evidenceId) && (hiddenOverrides[item.evidenceId] ?? item.hiddenFromReport === true)}
            onToggleReport={togglePhotoInReport}
            requirementLabel={(item) => (item.requirementId === "living-belongings"
              ? translate("checklistPreview.livingBelongings")
              : translate("checklists.additionalPhoto"))}
          />
        </section>
      )}

      <div id="checklist-manager-actions">
        {isReadyForReview && <ClientReportControls jobId={job.id} job={job} />}

        {canSubmitForReview && (
          <section className="checklist-run__section checklist-run__submit" aria-labelledby="checklist-submit-title" data-testid="checklist-submit-for-review">
            <h3 id="checklist-submit-title">{translate("checklists.submitForReviewTitle")}</h3>
            {blockers.length === 0 ? <>
              <p>{translate("checklists.submitForReviewReady")}</p>
              <button className="button button--primary" type="button" disabled={isSubmitting} onClick={submitForReview}>
                {translate(isSubmitting ? "checklists.submittingForReview" : "checklists.submitForReview")}
              </button>
            </> : <>
              <p>{translate("checklists.submitForReviewBlocked", { count: blockers.length })}</p>
              <ul className="checklist-run__blockers">{blockers.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
            </>}
            {submitError && <p className="form-error" role="alert">{translate(submitError)}</p>}
          </section>
        )}

        {canAbandonAndComplete && (
          <section className="checklist-run__section" aria-labelledby="checklist-abandon-title">
            <h3 id="checklist-abandon-title">{translate("checklists.draftCompletion")}</h3>
            {!isAbandonConfirmationVisible ? (
              <button className="button" type="button" onClick={() => setIsAbandonConfirmationVisible(true)}>
                {translate("checklists.abandonAndComplete")}
              </button>
            ) : (
              <div className="completion-confirmation">
                <p>{translate("checklists.abandonAndCompleteConfirmation")}</p>
                <div className="button-row">
                  <button className="button" type="button" disabled={isAbandoning}
                    onClick={() => setIsAbandonConfirmationVisible(false)}>
                    {translate("common.cancel")}
                  </button>
                  <button className="button button--primary" type="button" disabled={isAbandoning}
                    onClick={abandonAndComplete}>
                    {isAbandoning ? translate("checklists.abandoningAndCompleting") : translate("checklists.abandonAndComplete")}
                  </button>
                </div>
              </div>
            )}
            {hasAbandonError && <p className="form-error" role="alert">{translate("checklists.abandonAndCompleteError")}</p>}
          </section>
        )}

        {canApproveAndComplete && (
          <section className="checklist-run__section" aria-labelledby="checklist-approval-title">
          <h3 id="checklist-approval-title">{translate("checklists.managerApproval")}</h3>
          {!isCompletionConfirmationVisible && (
            <button className="button button--primary" type="button" onClick={() => setIsCompletionConfirmationVisible(true)}>
              {translate("checklists.approveAndComplete")}
            </button>
          )}
          {isCompletionConfirmationVisible && (
            <div className="completion-confirmation">
              <p>{translate("checklists.approveAndCompleteConfirmation")}</p>
              <div className="button-row">
                <button className="button" type="button" disabled={isCompleting} onClick={() => setIsCompletionConfirmationVisible(false)}>
                  {translate("common.cancel")}
                </button>
                <button className="button button--primary" type="button" disabled={isCompleting} onClick={approveAndComplete}>
                  {isCompleting ? translate("checklists.approvingAndCompleting") : translate("checklists.approveAndComplete")}
                </button>
              </div>
            </div>
          )}
          {hasCompletionError && <p className="form-error" role="alert">{translate("checklists.approveAndCompleteError")}</p>}
          </section>
        )}
      </div>

      <details className="checklist-run__technical-details">
        <summary>{translate("checklists.technicalDetails")}</summary>
        <dl className="detail-list checklist-run__details">
          <DetailItem label={translate("checklists.runId")} value={checklistRun.id} />
          <DetailItem label={translate("checklists.jobId")} value={checklistRun.jobId || job.id} />
          <DetailItem
            label={translate("checklists.definitionVersion")}
            value={`v${checklistRun.definitionVersion || "?"}`}
          />
          <DetailItem
            label={translate("checklists.propertyId")}
            value={checklistRun.property?.id || translate("common.notProvided")}
          />
          {createdAt && (
            <DetailItem label={translate("checklists.createdAt")} value={createdAt} />
          )}
          {draft && <DetailItem label={translate("checklists.draftRevision")} value={draft.revision || 0} />}
        </dl>
      </details>
      <ScrollToTopButton />
    </section>
  );
}

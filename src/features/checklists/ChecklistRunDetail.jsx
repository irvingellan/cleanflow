import { useEffect, useState } from "react";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { BackButton, DetailItem, StateCard } from "../../components/UiPrimitives.jsx";
import { formatDate } from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";
import { getChecklistEvidence } from "./checklistRunService.js";
import { ClientReportControls } from "./ClientReportControls.jsx";

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
  const restockItems = inventoryItems.filter((item) => item.answer === "NEEDS_RESTOCK");

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

function ChecklistEvidencePhoto({ jobId, evidence, translate, loadEvidence }) {
  const [url, setUrl] = useState(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = null;
    setUrl(null);
    setHasError(false);
    loadEvidence(jobId, evidence.requirementId)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setHasError(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidence.requirementId, jobId, loadEvidence]);

  if (hasError) return <p className="checklist-run__evidence-error">{translate("checklists.photoUnavailable")}</p>;
  if (!url) return <p className="checklist-run__evidence-loading">{translate("checklists.photoLoading")}</p>;
  return <img className="checklist-run__evidence-photo" src={url} alt={translate("checklists.savedPhoto")} />;
}

/** Displays the server-projected manager summary, never a raw Property or Run. */
export function ChecklistRunDetail({
  job, checklistRun, isRefreshing = false, hasRefreshError = false, onRefresh, onBack,
  loadEvidence = getChecklistEvidence, assignments = [], onApproveAndComplete,
}) {
  const { language, translate } = useTranslation();
  const createdAt = formatRunCreatedAt(checklistRun.createdAt, language);
  const requiredPhotoTypes = checklistRun.requiredPhotoTypes || [];
  const requiredPhotoCount = Number.isInteger(checklistRun.requiredPhotoCount)
    ? checklistRun.requiredPhotoCount
    : requiredPhotoTypes.length;
  const draft = checklistRun.draft;
  const lastSavedAt = formatRunCreatedAt(draft?.lastSavedAt, language);
  const readyForReviewAt = formatRunCreatedAt(checklistRun.readyForReviewAt, language);
  const isReadyForReview = checklistRun.status === "READY_FOR_REVIEW";
  const canApproveAndComplete = isReadyForReview
    && job.operationalStatus !== "COMPLETED"
    && typeof onApproveAndComplete === "function";
  const [isCompletionConfirmationVisible, setIsCompletionConfirmationVisible] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [hasCompletionError, setHasCompletionError] = useState(false);
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
        message={translate(isReadyForReview ? "checklists.readyForReviewDescription" : "checklists.draftDescription")}
        status="status"
      />

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
          value={translate(isReadyForReview ? "checklists.readyForReview" : "checklists.draft")}
        />
        {readyForReviewAt && <DetailItem label={translate("checklists.sentForReviewAt")} value={readyForReviewAt} />}
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
        ) : (
          <p className="checklist-run__draft-action-note">{translate("checklists.draftActionsUnavailable")}</p>
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
            {section.items?.map((item) => (
              <li key={item.id}>
                <span>{checklistLabel(item, translate)}</span>
                <strong>{translate(`checklists.answer${item.answer || "UNANSWERED"}`)}</strong>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {checklistRun.inventoryItems?.length > 0 && (
        <section className="checklist-run__section" aria-labelledby="checklist-saved-inventory-title">
          <h3 id="checklist-saved-inventory-title">{translate("checklists.inventoryCount")}</h3>
          <ul className="checklist-run__answers">
            {checklistRun.inventoryItems.map((item) => (
              <li key={item.id}>
                <span>{checklistLabel(item, translate)}</span>
                <strong>{translate(`checklists.inventory${item.answer || "UNANSWERED"}`)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {evidence.length > 0 && (
        <section className="checklist-run__section" aria-labelledby="checklist-evidence-title">
          <h3 id="checklist-evidence-title">{translate("checklists.savedEvidence")}</h3>
          {evidence.map((item) => (
            <div className="checklist-run__evidence" key={item.requirementId}>
              <p>{translate("checklists.photoForRequirement", {
                requirement: item.requirementId === "living-belongings"
                  ? translate("checklistPreview.livingBelongings")
                  : item.requirementId,
              })}</p>
              <ChecklistEvidencePhoto jobId={job.id} evidence={item} translate={translate} loadEvidence={loadEvidence} />
            </div>
          ))}
        </section>
      )}

      <div id="checklist-manager-actions">
        {isReadyForReview && <ClientReportControls jobId={job.id} />}

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

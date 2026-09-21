import { BackButton, DetailItem, StateCard } from "../../components/UiPrimitives.jsx";
import { formatDate } from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";

function formatRunCreatedAt(value, language) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(
    { en: "en-US", pt: "pt-BR", es: "es-ES" }[language] || "en-US",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(date);
}

/** Displays the server-projected manager summary, never a raw Property or Run. */
export function ChecklistRunDetail({ job, checklistRun, isRefreshing = false, hasRefreshError = false, onRefresh, onBack }) {
  const { language, translate } = useTranslation();
  const createdAt = formatRunCreatedAt(checklistRun.createdAt, language);
  const requiredPhotoTypes = checklistRun.requiredPhotoTypes || [];
  const draft = checklistRun.draft;
  const lastSavedAt = formatRunCreatedAt(draft?.lastSavedAt, language);

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
        message={translate("checklists.draftDescription")}
        status="status"
      />

      <dl className="detail-list checklist-run__details">
        <DetailItem
          label={translate("common.property")}
          value={checklistRun.property?.name || job.propertyName || translate("properties.unnamed")}
        />
        <DetailItem
          label={translate("jobs.scheduledDate")}
          value={formatDate(job.scheduledDate, translate, language)}
        />
        <DetailItem
          label={translate("checklists.runState")}
          value={translate("checklists.draft")}
        />
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
            count: requiredPhotoTypes.length,
          })}
        />
      </dl>

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
            <DetailItem label={translate("checklists.draftRevision")} value={draft.revision || 0} />
            {lastSavedAt && <DetailItem label={translate("checklists.lastSavedAt")} value={lastSavedAt} />}
          </dl>
          {(draft.issueNotes || draft.generalNotes) && (
            <div className="checklist-run__draft-notes">
              {draft.issueNotes && <p><strong>{translate("checklists.issueNotes")}:</strong> {draft.issueNotes}</p>}
              {draft.generalNotes && <p><strong>{translate("checklists.generalNotes")}:</strong> {draft.generalNotes}</p>}
            </div>
          )}
        </section>
      )}

      <section className="checklist-run__section" aria-labelledby="checklist-context-title">
        <h3 id="checklist-context-title">{translate("checklists.context")}</h3>
        <dl className="detail-list checklist-run__details">
          <DetailItem label={translate("checklists.runId")} value={checklistRun.id} />
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
        </dl>
      </section>
    </section>
  );
}

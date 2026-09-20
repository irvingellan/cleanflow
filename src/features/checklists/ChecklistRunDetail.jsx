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
export function ChecklistRunDetail({ job, checklistRun, onBack }) {
  const { language, translate } = useTranslation();
  const createdAt = formatRunCreatedAt(checklistRun.createdAt, language);
  const requiredPhotoTypes = checklistRun.requiredPhotoTypes || [];

  return (
    <section className="panel checklist-run" aria-labelledby="checklist-run-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("checklists.managerEyebrow")}</p>
      <h2 id="checklist-run-title" className="panel__title">
        {translate("checklists.runTitle")}
      </h2>

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

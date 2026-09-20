import { useEffect, useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { getPublicChecklist } from "./checklistCapabilityService.js";

const errorKeys = {
  checklist_not_found: "checklists.publicUnavailable",
  checklist_unavailable: "checklists.publicUnavailable",
};

/** Read-only by design: possession can open this frozen checklist, not submit it. */
export function PublicChecklistPage({ token }) {
  const { translate } = useTranslation();
  const [checklist, setChecklist] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setIsLoading(true); setError(null);
      try {
        const result = await getPublicChecklist(token);
        if (active) setChecklist(result);
      } catch (loadError) {
        if (active) setError(loadError.code || "checklist_unavailable");
      } finally { if (active) setIsLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [token]);

  return <main className="public-offer-page checklist-public-page">
    <section className="panel">
      {isLoading && <StateCard message={translate("checklists.publicLoading")} status="status" />}
      {!isLoading && error && <StateCard message={translate(errorKeys[error] || "checklists.publicUnavailable")} status="alert" isError />}
      {!isLoading && checklist && <>
        <p className="eyebrow">CleanFlow</p>
        <h1 className="panel__title">{translate("checklists.publicTitle")}</h1>
        {checklist.propertyName && <p>{checklist.propertyName}</p>}
        {checklist.scheduledDate && <p>{checklist.scheduledDate}{checklist.scheduledStart ? ` · ${checklist.scheduledStart}` : ""}</p>}
        <p className="job-checklist__summary">{translate("checklists.publicReadOnly")}</p>
        {checklist.sections.map((section) => <section key={section.id} className="checklist-run__section">
          <h2>{section.title || section.label || translate(section.titleKey || section.id)}</h2>
          <ul className="checklist-run__list">{section.items.map((item) => <li key={item.id}>{item.label || translate(item.labelKey || item.id)}</li>)}</ul>
        </section>)}
        {checklist.inventoryItems?.length > 0 && <section className="checklist-run__section"><h2>{translate("checklists.inventoryCount")}</h2><ul className="checklist-run__list">{checklist.inventoryItems.map((item) => <li key={item.id}>{item.label || translate(item.labelKey || item.id)}</li>)}</ul></section>}
        {checklist.requiredPhotoTypes?.length > 0 && <section className="checklist-run__section"><h2>{translate("checklists.requiredPhotos")}</h2><ul className="checklist-run__list">{checklist.requiredPhotoTypes.map((item) => <li key={item.id}>{item.label || translate(item.labelKey || item.id)}</li>)}</ul></section>}
        {checklist.cleanerInstructions && <section className="checklist-run__section"><h2>{translate("checklists.cleanerInstructions")}</h2><p>{checklist.cleanerInstructions}</p></section>}
      </>}
    </section>
  </main>;
}

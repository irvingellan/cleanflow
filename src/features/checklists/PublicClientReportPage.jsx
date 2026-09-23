import { useEffect, useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { languageOptions, useTranslation } from "../../i18n/translations.js";
import { formatDate } from "../../lib/presentation.js";
import { getPublicClientReport, publicClientReportPhotoUrl } from "./clientReportService.js";

function textFor(entry, translate) {
  return entry?.label || translate(entry?.labelKey || "clientReport.checklistItem");
}

function PublicReportPhoto({ token, translate }) {
  const [hasError, setHasError] = useState(false);
  if (hasError) return <p className="client-report__photo-error">{translate("clientReport.photoUnavailable")}</p>;
  return (
    <img
      className="client-report__photo"
      src={publicClientReportPhotoUrl(token)}
      alt={translate("clientReport.savedEvidence")}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
    />
  );
}

/** Public, read-only report projection. All content is fetched from the server's frozen Run data. */
export function PublicClientReportPage({ token }) {
  const { language, setLanguage, translate } = useTranslation();
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let current = true;
    setIsLoading(true);
    setHasError(false);
    setReport(null);
    getPublicClientReport(token).then((result) => {
      if (current) setReport(result);
    }).catch(() => {
      if (current) setHasError(true);
    }).finally(() => {
      if (current) setIsLoading(false);
    });
    return () => { current = false; };
  }, [token]);

  if (isLoading) {
    return <main className="public-offer-page checklist-public-page"><section className="panel"><StateCard message={translate("clientReport.loading")} status="status" /></section></main>;
  }
  if (hasError || !report) {
    return <main className="public-offer-page checklist-public-page"><section className="panel"><StateCard message={translate("clientReport.unavailable")} status="alert" isError /></section></main>;
  }

  return (
    <main className="public-offer-page checklist-public-page client-report-page">
      <article className="panel public-checklist client-report" aria-labelledby="client-report-title">
        <header className="public-checklist__header">
          <div>
            <p className="eyebrow">CleanFlow</p>
            <h1 id="client-report-title" className="panel__title">{translate(report.titleKey || "clientReport.title")}</h1>
            {report.propertyName && <p className="public-checklist__context">{report.propertyName}</p>}
            {report.serviceDate && <p className="public-checklist__context">{formatDate(report.serviceDate, translate, language)}</p>}
          </div>
          <label className="public-checklist__language">
            <span>{translate("common.language")}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
          </label>
        </header>

        {report.sections?.map((section, sectionIndex) => (
          <section className="client-report__section" key={textFor(section, translate) + sectionIndex}>
            <h2>{section.title || translate(section.titleKey || "clientReport.checklistSection")}</h2>
            <ul>
              {section.items?.map((item, itemIndex) => (
                <li key={textFor(item, translate) + itemIndex}>
                  <span>{textFor(item, translate)}</span>
                  <strong>{translate("checklists.answer" + item.answer)}</strong>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {report.inventoryItems?.length > 0 && (
          <section className="client-report__section">
            <h2>{translate("clientReport.inventory")}</h2>
            <ul>
              {report.inventoryItems.map((item, index) => (
                <li key={textFor(item, translate) + index}>
                  <span>{textFor(item, translate)}</span>
                  <strong>{translate("checklists.inventory" + item.answer)}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(report.issueNotes || report.generalNotes) && (
          <section className="client-report__section">
            <h2>{translate("clientReport.notes")}</h2>
            {report.issueNotes && <p><strong>{translate("checklists.issueNotes")}:</strong> {report.issueNotes}</p>}
            {report.generalNotes && <p><strong>{translate("checklists.generalNotes")}:</strong> {report.generalNotes}</p>}
          </section>
        )}

        {report.hasPhoto && (
          <section className="client-report__section">
            <h2>{translate("clientReport.evidence")}</h2>
            <PublicReportPhoto token={token} translate={translate} />
          </section>
        )}
      </article>
    </main>
  );
}

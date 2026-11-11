import { useCallback, useEffect, useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { languageOptions, useTranslation } from "../../i18n/translations.js";
import { formatDate } from "../../lib/presentation.js";
import { PublicClientReportPage } from "../checklists/PublicClientReportPage.jsx";
import { getPublicClientPortal, getPublicClientPortalReport, publicClientPortalPhotoUrl } from "./clientPortalService.js";
import "./clientPortal.css";

function Visit({ visit, language, translate, children }) {
  return (
    <li className="client-portal__row">
      <div>
        <strong>{formatDate(visit.date, translate, language)}{visit.start ? ` · ${visit.start}` : ""}</strong>
        <span>{visit.propertyName}</span>
      </div>
      {children}
    </li>
  );
}

/**
 * A property owner's private page: their properties, the coming cleanings and
 * the reports the manager released. Read-only; everything comes from the server.
 */
export function PublicClientPortalPage({ token }) {
  const { language, setLanguage, translate } = useTranslation();
  const [portal, setPortal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKind, setErrorKind] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [openJobId, setOpenJobId] = useState(null);
  const loadReport = useCallback((portalToken) => getPublicClientPortalReport(portalToken, openJobId), [openJobId]);
  const photoUrl = useCallback((portalToken, evidenceId, options) => publicClientPortalPhotoUrl(portalToken, openJobId, evidenceId, options), [openJobId]);
  const closeReport = useCallback(() => setOpenJobId(null), []);

  useEffect(() => {
    let current = true;
    setIsLoading(true);
    setErrorKind(null);
    getPublicClientPortal(token).then((result) => {
      if (current) setPortal(result);
    }).catch((error) => {
      if (current) setErrorKind(error?.retryable === false ? "permanent" : "retryable");
    }).finally(() => {
      if (current) setIsLoading(false);
    });
    return () => { current = false; };
  }, [token, attempt]);

  if (openJobId) return <PublicClientReportPage token={token} loadReport={loadReport} photoUrl={photoUrl} onBack={closeReport} />;

  if (isLoading) {
    return <main className="public-offer-page checklist-public-page"><section className="panel"><StateCard message={translate("clientPortal.loading")} status="status" /></section></main>;
  }
  if (errorKind || !portal) {
    const retryable = errorKind !== "permanent";
    return (
      <main className="public-offer-page checklist-public-page">
        <section className="panel">
          <StateCard message={translate(retryable ? "clientPortal.loadRetryable" : "clientPortal.unavailable")} status="alert" isError />
          {retryable && (
            <button className="button button--primary" type="button" onClick={() => setAttempt((value) => value + 1)}>
              {translate("clientReport.retry")}
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="public-offer-page checklist-public-page client-report-page">
      <article className="panel public-checklist client-portal" aria-labelledby="client-portal-title">
        <header className="public-checklist__header">
          <div>
            <p className="client-report__badge">{translate("clientPortal.badge")}</p>
            <h1 id="client-portal-title" className="panel__title">{portal.clientName || translate("clientPortal.title")}</h1>
            <p className="public-checklist__context">{translate("clientPortal.intro")}</p>
          </div>
          <label className="public-checklist__language">
            <span>{translate("common.language")}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
          </label>
        </header>

        <section className="client-portal__section" aria-labelledby="client-portal-coming">
          <h2 id="client-portal-coming">{translate("clientPortal.comingTitle")}</h2>
          {portal.coming.length === 0 ? <p className="client-portal__empty">{translate("clientPortal.comingEmpty")}</p> : (
            <ul className="client-portal__list">
              {portal.coming.map((visit, index) => <Visit key={`${visit.propertyId}-${visit.date}-${index}`} visit={visit} language={language} translate={translate} />)}
            </ul>
          )}
        </section>

        <section className="client-portal__section" aria-labelledby="client-portal-reports">
          <h2 id="client-portal-reports">{translate("clientPortal.reportsTitle")}</h2>
          {portal.reports.length === 0 ? <p className="client-portal__empty">{translate("clientPortal.reportsEmpty")}</p> : (
            <ul className="client-portal__list">
              {portal.reports.map((report) => (
                <Visit key={report.jobId} visit={report} language={language} translate={translate}>
                  <button className="button button--secondary" type="button" onClick={() => setOpenJobId(report.jobId)}
                    aria-label={translate("clientPortal.openReportFor", { property: report.propertyName, date: formatDate(report.date, translate, language) })}>
                    {translate("clientPortal.openReport")}
                  </button>
                </Visit>
              ))}
            </ul>
          )}
        </section>

        {portal.properties.length > 0 && (
          <section className="client-portal__section" aria-labelledby="client-portal-properties">
            <h2 id="client-portal-properties">{translate("clientPortal.propertiesTitle")}</h2>
            <ul className="client-portal__properties">
              {portal.properties.map((property) => <li key={property.id}>{property.name}</li>)}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}

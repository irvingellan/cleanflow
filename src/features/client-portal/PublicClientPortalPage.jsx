import { useCallback, useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { languageOptions, useTranslation } from "../../i18n/translations.js";
import { formatDate } from "../../lib/presentation.js";
import { ClientReportView } from "../checklists/PublicClientReportPage.jsx";
import { getPublicClientPortal, getPublicClientPortalReport, publicClientPortalPhotoUrl } from "./clientPortalService.js";
import { usePortalRead } from "./usePortalRead.js";
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

function PortalReport({ token, jobId, onBack }) {
  const read = useCallback((signal) => getPublicClientPortalReport(token, jobId, { signal }), [token, jobId]);
  const photoUrl = useCallback((portalToken, evidenceId, options) => publicClientPortalPhotoUrl(portalToken, jobId, evidenceId, options), [jobId]);
  const { data: report, isLoading, errorKind, retry } = usePortalRead(read);
  return <ClientReportView token={token} report={report} photoUrl={photoUrl} onBack={onBack}
    isLoading={isLoading} errorKind={errorKind} onRetry={retry} />;
}

/** A portal link owns a separate read-only view for each token. */
export function PublicClientPortalPage({ token }) {
  return <PortalPage key={token} token={token} />;
}

function PortalPage({ token }) {
  const { language, setLanguage, translate } = useTranslation();
  const [openJobId, setOpenJobId] = useState(null);
  const read = useCallback((signal) => getPublicClientPortal(token, { signal }), [token]);
  const { data: portal, isLoading, errorKind, retry } = usePortalRead(read);
  const closeReport = useCallback(() => setOpenJobId(null), []);

  // The list is capped; its omission of a Job does not settle direct report access.
  // A permanent error on the portal link takes priority over the report's state.
  if (openJobId && portal) return <PortalReport key={openJobId} token={token} jobId={openJobId} onBack={closeReport} />;

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
            <button className="button button--primary" type="button" onClick={retry}>
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

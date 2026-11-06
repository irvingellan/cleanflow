import { useCallback, useEffect, useState } from "react";
import { PhotoLightbox } from "../../components/PhotoLightbox.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { languageOptions, useTranslation } from "../../i18n/translations.js";
import { formatDate } from "../../lib/presentation.js";
import { getPublicClientReport, publicClientReportPhotoUrl } from "./clientReportService.js";

function textFor(entry, translate) {
  return entry?.label || translate(entry?.labelKey || "clientReport.checklistItem");
}

const restockAnswers = new Set(["NEEDS_RESTOCK", "LOW"]);

function ReportPhoto({ token, translate, evidenceId, className = "client-report__photo", loading = "lazy" }) {
  const [hasError, setHasError] = useState(false);
  if (hasError) return <p className="client-report__photo-error">{translate("clientReport.photoUnavailable")}</p>;
  return (
    <img
      className={className}
      src={publicClientReportPhotoUrl(token, evidenceId)}
      loading={loading}
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
  const [errorKind, setErrorKind] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);
  const closeViewer = useCallback(() => setViewerIndex(null), []);
  const evidenceIds = report?.evidence?.map((item) => item.evidenceId) || [undefined];
  const photoSrc = useCallback((index) => publicClientReportPhotoUrl(token, evidenceIds[index]), [token, evidenceIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let current = true;
    setIsLoading(true);
    setErrorKind(null);
    setReport(null);
    getPublicClientReport(token).then((result) => {
      if (current) setReport(result);
    }).catch((error) => {
      if (current) setErrorKind(error?.retryable === false ? "permanent" : "retryable");
    }).finally(() => {
      if (current) setIsLoading(false);
    });
    return () => { current = false; };
  }, [token, attempt]);

  if (isLoading) {
    return <main className="public-offer-page checklist-public-page"><section className="panel"><StateCard message={translate("clientReport.loading")} status="status" /></section></main>;
  }
  if (errorKind || !report) {
    const retryable = errorKind !== "permanent";
    return (
      <main className="public-offer-page checklist-public-page">
        <section className="panel">
          <StateCard
            message={translate(retryable ? "clientReport.loadRetryable" : "clientReport.unavailable")}
            status="alert"
            isError
          />
          {retryable && (
            <button className="button button--primary" type="button" onClick={() => setAttempt((value) => value + 1)}>
              {translate("clientReport.retry")}
            </button>
          )}
        </section>
      </main>
    );
  }

  const photos = report.evidence?.length > 0 ? report.evidence : report.hasPhoto ? [{ evidenceId: undefined }] : [];
  const summary = report.summary;
  const restock = (report.inventoryItems || []).filter((item) => restockAnswers.has(item.answer));

  return (
    <main className="public-offer-page checklist-public-page client-report-page">
      <article className="panel public-checklist client-report" aria-labelledby="client-report-title">
        <header className="public-checklist__header client-report__header">
          <div>
            <p className="client-report__badge">{translate("clientReport.completedBadge")}</p>
            <h1 id="client-report-title" className="panel__title">{translate(report.titleKey || "clientReport.title")}</h1>
            {report.propertyName && <p className="client-report__property">{report.propertyName}</p>}
            {report.serviceDate && <p className="public-checklist__context">{formatDate(report.serviceDate, translate, language)}</p>}
          </div>
          <div className="client-report__header-actions">
            <label className="public-checklist__language">
              <span>{translate("common.language")}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </label>
            <button className="button client-report__print" type="button" onClick={() => window.print()}>
              {translate("clientReport.print")}
            </button>
          </div>
        </header>

        {summary && (
          <dl className="client-report__summary" aria-label={translate("clientReport.summaryLabel")}>
            <div>
              <dt>{translate("clientReport.summaryTasks")}</dt>
              <dd>{translate("clientReport.summaryTasksValue", { done: summary.tasksDone, total: summary.tasksTotal - summary.tasksNotApplicable })}</dd>
            </div>
            <div>
              <dt>{translate("clientReport.summaryPhotos")}</dt>
              <dd>{summary.photoCount}</dd>
            </div>
            <div className={summary.restockCount > 0 ? "is-attention" : ""}>
              <dt>{translate("clientReport.summaryRestock")}</dt>
              <dd>{summary.restockCount}</dd>
            </div>
          </dl>
        )}

        {report.managerNote && (
          <section className="client-report__note" aria-labelledby="client-report-note-title">
            <h2 id="client-report-note-title">{translate("clientReport.managerNoteTitle")}</h2>
            <p>{report.managerNote}</p>
          </section>
        )}

        {(report.issueNotes || restock.length > 0) && (
          <section className="client-report__section client-report__attention">
            <h2>{translate("clientReport.attentionTitle")}</h2>
            {report.issueNotes && <p>{report.issueNotes}</p>}
            {restock.length > 0 && (
              <>
                <h3>{translate("clientReport.restockTitle")}</h3>
                <ul>
                  {restock.map((item, index) => (
                    <li key={textFor(item, translate) + index}>
                      <span>{textFor(item, translate)}</span>
                      <strong>{translate("checklists.inventory" + item.answer)}</strong>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {photos.length > 0 && (
          <section className="client-report__section">
            <h2>{translate("clientReport.photosTitle", { count: photos.length })}</h2>
            <ul className="client-report__gallery">
              {photos.map((item, index) => (
                <li key={item.evidenceId || "single"}>
                  <button type="button" className="client-report__thumb" onClick={() => setViewerIndex(index)}
                    aria-label={translate("clientReport.openPhoto", { index: index + 1 })}>
                    <ReportPhoto token={token} translate={translate} evidenceId={item.evidenceId} className="client-report__thumb-image" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {report.generalNotes && (
          <section className="client-report__section">
            <h2>{translate("clientReport.notes")}</h2>
            <p>{report.generalNotes}</p>
          </section>
        )}

        {(report.sections?.length > 0 || report.inventoryItems?.length > 0) && (
          <section className="client-report__section">
            <div className="client-report__tasks-header">
              <h2>{translate("clientReport.allTasksTitle")}</h2>
              <button className="button button--text client-report__toggle" type="button" aria-expanded={showAllTasks}
                onClick={() => setShowAllTasks((value) => !value)}>
                {translate(showAllTasks ? "clientReport.hideTasks" : "clientReport.showTasks")}
              </button>
            </div>
            {/* Collapsed on screen; the print style shows every task. */}
            <div className="client-report__tasks" hidden={!showAllTasks}>
              {report.sections?.map((section, sectionIndex) => (
                <div className="client-report__task-group" key={textFor(section, translate) + sectionIndex}>
                  <h3>{section.title || translate(section.titleKey || "clientReport.checklistSection")}</h3>
                  <ul>
                    {section.items?.map((item, itemIndex) => (
                      <li key={textFor(item, translate) + itemIndex}>
                        <span>{textFor(item, translate)}</span>
                        <strong>{translate("checklists.answer" + item.answer)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {report.inventoryItems?.length > 0 && (
                <div className="client-report__task-group">
                  <h3>{translate("clientReport.inventory")}</h3>
                  <ul>
                    {report.inventoryItems.map((item, index) => (
                      <li key={textFor(item, translate) + index}>
                        <span>{textFor(item, translate)}</span>
                        <strong>{translate("checklists.inventory" + item.answer)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}
      </article>
      {viewerIndex !== null && photos[viewerIndex] && (
        <PhotoLightbox count={photos.length} index={viewerIndex} getSrc={photoSrc} onIndexChange={setViewerIndex}
          onClose={closeViewer} translate={translate} alt={translate("clientReport.savedEvidence")} />
      )}
    </main>
  );
}

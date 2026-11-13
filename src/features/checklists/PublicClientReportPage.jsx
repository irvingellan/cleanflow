import { useCallback, useEffect, useMemo, useState } from "react";
import { PhotoLightbox } from "../../components/PhotoLightbox.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { languageOptions, useTranslation } from "../../i18n/translations.js";
import { formatDate } from "../../lib/presentation.js";
import { getPublicClientReport, publicClientReportPhotoUrl } from "./clientReportService.js";

function textFor(entry, translate) {
  return entry?.label || translate(entry?.labelKey || "clientReport.checklistItem");
}

const restockAnswers = new Set(["NEEDS_RESTOCK", "LOW"]);

function ReportPhoto({ token, translate, evidenceId, photoUrl, className = "client-report__photo", loading = "lazy", thumbnail = false }) {
  const [hasError, setHasError] = useState(false);
  if (hasError) return <p className="client-report__photo-error">{translate("clientReport.photoUnavailable")}</p>;
  return (
    <img
      className={className}
      src={photoUrl(token, evidenceId, { thumbnail })}
      loading={loading}
      decoding="async"
      alt={translate("clientReport.savedEvidence")}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
    />
  );
}

/** Public, read-only report opened through its independent link. */
export function PublicClientReportPage({ token }) {
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKind, setErrorKind] = useState(null);
  const [attempt, setAttempt] = useState(0);

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

  return <ClientReportView token={token} report={report} isLoading={isLoading} errorKind={errorKind}
    onRetry={() => setAttempt((value) => value + 1)} photoUrl={publicClientReportPhotoUrl} />;
}

/** The standalone link and portal reuse the same read-only report presentation. */
export function ClientReportView({ token, report, isLoading, errorKind, onRetry, photoUrl, onBack = null }) {
  const { language, setLanguage, translate } = useTranslation();
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [viewerEvidenceId, setViewerEvidenceId] = useState(null);
  const photos = useMemo(() => report?.evidence?.length > 0
    ? report.evidence : report?.hasPhoto ? [{ evidenceId: undefined }] : [], [report]);
  const evidenceKey = JSON.stringify(photos.map((photo) => photo.evidenceId ?? ""));
  const evidenceIds = useMemo(() => JSON.parse(evidenceKey), [evidenceKey]);
  const viewerIndex = evidenceIds.indexOf(viewerEvidenceId);
  const closeViewer = useCallback(() => setViewerEvidenceId(null), []);
  const photoSrc = useCallback((index) => photoUrl(token, evidenceIds[index] || undefined), [token, photoUrl, evidenceIds]);
  const photoPlaceholder = useCallback((index) => photoUrl(token, evidenceIds[index] || undefined, { thumbnail: true }), [token, photoUrl, evidenceIds]);
  const openViewer = useCallback((index) => setViewerEvidenceId(evidenceIds[index]), [evidenceIds]);

  useEffect(() => {
    if (viewerIndex < 0) closeViewer();
  }, [viewerIndex, closeViewer]);

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
            <button className="button button--primary" type="button" onClick={onRetry}>
              {translate("clientReport.retry")}
            </button>
          )}
          {onBack && <button className="button button--secondary" type="button" onClick={onBack}>{translate("clientPortal.backToList")}</button>}
        </section>
      </main>
    );
  }

  const summary = report.summary;
  // A summary number takes the reader to the part of the report it counts.
  const jump = (id, value, available, openTasks = false) => available
    ? <button type="button" className="client-report__summary-link" onClick={() => {
      if (openTasks) setShowAllTasks(true);
      requestAnimationFrame(() => { const target = document.getElementById(id); target?.scrollIntoView?.({ behavior: "smooth", block: "start" }); target?.focus?.({ preventScroll: true }); });
    }}>{value}</button>
    : value;
  const restock = (report.inventoryItems || []).filter((item) => restockAnswers.has(item.answer));

  return (
    <main className="public-offer-page checklist-public-page client-report-page">
      <article className="panel public-checklist client-report" aria-labelledby="client-report-title">
        <header className="public-checklist__header client-report__header">
          <div>
            {onBack && <button className="button button--text client-report__back" type="button" onClick={onBack}>‹ {translate("clientPortal.backToList")}</button>}
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
              <dd>{jump("client-report-tasks", translate("clientReport.summaryTasksValue", { done: summary.tasksDone, total: summary.tasksTotal - summary.tasksNotApplicable }), report.sections?.length > 0 || report.inventoryItems?.length > 0, true)}</dd>
            </div>
            <div>
              <dt>{translate("clientReport.summaryPhotos")}</dt>
              <dd>{jump("client-report-photos", summary.photoCount, photos.length > 0)}</dd>
            </div>
            <div className={summary.restockCount > 0 ? "is-attention" : ""}>
              <dt>{translate("clientReport.summaryRestock")}</dt>
              <dd>{jump("client-report-attention", summary.restockCount, restock.length > 0)}</dd>
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
          <section className="client-report__section client-report__attention" id="client-report-attention" tabIndex={-1}>
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
          <section className="client-report__section" id="client-report-photos" tabIndex={-1}>
            <h2>{translate("clientReport.photosTitle", { count: photos.length })}</h2>
            <ul className="client-report__gallery">
              {photos.map((item, index) => (
                <li key={item.evidenceId || "single"}>
                  <button type="button" className="client-report__thumb" onClick={() => openViewer(index)}
                    aria-label={translate("clientReport.openPhoto", { index: index + 1 })}>
                    <ReportPhoto token={token} translate={translate} evidenceId={item.evidenceId} photoUrl={photoUrl} className="client-report__thumb-image" thumbnail />
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
          <section className="client-report__section" id="client-report-tasks" tabIndex={-1}>
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
      {viewerIndex >= 0 && (
        <PhotoLightbox count={photos.length} index={viewerIndex} getSrc={photoSrc} getPlaceholderSrc={photoPlaceholder} onIndexChange={openViewer}
          onClose={closeViewer} translate={translate} alt={translate("clientReport.savedEvidence")} />
      )}
    </main>
  );
}

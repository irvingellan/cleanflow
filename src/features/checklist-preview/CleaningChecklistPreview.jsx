import { useState } from "react";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { formatDate } from "../../lib/presentation.js";
import { languageOptions, useTranslation } from "../../i18n/translations.js";
import {
  checklistSections,
  createInitialChecklistState,
  createInitialInventoryState,
  demoCleaningDetails,
  inventoryItems,
  photoPlaceholderGroups,
  summarizeChecklist,
} from "./checklistPreviewData.js";

const inventoryLevels = ["LOW", "MEDIUM", "HIGH", "NEEDS_RESTOCK"];

export function CleaningChecklistPreview() {
  const { language, setLanguage, translate } = useTranslation();
  const [details, setDetails] = useState(demoCleaningDetails);
  const [checklistState, setChecklistState] = useState(createInitialChecklistState);
  const [inventoryState, setInventoryState] = useState(createInitialInventoryState);
  const [photoCounts, setPhotoCounts] = useState({ cleaning: 0, damage: 0 });
  const [issueNotes, setIssueNotes] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [report, setReport] = useState(null);

  function updateChecklistItem(itemId, change) {
    setChecklistState((currentState) => ({
      ...currentState,
      [itemId]: {
        ...currentState[itemId],
        ...change,
      },
    }));
  }

  function submitPreview(event) {
    event.preventDefault();
    setReport({
      details,
      summary: summarizeChecklist(checklistState, inventoryState),
      issueNotes: issueNotes.trim(),
      generalNotes: generalNotes.trim(),
      photoCounts,
      submittedAt: new Date(),
    });
  }

  if (report) {
    return (
      <ClientReportPreview
        report={report}
        language={language}
        translate={translate}
        onEdit={() => setReport(null)}
      />
    );
  }

  return (
    <main className="app-shell checklist-preview-shell">
      <section className="foundation checklist-preview-foundation" aria-labelledby="checklist-preview-title">
        <header className="checklist-preview-header">
          <div>
            <p className="eyebrow">{translate("checklistPreview.eyebrow")}</p>
            <h1 id="checklist-preview-title">CleanFlow</h1>
          </div>
          <div className="checklist-preview-header__actions">
            <span className="badge">{translate("checklistPreview.preview")}</span>
            <select
              className="language-selector"
              aria-label={translate("common.language")}
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {languageOptions.map((option) => (
                <option key={option.code} value={option.code}>{option.label}</option>
              ))}
            </select>
          </div>
        </header>

        <form className="checklist-preview" onSubmit={submitPreview}>
          <section className="panel checklist-preview__intro">
            <p className="eyebrow">{translate("checklistPreview.cleanerWorkflow")}</p>
            <h2>{translate("checklistPreview.title")}</h2>
            <p>{translate("checklistPreview.demoOnly")}</p>
          </section>

          <section className="panel checklist-preview__section" aria-labelledby="checklist-details-title">
            <h2 id="checklist-details-title">{translate("checklistPreview.cleaningDetails")}</h2>
            <div className="checklist-preview__details">
              <label>
                {translate("checklistPreview.cleanerName")}
                <input
                  value={details.cleaner}
                  onChange={(event) => setDetails((current) => ({ ...current, cleaner: event.target.value }))}
                />
              </label>
              <label>
                {translate("checklistPreview.propertyListing")}
                <input
                  value={details.property}
                  onChange={(event) => setDetails((current) => ({ ...current, property: event.target.value }))}
                />
              </label>
              <label>
                {translate("checklistPreview.dateCleaned")}
                <input
                  type="date"
                  value={details.date}
                  onChange={(event) => setDetails((current) => ({ ...current, date: event.target.value }))}
                />
              </label>
            </div>
          </section>

          {checklistSections.map((section) => (
            <section className="panel checklist-preview__section" key={section.id} aria-labelledby={`${section.id}-title`}>
              <h2 id={`${section.id}-title`}>{translate(section.titleKey)}</h2>
              <div className="checklist-preview__items">
                {section.items.map((item) => {
                  const itemState = checklistState[item.id];
                  return (
                    <div className="checklist-preview__item" key={item.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={itemState.completed}
                          onChange={(event) => updateChecklistItem(item.id, {
                            completed: event.target.checked,
                            notApplicable: event.target.checked ? false : itemState.notApplicable,
                          })}
                        />
                        <span>{translate(item.labelKey)}</span>
                      </label>
                      {(item.requiresPhoto || item.canBeNotApplicable) && (
                        <div className="checklist-preview__item-actions">
                          {item.requiresPhoto && (
                            <span className="checklist-preview__photo-required">
                              {translate("checklistPreview.photoRequired")}
                            </span>
                          )}
                          {item.canBeNotApplicable && (
                            <button
                              className={`checklist-preview__na${itemState.notApplicable ? " checklist-preview__na--active" : ""}`}
                              type="button"
                              aria-pressed={itemState.notApplicable}
                              aria-label={translate("checklistPreview.markNotApplicable", {
                                item: translate(item.labelKey),
                              })}
                              onClick={() => updateChecklistItem(item.id, {
                                completed: false,
                                notApplicable: !itemState.notApplicable,
                              })}
                            >
                              {translate("checklistPreview.notApplicable")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="panel checklist-preview__section" aria-labelledby="inventory-title">
            <h2 id="inventory-title">{translate("checklistPreview.inventory")}</h2>
            <div className="checklist-preview__inventory">
              {inventoryItems.map((item) => (
                <label key={item.id}>
                  {translate(item.labelKey)}
                  <select
                    value={inventoryState[item.id]}
                    onChange={(event) => setInventoryState((currentState) => ({
                      ...currentState,
                      [item.id]: event.target.value,
                    }))}
                  >
                    {inventoryLevels.map((level) => (
                      <option key={level} value={level}>
                        {translate(`checklistPreview.inventory${level}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="panel checklist-preview__section" aria-labelledby="notes-title">
            <h2 id="notes-title">{translate("checklistPreview.notesIssues")}</h2>
            <label>
              {translate("checklistPreview.issueNotes")}
              <textarea
                rows="4"
                value={issueNotes}
                onChange={(event) => setIssueNotes(event.target.value)}
              />
            </label>
            <label>
              {translate("checklistPreview.generalNotes")}
              <textarea
                rows="3"
                value={generalNotes}
                onChange={(event) => setGeneralNotes(event.target.value)}
              />
            </label>
          </section>

          <section className="panel checklist-preview__section" aria-labelledby="photos-title">
            <h2 id="photos-title">{translate("checklistPreview.photos")}</h2>
            <p className="checklist-preview__photos">{translate("checklistPreview.photosDemoOnly")}</p>
            <div className="checklist-preview__photo-grid">
              {photoPlaceholderGroups.map((group) => {
                const count = photoCounts[group.id];
                return (
                  <section className="checklist-preview__photo-placeholder" key={group.id}>
                    <h3>{translate(group.titleKey)}</h3>
                    <p>{translate("checklistPreview.photoPlaceholderCount", {
                      count,
                      maximum: group.maximum,
                    })}</p>
                    <button
                      className="button button--small"
                      type="button"
                      disabled={count >= group.maximum}
                      onClick={() => setPhotoCounts((currentCounts) => ({
                        ...currentCounts,
                        [group.id]: Math.min(group.maximum, currentCounts[group.id] + 1),
                      }))}
                    >
                      {translate("checklistPreview.addPhotoPlaceholder")}
                    </button>
                  </section>
                );
              })}
            </div>
          </section>

          <button className="button button--primary checklist-preview__submit" type="submit">
            {translate("checklistPreview.submit")}
          </button>
        </form>
      </section>
      <ScrollToTopButton />
    </main>
  );
}

function ClientReportPreview({ report, language, translate, onEdit }) {
  const restockItems = inventoryItems.filter((item) => report.summary.restockItemIds.includes(item.id));
  const photoPlaceholderCount = Object.values(report.photoCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const submittedAt = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(report.submittedAt);

  return (
    <main className="app-shell checklist-preview-shell">
      <section className="foundation checklist-preview-foundation" aria-labelledby="client-report-title">
        <header className="checklist-preview-header">
          <div>
            <p className="eyebrow">{translate("checklistPreview.reportEyebrow")}</p>
            <h1>CleanFlow</h1>
          </div>
          <span className="badge">{translate("checklistPreview.preview")}</span>
        </header>

        <section className="panel checklist-report" aria-labelledby="client-report-title">
          <div className="checklist-report__status">
            <span aria-hidden="true">✓</span>
            <div>
              <p className="eyebrow">{translate("checklistPreview.cleaningCompleted")}</p>
              <h2 id="client-report-title">{translate("checklistPreview.clientReport")}</h2>
            </div>
          </div>
          <p>{translate("checklistPreview.clientReportDescription")}</p>

          <dl className="detail-list">
            <div><dt>{translate("common.property")}</dt><dd>{report.details.property}</dd></div>
            <div><dt>{translate("common.cleaner")}</dt><dd>{report.details.cleaner}</dd></div>
            <div><dt>{translate("checklistPreview.dateCleaned")}</dt><dd>{formatDate(report.details.date, translate, language)}</dd></div>
            <div><dt>{translate("checklistPreview.reportGenerated")}</dt><dd>{submittedAt}</dd></div>
          </dl>

          <div className="checklist-report__summary">
            <div>
              <strong>{report.summary.completedCount} / {report.summary.applicableCount}</strong>
              <span>{translate("checklistPreview.completedSteps")}</span>
            </div>
            <div>
              <strong>{report.summary.notApplicableCount}</strong>
              <span>{translate("checklistPreview.notApplicableCount")}</span>
            </div>
            <div>
              <strong>{restockItems.length}</strong>
              <span>{translate("checklistPreview.restockAlerts")}</span>
            </div>
            <div>
              <strong>{photoPlaceholderCount}</strong>
              <span>{translate("checklistPreview.photoPlaceholders")}</span>
            </div>
          </div>

          {report.summary.photoRequiredCount > 0 && (
            <p className="checklist-report__photo-requirement">
              {translate("checklistPreview.photoRequiredSummary", {
                completed: report.summary.completedPhotoRequiredCount,
                total: report.summary.photoRequiredCount,
              })}
            </p>
          )}

          {restockItems.length > 0 && (
            <section className="checklist-report__alert" aria-labelledby="restock-alerts-title">
              <h3 id="restock-alerts-title">{translate("checklistPreview.restockNeeded")}</h3>
              <ul>{restockItems.map((item) => <li key={item.id}>{translate(item.labelKey)}</li>)}</ul>
            </section>
          )}

          {(report.issueNotes || report.generalNotes) && (
            <section className="checklist-report__notes" aria-labelledby="report-notes-title">
              <h3 id="report-notes-title">{translate("common.notes")}</h3>
              {report.issueNotes && <p><strong>{translate("checklistPreview.issueNotes")}:</strong> {report.issueNotes}</p>}
              {report.generalNotes && <p><strong>{translate("checklistPreview.generalNotes")}:</strong> {report.generalNotes}</p>}
            </section>
          )}

          <p className="checklist-report__delivery">{translate("checklistPreview.emailInactive")}</p>
          <div className="button-row checklist-report__actions">
            <button className="button" type="button" onClick={onEdit}>{translate("checklistPreview.editChecklist")}</button>
          </div>
        </section>

        <section className="checklist-preview__feedback" aria-labelledby="preview-feedback-title">
          <p className="eyebrow">{translate("checklistPreview.feedbackEyebrow")}</p>
          <h2 id="preview-feedback-title">{translate("checklistPreview.feedbackTitle")}</h2>
          <ul>
            <li>{translate("checklistPreview.feedbackProperty")}</li>
            <li>{translate("checklistPreview.feedbackAutomatic")}</li>
            <li>{translate("checklistPreview.feedbackRequired")}</li>
          </ul>
        </section>
      </section>
      <ScrollToTopButton />
    </main>
  );
}

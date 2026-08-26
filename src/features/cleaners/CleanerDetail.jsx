import { useEffect, useState } from "react";
import { BackButton, DetailItem } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import {
  formatDate,
  formatOperationalStatus,
  formatPrice,
  hasValue,
} from "../../lib/presentation.js";
import { getCleanerJobHistory } from "../jobs/jobService.js";
import {
  cleanerTeamTypeLabel,
  paymentMethodLabel,
  preferredLanguageLabel,
} from "./cleanerPresentation.js";

export function CleanerDetail({ cleaner, onBack, onEdit, onOpenJob }) {
  const { translate } = useTranslation();
  const [history, setHistory] = useState(null);
  const [hasHistoryError, setHasHistoryError] = useState(false);
  const cleanerName = cleaner.name || translate("common.notProvided");
  const cleanerStatus = cleaner.active === false
    ? translate("common.inactive")
    : translate("common.active");

  useEffect(() => {
    let isCurrent = true;
    setHistory(null);
    setHasHistoryError(false);

    async function loadJobHistory() {
      try {
        const loadedHistory = await getCleanerJobHistory(cleaner.id);

        if (isCurrent) {
          setHistory(loadedHistory);
        }
      } catch {
        if (isCurrent) {
          setHasHistoryError(true);
        }
      }
    }

    loadJobHistory();

    return () => {
      isCurrent = false;
    };
  }, [cleaner.id]);

  return (
    <section className="panel" aria-labelledby="cleaner-detail-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("cleaners.details")}</p>
      <h2 id="cleaner-detail-title" className="panel__title">
        {cleanerName}
      </h2>

      <dl className="detail-list">
        <DetailItem label={translate("common.status")} value={cleanerStatus} />
        <DetailItem label={translate("cleaners.phone")} value={cleaner.phone || translate("cleaners.noPhone")} />
        <DetailItem
          label={translate("cleaners.preferredLanguage")}
          value={preferredLanguageLabel(cleaner.preferredLanguage, translate)}
        />
      </dl>

      <section className="cleaner-profile-section" aria-labelledby="cleaner-operations-title">
        <h3 id="cleaner-operations-title">{translate("cleaners.operations")}</h3>
        <dl className="detail-list">
          <DetailItem
            label={translate("cleaners.cityOrRegion")}
            value={cleaner.cityOrRegion || translate("common.notProvided")}
          />
          <DetailItem
            label={translate("cleaners.teamType")}
            value={cleanerTeamTypeLabel(cleaner.teamType, translate)}
          />
        </dl>
      </section>

      <section className="cleaner-profile-section" aria-labelledby="cleaner-payment-title">
        <h3 id="cleaner-payment-title">{translate("cleaners.payment")}</h3>
        <dl className="detail-list">
          <DetailItem
            label={translate("cleaners.preferredPaymentMethod")}
            value={paymentMethodLabel(cleaner.preferredPaymentMethod, translate)}
          />
          <DetailItem
            label={translate("cleaners.paymentContact")}
            value={cleaner.paymentContact || translate("common.notProvided")}
          />
        </dl>
      </section>

      {cleaner.internalNotes && (
        <section className="cleaner-profile-section" aria-labelledby="cleaner-notes-title">
          <h3 id="cleaner-notes-title">{translate("cleaners.internalNotes")}</h3>
          <p className="cleaner-internal-notes">{cleaner.internalNotes}</p>
        </section>
      )}

      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onEdit}>
          {translate("cleaners.edit", { cleaner: cleanerName })}
        </button>
      </div>

      <CleanerOperationalHistory
        history={history}
        hasError={hasHistoryError}
        onOpenJob={onOpenJob}
      />
    </section>
  );
}

function CleanerOperationalHistory({ history, hasError, onOpenJob }) {
  const { translate } = useTranslation();

  return (
    <div className="property-history">
      <section className="property-history-section" aria-labelledby="cleaner-upcoming-services-title">
        <h3 id="cleaner-upcoming-services-title">{translate("cleaners.upcomingServices")}</h3>

        {!history && !hasError && (
          <p className="property-history-state">{translate("cleaners.historyLoading")}</p>
        )}

        {hasError && (
          <p className="property-history-state property-history-state--error" role="alert">
            {translate("cleaners.historyError")}
          </p>
        )}

        {history && history.upcomingJobs.length === 0 && (
          <p className="property-history-state">{translate("cleaners.noUpcomingServices")}</p>
        )}

        {history && history.upcomingJobs.length > 0 && (
          <div className="property-history-list">
            {history.upcomingJobs.map((job) => (
              <CleanerHistoryJob key={job.id} job={job} onOpen={onOpenJob} />
            ))}
          </div>
        )}
      </section>

      <section className="property-history-section" aria-labelledby="cleaner-recent-history-title">
        <h3 id="cleaner-recent-history-title">{translate("cleaners.recentHistory")}</h3>

        {history && history.recentJobs.length === 0 && (
          <p className="property-history-state">{translate("cleaners.noRecentHistory")}</p>
        )}

        {history && history.recentJobs.length > 0 && (
          <div className="property-history-list">
            {history.recentJobs.map((job) => (
              <CleanerHistoryJob key={job.id} job={job} onOpen={onOpenJob} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CleanerHistoryJob({ job, onOpen }) {
  const { language, translate } = useTranslation();
  const scheduledService = [
    formatDate(job.scheduledDate, translate, language),
    job.scheduledStart,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="property-history-job">
      <div className="property-history-job__summary">
        <strong>{scheduledService}</strong>
        <span>{job.propertyName || translate("properties.unnamed")}</span>
      </div>
      <span className="status-badge">
        {formatOperationalStatus(job.operationalStatus, translate)}
      </span>
      {hasValue(job.cleanerPayout) && (
        <span className="property-history-job__payout">
          {translate("jobs.cleanerPayout")}: {formatPrice(job.cleanerPayout, translate, language)}
        </span>
      )}
      <button className="button" type="button" onClick={() => onOpen(job)}>
        {translate("jobs.viewJob")}
      </button>
    </article>
  );
}

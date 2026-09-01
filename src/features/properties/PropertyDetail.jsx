import { useEffect, useState } from "react";
import { BackButton, DetailItem } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { assignedCleanerSummary } from "../jobs/assignmentPresentation.js";
import {
  formatDate,
  formatOperationalStatus,
  formatPrice,
  hasValue,
} from "../../lib/presentation.js";
import { getPropertyJobHistory } from "../jobs/jobService.js";

export function PropertyDetail({
  property,
  onBack,
  onCreateCleaning,
  onOpenJob,
  onLinkClient,
  onViewAllUpcoming,
}) {
  const { language, translate } = useTranslation();
  const propertyName = property.name || translate("properties.unnamed");
  const clientName = property.clientName || translate("common.notProvided");
  let activeStatus = translate("common.notProvided");

  if (property.active === true) {
    activeStatus = translate("common.active");
  }

  if (property.active === false) {
    activeStatus = translate("common.inactive");
  }

  return (
    <section className="panel" aria-labelledby="property-detail-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("properties.details")}</p>
      <h2 id="property-detail-title" className="panel__title">
        {propertyName}
      </h2>

      <dl className="detail-list">
        <DetailItem label={translate("common.client")} value={clientName} />
        {property.defaultClientPrice !== undefined && (
          <DetailItem
            label={translate("properties.defaultClientPrice")}
            value={formatPrice(property.defaultClientPrice, translate, language)}
          />
        )}
        {property.defaultCleanerPrice !== undefined && (
          <DetailItem
            label={translate("properties.defaultCleanerPrice")}
            value={formatPrice(property.defaultCleanerPrice, translate, language)}
          />
        )}
        <DetailItem label={translate("common.status")} value={activeStatus} />
      </dl>

      <div className="button-row">
        {!property.clientId && (
          <button className="button" type="button" onClick={onLinkClient}>
            {translate("properties.linkClient")}
          </button>
        )}
        <button
          className="button button--primary"
          type="button"
          onClick={onCreateCleaning}
        >
          {translate("properties.createCleaning")}
        </button>
      </div>

      <PropertyOperationalHistory
        propertyId={property.id}
        onOpenJob={onOpenJob}
        onViewAllUpcoming={onViewAllUpcoming}
      />
    </section>
  );
}

function PropertyOperationalHistory({ propertyId, onOpenJob, onViewAllUpcoming }) {
  const { translate } = useTranslation();
  const [history, setHistory] = useState(null);
  const [hasHistoryError, setHasHistoryError] = useState(false);
  const upcomingJobs = history?.upcomingJobs ?? (
    history?.upcomingJob ? [history.upcomingJob] : []
  );
  const displayedUpcomingJobs = upcomingJobs.slice(0, 3);
  const hasMoreUpcoming = Boolean(history?.hasMoreUpcoming) || upcomingJobs.length > 3;

  useEffect(() => {
    let isCurrent = true;

    async function loadHistory() {
      setHistory(null);
      setHasHistoryError(false);

      try {
        const loadedHistory = await getPropertyJobHistory(propertyId);

        if (isCurrent) {
          setHistory(loadedHistory);
        }
      } catch {
        if (isCurrent) {
          setHasHistoryError(true);
        }
      }
    }

    loadHistory();

    return () => {
      isCurrent = false;
    };
  }, [propertyId]);

  return (
    <div className="property-history">
      <section className="property-history-section" aria-labelledby="property-upcoming-job-title">
        <h3 id="property-upcoming-job-title">{translate("properties.upcomingServices")}</h3>

        {!history && !hasHistoryError && (
          <p className="property-history-state">{translate("properties.historyLoading")}</p>
        )}

        {hasHistoryError && (
          <p className="property-history-state property-history-state--error" role="alert">
            {translate("properties.historyError")}
          </p>
        )}

        {history && displayedUpcomingJobs.length === 0 && (
          <p className="property-history-state">{translate("properties.noUpcomingService")}</p>
        )}

        {displayedUpcomingJobs.length > 0 && (
          <div className="property-history-list">
            {displayedUpcomingJobs.map((job) => (
              <PropertyHistoryJob key={job.id} job={job} onOpen={onOpenJob} />
            ))}
          </div>
        )}

        {hasMoreUpcoming && (
          <button className="button" type="button" onClick={onViewAllUpcoming}>
            {translate("jobs.viewAllUpcoming")}
          </button>
        )}
      </section>

      <section className="property-history-section" aria-labelledby="property-cleaning-history-title">
        <h3 id="property-cleaning-history-title">{translate("properties.cleaningHistory")}</h3>

        {history && history.recentJobs.length === 0 && (
          <p className="property-history-state">{translate("properties.noCleaningHistory")}</p>
        )}

        {history && history.recentJobs.length > 0 && (
          <div className="property-history-list">
            {history.recentJobs.map((job) => (
              <PropertyHistoryJob key={job.id} job={job} onOpen={onOpenJob} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PropertyHistoryJob({ job, onOpen }) {
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
        <span>{assignedCleanerSummary(job, {}, translate, translate("dashboard.notAssigned"))}</span>
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

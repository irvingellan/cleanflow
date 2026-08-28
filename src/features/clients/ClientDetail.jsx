import { BackButton, DetailItem } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import {
  formatDate,
  formatOperationalStatus,
  formatPrice,
  hasValue,
} from "../../lib/presentation.js";

export function ClientDetail({
  client,
  properties,
  isLoadingProperties,
  hasPropertiesError,
  jobHistory,
  hasJobHistoryError,
  onBack,
  onOpenProperty,
  onCreateProperty,
  onOpenJob,
}) {
  const { language, translate } = useTranslation();
  const clientName = client.name || translate("common.notProvided");
  const clientStatus = client.active === false
    ? translate("common.inactive")
    : translate("common.active");
  const sortedProperties = [...properties].sort((firstProperty, secondProperty) =>
    (firstProperty.name || "").localeCompare(secondProperty.name || ""),
  );

  return (
    <section className="panel" aria-labelledby="client-detail-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("clients.details")}</p>
      <h2 id="client-detail-title" className="panel__title">
        {clientName}
      </h2>

      <dl className="detail-list">
        <DetailItem label={translate("common.status")} value={clientStatus} />
      </dl>

      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onCreateProperty}>
          {translate("properties.new")}
        </button>
      </div>

      <section className="client-properties" aria-labelledby="client-properties-title">
        <h3 id="client-properties-title">{translate("clients.linkedProperties")}</h3>

        {isLoadingProperties && (
          <p className="property-history-state">{translate("clients.propertiesLoading")}</p>
        )}

        {hasPropertiesError && (
          <p className="property-history-state property-history-state--error" role="alert">
            {translate("clients.propertiesError")}
          </p>
        )}

        {!isLoadingProperties && !hasPropertiesError && sortedProperties.length === 0 && (
          <p className="property-history-state">{translate("clients.noLinkedProperties")}</p>
        )}

        {!isLoadingProperties && !hasPropertiesError && sortedProperties.length > 0 && (
          <div className="client-properties__list">
            {sortedProperties.map((property) => {
              const propertyName = property.name || translate("properties.unnamed");
              const propertyStatus = property.active === false
                ? translate("common.inactive")
                : translate("common.active");

              return (
                <article key={property.id} className="client-property-card">
                  <div className="client-property-card__summary">
                    <strong>{propertyName}</strong>
                  </div>
                  <span className="status-badge">{propertyStatus}</span>
                  <div className="client-property-card__prices">
                    <span>
                      {translate("properties.defaultClientPrice")}: {hasValue(
                        property.defaultClientPrice,
                      )
                        ? formatPrice(property.defaultClientPrice, translate, language)
                        : "—"}
                    </span>
                    <span>
                      {translate("properties.defaultCleanerPrice")}: {hasValue(
                        property.defaultCleanerPrice,
                      )
                        ? formatPrice(property.defaultCleanerPrice, translate, language)
                        : "—"}
                    </span>
                  </div>
                  <button
                    className="button"
                    type="button"
                    onClick={() => onOpenProperty(property)}
                  >
                    {translate("clients.openProperty")}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ClientOperationalHistory
        history={jobHistory}
        hasError={hasJobHistoryError}
        onOpenJob={onOpenJob}
      />
    </section>
  );
}

function ClientOperationalHistory({ history, hasError, onOpenJob }) {
  const { translate } = useTranslation();

  return (
    <div className="property-history client-history">
      <section className="property-history-section" aria-labelledby="client-upcoming-job-title">
        <h3 id="client-upcoming-job-title">{translate("clients.upcomingService")}</h3>

        {!history && !hasError && (
          <p className="property-history-state">{translate("clients.historyLoading")}</p>
        )}

        {hasError && (
          <p className="property-history-state property-history-state--error" role="alert">
            {translate("clients.historyError")}
          </p>
        )}

        {history && !history.upcomingJob && (
          <p className="property-history-state">{translate("clients.noUpcomingService")}</p>
        )}

        {history?.upcomingJob && (
          <ClientHistoryJob job={history.upcomingJob} onOpen={onOpenJob} />
        )}
      </section>

      <section className="property-history-section" aria-labelledby="client-recent-history-title">
        <h3 id="client-recent-history-title">{translate("clients.recentHistory")}</h3>

        {history && history.recentJobs.length === 0 && (
          <p className="property-history-state">{translate("clients.noRecentHistory")}</p>
        )}

        {history && history.recentJobs.length > 0 && (
          <div className="property-history-list">
            {history.recentJobs.map((job) => (
              <ClientHistoryJob key={job.id} job={job} onOpen={onOpenJob} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ClientHistoryJob({ job, onOpen }) {
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
        <span>{job.assignedCleanerName || translate("dashboard.notAssigned")}</span>
      </div>
      <span className="status-badge">
        {formatOperationalStatus(job.operationalStatus, translate)}
      </span>
      {hasValue(job.clientPrice) && (
        <span className="property-history-job__payout">
          {translate("jobs.clientPrice")}: {formatPrice(job.clientPrice, translate, language)}
        </span>
      )}
      <button className="button" type="button" onClick={() => onOpen(job)}>
        {translate("jobs.viewJob")}
      </button>
    </article>
  );
}

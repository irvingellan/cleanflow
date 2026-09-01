import { useMemo, useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import {
  formatDate,
  formatOperationalStatus,
  formatPrice,
  hasValue,
} from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";
import { createJobListFilters } from "./jobListFilters.js";
import { getAssignedCleanerIds } from "./jobCompatibility.js";
import { assignedCleanerSummary } from "./assignmentPresentation.js";

export { createJobListFilters, dashboardJobListFilters } from "./jobListFilters.js";

function jobCompletedAtSortValue(job) {
  if (job.completedAt?.toMillis) return job.completedAt.toMillis();

  const scheduledAt = new Date(`${job.scheduledDate || ""}T00:00:00`).getTime();
  return Number.isNaN(scheduledAt) ? 0 : scheduledAt;
}

export function sortJobWorklist(firstJob, secondJob) {
  const firstIsCompleted = firstJob.operationalStatus === "COMPLETED";
  const secondIsCompleted = secondJob.operationalStatus === "COMPLETED";

  if (firstIsCompleted && secondIsCompleted) {
    return jobCompletedAtSortValue(secondJob) - jobCompletedAtSortValue(firstJob);
  }

  if (firstIsCompleted) return 1;
  if (secondIsCompleted) return -1;

  return `${firstJob.scheduledDate || ""}T${firstJob.scheduledStart || ""}`.localeCompare(
    `${secondJob.scheduledDate || ""}T${secondJob.scheduledStart || ""}`,
  );
}

export function JobsPage({
  jobs,
  isLoading,
  hasError,
  onSelect,
  filters,
  cleaners,
  properties,
  onFiltersChange,
  onClearFilters,
  hasMore,
  isLoadingMore,
  onLoadMore,
}) {
  const { language, translate } = useTranslation();
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const propertiesById = useMemo(
    () => Object.fromEntries(properties.map((property) => [property.id, property])),
    [properties],
  );
  const normalizedSearch = filters.search.trim().toLocaleLowerCase(language);
  const sortedJobs = useMemo(
    () =>
      jobs
        .filter(
          (job) =>
            !filters.cleanerId ||
            job.assignedCleanerId === filters.cleanerId ||
            getAssignedCleanerIds(job).includes(filters.cleanerId),
        )
        .filter(
          (job) => !filters.propertyId || job.propertyId === filters.propertyId,
        )
        .filter(
          (job) =>
            !filters.clientId ||
            job.clientId === filters.clientId ||
            propertiesById[job.propertyId]?.clientId === filters.clientId,
        )
        .filter((job) => {
          if (!normalizedSearch) return true;

          const currentPropertyName = propertiesById[job.propertyId]?.name || "";
          return `${job.propertyName || ""} ${currentPropertyName}`
            .toLocaleLowerCase(language)
            .includes(normalizedSearch);
        })
        .sort(sortJobWorklist),
    [
      filters.cleanerId,
      filters.clientId,
      filters.propertyId,
      jobs,
      language,
      normalizedSearch,
      propertiesById,
    ],
  );
  const defaultFilters = createJobListFilters();
  const hasActiveFilters = Object.entries(filters).some(
    ([key, value]) => value !== defaultFilters[key],
  );
  const statusOptions = [
    ["all", translate("jobs.filterAll")],
    ["needs-assignment", translate("jobs.filterNeedsAssignment")],
    ["offered", translate("jobs.filterOffered")],
    ["assigned", translate("jobs.filterAssigned")],
    ["in-progress", translate("jobs.filterInProgress")],
    ["completed", translate("jobs.filterCompleted")],
  ];
  const dateOptions = [
    ["any", translate("jobs.dateAny")],
    ["today", translate("jobs.dateToday")],
    ["next-7-days", translate("jobs.dateNext7Days")],
    ["past-7-days", translate("jobs.datePast7Days")],
    ["past-30-days", translate("jobs.datePast30Days")],
  ];
  const quickStatusValues = ["needs-assignment", "in-progress", "completed"];
  const advancedFilterCount = [
    filters.datePreset !== "any",
    Boolean(filters.cleanerId),
    Boolean(filters.propertyId),
    Boolean(filters.clientId),
    !["all", ...quickStatusValues].includes(filters.status),
  ].filter(Boolean).length;

  function toggleQuickStatus(status) {
    onFiltersChange({ status: filters.status === status ? "all" : status });
  }

  function toggleToday() {
    onFiltersChange({
      datePreset: filters.datePreset === "today" ? "any" : "today",
    });
  }

  return (
    <section aria-labelledby="jobs-title">
      <p className="eyebrow">{translate("navigation.jobs")}</p>
      <h2 id="jobs-title" className="list-title">
        {translate("jobs.title")}
      </h2>

      <div className="job-filters" aria-label={translate("jobs.filters")}>
        <label className="job-filters__search">
          <input
            type="search"
            aria-label={translate("jobs.search")}
            value={filters.search}
            placeholder={translate("jobs.searchPlaceholder")}
            onChange={(event) => onFiltersChange({ search: event.target.value })}
          />
        </label>
        <div className="job-filters__quick-actions">
          <div
            className="job-filter-chips"
            aria-label={translate("jobs.quickFilters")}
          >
            <button
              className={`job-filter-chip${
                filters.datePreset === "today" ? " job-filter-chip--active" : ""
              }`}
              type="button"
              aria-pressed={filters.datePreset === "today"}
              onClick={toggleToday}
            >
              📅 {translate("jobs.quickToday")}
            </button>
            <button
              className={`job-filter-chip${
                filters.status === "needs-assignment"
                  ? " job-filter-chip--active"
                  : ""
              }`}
              type="button"
              aria-pressed={filters.status === "needs-assignment"}
              onClick={() => toggleQuickStatus("needs-assignment")}
            >
              ⏰ {translate("jobs.filterNeedsAssignment")}
            </button>
            <button
              className={`job-filter-chip${
                filters.status === "in-progress" ? " job-filter-chip--active" : ""
              }`}
              type="button"
              aria-pressed={filters.status === "in-progress"}
              onClick={() => toggleQuickStatus("in-progress")}
            >
              🧹 {translate("jobs.filterInProgress")}
            </button>
            <button
              className={`job-filter-chip${
                filters.status === "completed" ? " job-filter-chip--active" : ""
              }`}
              type="button"
              aria-pressed={filters.status === "completed"}
              onClick={() => toggleQuickStatus("completed")}
            >
              ✅ {translate("jobs.filterCompleted")}
            </button>
          </div>
          <div className="job-filters__utility-actions">
            <button
              className={`job-filters__advanced-toggle${
                advancedFilterCount > 0
                  ? " job-filters__advanced-toggle--active"
                  : ""
              }`}
              type="button"
              aria-expanded={isAdvancedFiltersOpen}
              onClick={() => setIsAdvancedFiltersOpen((isOpen) => !isOpen)}
            >
              {advancedFilterCount > 0
                ? translate("jobs.advancedFiltersCount", {
                    count: advancedFilterCount,
                  })
                : translate("jobs.advancedFilters")}
            </button>
            {hasActiveFilters && (
              <button
                className="job-filters__clear"
                type="button"
                onClick={onClearFilters}
              >
                {translate("jobs.clearFilters")}
              </button>
            )}
          </div>
        </div>
        {filters.clientName && (
          <p className="job-filters__context">
            {translate("jobs.clientContext", { client: filters.clientName })}
          </p>
        )}
        {isAdvancedFiltersOpen && (
          <div className="job-filters__advanced">
            <label>
              {translate("jobs.statusFilter")}
              <select
                value={filters.status}
                onChange={(event) =>
                  onFiltersChange({ status: event.target.value })
                }
              >
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {translate("jobs.dateFilter")}
              <select
                value={filters.datePreset}
                onChange={(event) =>
                  onFiltersChange({ datePreset: event.target.value })
                }
              >
                {dateOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {translate("jobs.cleanerFilter")}
              <select
                value={filters.cleanerId}
                onChange={(event) =>
                  onFiltersChange({ cleanerId: event.target.value })
                }
              >
                <option value="">{translate("jobs.anyCleaner")}</option>
                {[...cleaners]
                  .sort((firstCleaner, secondCleaner) =>
                    (firstCleaner.name || "").localeCompare(
                      secondCleaner.name || "",
                    ),
                  )
                  .map((cleaner) => (
                    <option key={cleaner.id} value={cleaner.id}>
                      {cleaner.name || translate("common.notProvided")}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {translate("jobs.propertyFilter")}
              <select
                value={filters.propertyId}
                onChange={(event) =>
                  onFiltersChange({ propertyId: event.target.value })
                }
              >
                <option value="">{translate("jobs.anyProperty")}</option>
                {[...properties]
                  .sort((firstProperty, secondProperty) =>
                    (firstProperty.name || "").localeCompare(
                      secondProperty.name || "",
                    ),
                  )
                  .map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name || translate("properties.unnamed")}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {isLoading && (
        <StateCard message={translate("jobs.loading")} status="status" />
      )}
      {!isLoading && hasError && (
        <StateCard
          message={translate("jobs.error")}
          status="alert"
          isError
        />
      )}
      {!isLoading && !hasError && sortedJobs.length === 0 && (
        <>
          <StateCard
            message={
              jobs.length === 0
                ? translate("jobs.empty")
                : translate("jobs.noMatchingFilters")
            }
          />
          {hasMore && (
            <button
              className="button job-list__load-more"
              type="button"
              disabled={isLoadingMore}
              onClick={onLoadMore}
            >
              {isLoadingMore
                ? translate("jobs.loadingMore")
                : translate("jobs.loadMore")}
            </button>
          )}
        </>
      )}
      {!isLoading && !hasError && sortedJobs.length > 0 && (
        <>
          <p className="job-list__context">
            {translate("jobs.results", { count: sortedJobs.length })}
          </p>
          <div className="job-list">
            {sortedJobs.map((job) => (
              <button
                key={job.id}
                className="job-card"
                type="button"
                aria-label={translate("properties.view", {
                  property:
                    job.propertyName || translate("properties.unnamed"),
                })}
                onClick={() => onSelect(job)}
              >
                <span className="job-card__date">
                  {formatDate(job.scheduledDate, translate, language)}
                </span>
                <span className="job-card__summary">
                  <strong>
                    {job.propertyName || translate("properties.unnamed")}
                  </strong>
                  <span>
                    {job.clientName || translate("common.notProvided")}
                  </span>
                  <span>
                    {assignedCleanerSummary(
                      job,
                      {},
                      translate,
                      translate("dashboard.notAssigned"),
                    )}
                  </span>
                </span>
                <span className="status-badge">
                  {formatOperationalStatus(job.operationalStatus, translate)}
                </span>
                {(hasValue(job.clientPrice) || hasValue(job.cleanerPayout)) && (
                  <span className="job-card__prices">
                    {hasValue(job.clientPrice) && (
                      <span>
                        {translate("common.client")}{" "}
                        {formatPrice(job.clientPrice, translate, language)}
                      </span>
                    )}
                    {hasValue(job.cleanerPayout) && (
                      <span>
                        {translate("common.cleaner")}{" "}
                        {formatPrice(job.cleanerPayout, translate, language)}
                      </span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
          {hasMore && (
            <button
              className="button job-list__load-more"
              type="button"
              disabled={isLoadingMore}
              onClick={onLoadMore}
            >
              {isLoadingMore
                ? translate("jobs.loadingMore")
                : translate("jobs.loadMore")}
            </button>
          )}
        </>
      )}
    </section>
  );
}

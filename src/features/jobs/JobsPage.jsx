import { useEffect, useMemo, useRef, useState } from "react";
import { useJobPhotoCounts } from "./jobPhotoCountService.js";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { Icon } from "../../components/Icon.jsx";
import { DataProvenanceBadge } from "../../components/DataProvenanceBadge.jsx";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { formatDate } from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";
import { createJobListFilters } from "./jobListFilters.js";
import { getAssignedCleanerIds } from "./jobCompatibility.js";
import { assignedCleanerSummary } from "./assignmentPresentation.js";
import { CompactServiceLifecycle } from "./CompactServiceLifecycle.jsx";

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
  onCreate,
  filters,
  cleaners,
  properties,
  onFiltersChange,
  onClearFilters,
  hasMore,
  isLoadingMore,
  onLoadMore,
  restoreScroll,
  onScrollRestored,
  canManageExcluded,
  showExcluded,
  onToggleExcluded,
  variant = "page",
  selectedJobId = null,
  loadPhotoCounts,
}) {
  const { language, translate } = useTranslation();
  const isPane = variant === "pane";
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const jobCardElements = useRef(new Map());
  const propertiesById = useMemo(
    () => Object.fromEntries(properties.map((property) => [property.id, property])),
    [properties],
  );
  const cleanerNamesById = useMemo(
    () => Object.fromEntries(cleaners.map((cleaner) => [cleaner.id, cleaner.name])),
    [cleaners],
  );
  const { counts: photoCounts, isLoading: isLoadingPhotoCounts } = useJobPhotoCounts(jobs, loadPhotoCounts);
  // The list order only depends on photo counts while the "With photos" filter is on.
  const photoFilterCounts = filters.withPhotos ? photoCounts : null;
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
        .filter((job) => !photoFilterCounts || photoFilterCounts[job.id] > 0)
        .sort(sortJobWorklist),
    [
      photoFilterCounts,
      filters.cleanerId,
      filters.clientId,
      filters.propertyId,
      jobs,
      language,
      normalizedSearch,
      propertiesById,
    ],
  );

  useEffect(() => {
    if (!restoreScroll || isLoading || hasError) return;

    const anchorElement = jobCardElements.current.get(restoreScroll.anchorJobId);
    if (!anchorElement) return;

    const anchorTop = anchorElement.getBoundingClientRect().top;
    const targetScrollY = Math.max(
      0,
      window.scrollY + anchorTop - restoreScroll.anchorViewportOffset,
    );
    window.scrollTo({ top: targetScrollY, behavior: "auto" });
    onScrollRestored?.();
  }, [hasError, isLoading, onScrollRestored, restoreScroll, sortedJobs]);

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
    <section className={`cf-services${isPane ? " cf-services--pane" : ""}`} aria-labelledby={isPane ? "jobs-pane-title" : "jobs-title"}>
      {isPane ? (
        <div className="cf-services__pane-header">
          <h2 id="jobs-pane-title">{translate("navigation.jobs")}</h2>
          {!isLoading && !hasError && <span className="cf-services__count" data-numeric>{sortedJobs.length}</span>}
        </div>
      ) : (
        <header className="cf-page-header directory-heading">
          <div className="cf-page-header__text">
            <h2 id="jobs-title" className="list-title">
              {translate("jobs.title")}
            </h2>
            {!isLoading && !hasError && (
              <p className="cf-page-context">{translate("jobs.results", { count: sortedJobs.length })}</p>
            )}
          </div>
          <div className="cf-page-header__actions">
            {canManageExcluded && <button className="button button--small" type="button" onClick={onToggleExcluded}>{translate(showExcluded ? "archive.hideExcluded" : "archive.showExcluded")}</button>}
            <button className="button button--primary" type="button" onClick={onCreate}>
              <Icon name="plus" size={18} />
              {translate("jobs.newService")}
            </button>
          </div>
        </header>
      )}

      <div className="job-filters" aria-label={translate("jobs.filters")}>
        <label className="job-filters__search">
          <Icon name="search" size={18} className="job-filters__search-icon" />
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
              <Icon name="calendar" size={16} />{translate("jobs.quickToday")}
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
              <Icon name="userX" size={16} />{translate("jobs.filterNeedsAssignment")}
            </button>
            <button
              className={`job-filter-chip${
                filters.status === "in-progress" ? " job-filter-chip--active" : ""
              }`}
              type="button"
              aria-pressed={filters.status === "in-progress"}
              onClick={() => toggleQuickStatus("in-progress")}
            >
              <Icon name="broom" size={16} />{translate("jobs.filterInProgress")}
            </button>
            <button
              className={`job-filter-chip${
                filters.status === "completed" ? " job-filter-chip--active" : ""
              }`}
              type="button"
              aria-pressed={filters.status === "completed"}
              onClick={() => toggleQuickStatus("completed")}
            >
              <Icon name="checkCircle" size={16} />{translate("jobs.filterCompleted")}
            </button>
            <button
              className={`job-filter-chip${filters.withPhotos ? " job-filter-chip--active" : ""}`}
              type="button"
              aria-pressed={Boolean(filters.withPhotos)}
              onClick={() => onFiltersChange({ withPhotos: !filters.withPhotos })}
            >
              <Icon name="camera" size={16} />{translate("jobs.filterWithPhotos")}
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
      {!isLoading && filters.withPhotos && isLoadingPhotoCounts && (
        <p className="job-list__context" role="status">{translate("jobs.lookingForPhotos")}</p>
      )}
      {!isLoading && filters.withPhotos && hasMore && (
        <p className="job-list__context">{translate("jobs.withPhotosLoadedOnly")}</p>
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
          {!isPane && <p className="job-list__context visually-hidden">
            {translate("jobs.results", { count: sortedJobs.length })}
          </p>}
          <div className="job-list cf-job-list">
            {sortedJobs.map((job) => (
              <button
                key={job.id}
                className={`job-card job-card--lifecycle cf-job-row${job.id === selectedJobId ? " is-selected" : ""}`}
                type="button"
                aria-current={job.id === selectedJobId ? "true" : undefined}
                aria-label={translate("properties.view", {
                  property:
                    job.propertyName || translate("properties.unnamed"),
                })}
                data-job-id={job.id}
                aria-describedby={`jobs-lifecycle-${job.id}`}
                ref={(element) => {
                  if (element) {
                    jobCardElements.current.set(job.id, element);
                  } else {
                    jobCardElements.current.delete(job.id);
                  }
                }}
                onClick={(event) =>
                  onSelect(job, {
                    anchorJobId: job.id,
                    anchorViewportOffset: event.currentTarget.getBoundingClientRect().top,
                  })
                }
              >
                <span className="job-card__schedule cf-job-row__when">
                  <strong>{formatDate(job.scheduledDate, translate, language)}</strong>
                  <span data-numeric>
                    <span className="visually-hidden">{translate("jobs.scheduledTime")}: </span>
                    {job.scheduledStart || translate("jobs.notSet")}
                  </span>
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
                      cleanerNamesById,
                      translate,
                      translate("dashboard.notAssigned"),
                    )}
                  </span>
                </span>
                <CompactServiceLifecycle job={job} descriptionId={`jobs-lifecycle-${job.id}`} />
                <span className="job-card__secondary">
                  {photoCounts[job.id] > 0 && (
                    <span className="job-card__photos" title={translate("jobs.photoCount", { count: photoCounts[job.id] })}>
                      <Icon name="camera" size={14} />
                      <span aria-hidden="true">{photoCounts[job.id]}</span>
                      <span className="visually-hidden">{translate("jobs.photoCount", { count: photoCounts[job.id] })}</span>
                    </span>
                  )}
                  <span className="job-card__provenance"><DataProvenanceBadge record={job} /></span>
                  {job.archivedAt && <span className="record-archive-badge">{translate("archive.excluded")}</span>}
                </span>
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
      {!isPane && <ScrollToTopButton />}
    </section>
  );
}

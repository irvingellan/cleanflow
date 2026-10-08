import { useState } from "react";
import { JobsPage } from "./JobsPage.jsx";
import { serviceLifecyclePresentation } from "./serviceLifecyclePresentation.js";
import { assignedCleanerSummary } from "./assignmentPresentation.js";
import { formatDate } from "../../lib/presentation.js";
import { DataProvenanceBadge } from "../../components/DataProvenanceBadge.jsx";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { Button, Row, SearchField, FilterChip, Select, ConfirmationSheet,
  Skeleton, SyncLine, EmptyState, ErrorState, LifecycleRail, Icon } from "../../components/v2/primitives.jsx";
import { servicesV2Translate } from "./servicesV2Copy.js";
import { useTranslation } from "../../i18n/translations.js";
import "./servicesV2.css";

export default function ServicesV2Pilot(props) {
  const { language } = useTranslation();
  const [variant, setVariant] = useState(() => new URLSearchParams(window.location.search).get("services") === "v2" ? "v2" : "current");
  const selected = props.presentation ?? variant;
  const t = key => servicesV2Translate(language, key);
  return <div className={selected === "v2" ? "services-v2-pilot" : undefined}>
    {!props.hideComparison && <div className="services-v2-comparison" role="group" aria-label={t("preview")}>
      <span>{t("preview")}</span>{["current", "v2"].map(value => <Button key={value} variant="secondary" aria-pressed={variant === value}
        onClick={() => { setVariant(value); const url = new URL(window.location.href); url.searchParams.set("services", value); window.history.replaceState(window.history.state, "", url); }}>{t(value)}</Button>)}
    </div>}
    <JobsPage {...props} renderPresentation={selected === "v2" ? model => <ServicesV2 {...props} {...model} /> : undefined} />
  </div>;
}

function ServicesV2({ language, translate, sortedJobs, cleanerNamesById, jobCardElements,
  hasActiveFilters, statusOptions, dateOptions, advancedFilterCount, toggleQuickStatus, toggleToday,
  jobs, isLoading, hasError, filters, cleaners, properties, onFiltersChange, onClearFilters,
  onCreate, onSelect, hasMore, onLoadMore, isLoadingMore, canManageExcluded, showExcluded,
  onToggleExcluded, onRetry }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const t = key => servicesV2Translate(language, key);
  const hasPrevious = jobs.length > 0 && (isLoading || hasError);
  const stateLabels = Object.fromEntries(["completed", "current", "future", "skipped", "unknown-past"]
    .map(state => [state, translate(`lifecycle.position.${state}`)]));
  return <section className="services-v2" aria-labelledby="jobs-title" data-services-presentation="v2">
    <header className="services-v2__heading">
      <div><h2 id="jobs-title">{t("title")}</h2><p>{t("loaded")}: {sortedJobs.length}</p></div>
      <Button onClick={onCreate}>{translate("jobs.newService")}</Button>
    </header>
    <div className="services-v2__toolbar" aria-label={translate("jobs.filters")}>
      <SearchField label={translate("jobs.search")} value={filters.search} clearLabel={translate("jobs.clearFilters")}
        onChange={event => onFiltersChange({ search: event.target.value })} />
      <div className="services-v2__chips" role="group" aria-label={translate("jobs.quickFilters")}>
        <FilterChip selected={filters.datePreset === "today"} onClick={toggleToday}>{translate("jobs.quickToday")}</FilterChip>
        {["needs-assignment", "in-progress", "completed"].map(status => <FilterChip key={status}
          selected={filters.status === status} onClick={() => toggleQuickStatus(status)}>
          {translate({ "needs-assignment": "jobs.filterNeedsAssignment", "in-progress": "jobs.filterInProgress", completed: "jobs.filterCompleted" }[status])}
        </FilterChip>)}
      </div>
      <Button variant="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
        {translate("jobs.filters")}{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
      </Button>
      {hasActiveFilters && <Button variant="tertiary" onClick={onClearFilters}>{translate("jobs.clearFilters")}</Button>}
    </div>
    {filters.clientId && <p>{translate("jobs.clientContext", { client: filters.clientName })}</p>}
    <ConfirmationSheet open={filtersOpen} title={translate("jobs.filters")} confirmLabel={t("show")}
      cancelLabel={t("close")} onConfirm={() => setFiltersOpen(false)} onCancel={() => setFiltersOpen(false)}>
      <div className="services-v2__filter-fields">
        <Select label={translate("jobs.statusFilter")} value={filters.status}
          options={statusOptions.map(([value, label]) => ({ value, label }))} onChange={event => onFiltersChange({ status: event.target.value })} />
        <Select label={translate("jobs.dateFilter")} value={filters.datePreset}
          options={dateOptions.map(([value, label]) => ({ value, label }))} onChange={event => onFiltersChange({ datePreset: event.target.value })} />
        <Select label={translate("jobs.cleanerFilter")} value={filters.cleanerId}
          options={[{ value: "", label: translate("jobs.anyCleaner") }, ...[...cleaners].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(cleaner => ({ value: cleaner.id, label: cleaner.name || translate("common.notProvided") }))]}
          onChange={event => onFiltersChange({ cleanerId: event.target.value })} />
        <Select label={translate("jobs.propertyFilter")} value={filters.propertyId}
          options={[{ value: "", label: translate("jobs.anyProperty") }, ...[...properties].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(property => ({ value: property.id, label: property.name || translate("properties.unnamed") }))]}
          onChange={event => onFiltersChange({ propertyId: event.target.value })} />
        {canManageExcluded && <Button variant="secondary" onClick={onToggleExcluded}>{translate(showExcluded ? "archive.hideExcluded" : "archive.showExcluded")}</Button>}
        {hasActiveFilters && <Button variant="tertiary" onClick={onClearFilters}>{translate("jobs.clearFilters")}</Button>}
      </div>
    </ConfirmationSheet>
    {isLoading && !jobs.length && <Skeleton label={translate("jobs.loading")} rows={5} />}
    {hasPrevious && <SyncLine status={hasError ? "stale" : "updating"}>{hasError ? t("failed") : t("refreshing")} {t("previous")}</SyncLine>}
    {hasError && !isLoading && (onRetry
      ? <ErrorState title={translate("jobs.error")} retryLabel={t("retry")} onRetry={onRetry} />
      : <StateCard message={translate("jobs.error")} status="alert" isError />)}
    {!isLoading && !hasError && !sortedJobs.length && <EmptyState title={translate(jobs.length ? "jobs.noMatchingFilters" : "jobs.empty")}
      action={<Button variant="secondary" onClick={jobs.length ? onClearFilters : onCreate}>{translate(jobs.length ? "jobs.clearFilters" : "jobs.newService")}</Button>}>
    </EmptyState>}
    {sortedJobs.length > 0 && <div className="services-v2__list" aria-label={translate("jobs.title")}>
      <div className="services-v2__columns" aria-hidden="true"><span>{translate("jobs.dateFilter")}</span><span>{translate("jobs.scheduledTime")}</span><span>{t("propertyClient")}</span><span>{translate("jobs.cleanerFilter")}</span><span>{t("progress")}</span><span /></div>
      {sortedJobs.map((job, index) => {
        const firstOfDay = index === 0 || sortedJobs[index - 1].scheduledDate !== job.scheduledDate;
        const date = job.scheduledDate ? formatDate(job.scheduledDate, translate, language) : translate("common.notProvided");
        const property = job.propertyName || translate("properties.unnamed");
        const descriptionId = `services-v2-lifecycle-${job.id}`;
        const presentation = serviceLifecyclePresentation({ job }); // Omitted Offers means unknown history.
        const cleaner = assignedCleanerSummary(job, cleanerNamesById, translate, translate("dashboard.notAssigned"));
        return <div key={job.id} className={firstOfDay ? "services-v2__day-start" : ""}>
          {firstOfDay && <div className="services-v2__day">{date}</div>}
          <Row dense data-job-id={job.id} aria-label={`${translate("properties.view", { property })} · ${date} · ${job.scheduledStart || translate("jobs.notSet")} · ${cleaner}`} aria-describedby={descriptionId}
            elementRef={element => { if (element) jobCardElements.current.set(job.id, element); else jobCardElements.current.delete(job.id); }}
            onClick={event => onSelect(job, { anchorJobId: job.id, anchorViewportOffset: event.currentTarget.getBoundingClientRect().top })}>
            <span className="services-v2__date">{firstOfDay ? date : ""}<span className="cfv2-sr-only">{!firstOfDay ? date : ""}</span></span>
            <span className="services-v2__time">{job.scheduledStart || translate("jobs.notSet")}</span>
            <span className="services-v2__identity"><strong>{property}</strong><span className="services-v2__client-desktop">{job.clientName || translate("common.notProvided")}</span><span className="services-v2__people-mobile">{cleaner} · {job.clientName || translate("common.notProvided")}</span></span>
            <span className="services-v2__cleaner">{cleaner}</span>
            <span id={descriptionId}><LifecycleRail compact markers presentation={presentation} translate={translate} stateLabels={stateLabels} /></span>
            <span className="services-v2__meta"><DataProvenanceBadge record={job} />{job.archivedAt && <span>{translate("archive.excluded")}</span>}<Icon name="chevron" /></span>
          </Row>
        </div>;
      })}
    </div>}
    {hasMore && !isLoading && !hasError && <div className="services-v2__continuation"><Button variant="secondary" busy={isLoadingMore} onClick={onLoadMore}>{translate(isLoadingMore ? "jobs.loadingMore" : "jobs.loadMore")}</Button></div>}
    <ScrollToTopButton />
  </section>;
}

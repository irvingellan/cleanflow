import { useState } from "react";
import { createRoot } from "react-dom/client";
import ServicesV2Pilot from "../../src/features/jobs/ServicesV2Pilot.jsx";
import { JobDetail } from "../../src/features/jobs/JobDetail.jsx";
import { CreateCleaningForm } from "../../src/features/jobs/JobForm.jsx";
import { createJobListFilters } from "../../src/features/jobs/jobListFilters.js";
import { buildCompactLifecycleFixtures } from "../../scripts/compactLifecycleFixtures.mjs";
import { getServiceLifecycleFixture } from "../../scripts/serviceLifecycleFixtures.mjs";
import { TranslationProvider, useTranslation } from "../../src/i18n/translations.js";
import "../../src/index.css";

if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(location.hostname)) throw new Error("Local only");
const params = new URLSearchParams(location.search);
localStorage.setItem("cleanflow-language", params.get("lang") || "en");
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
const fixture = buildCompactLifecycleFixtures(new Date());
const longJobs = [...fixture.jobs, ...fixture.jobs.map((job, index) => ({ ...job, id: `${job.id}-more`, propertyName: `Demo Property ${String(index + 11).padStart(2, "0")}`, scheduledDate: fixture.jobs[9].scheduledDate }))];
longJobs[3] = { ...longJobs[3], assignedCleanerIds: ["demo-alpha", "demo-beta"] };
longJobs[6] = { ...longJobs[6], scheduledStart: "" };
longJobs[8] = { ...longJobs[8], archivedAt: "2026-10-01T12:00:00Z" };
window.__servicesHarness = { mutations: 0, opens: [], loadMore: 0 };
function Harness() {
  const { translate } = useTranslation();
  const [filters, setFilters] = useState(createJobListFilters);
  const [state, setState] = useState(params.get("state") || "normal");
  const [selected, setSelected] = useState(null);
  const [restoreScroll, setRestoreScroll] = useState(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [more, setMore] = useState(true);
  // Simulates the existing bounded provider filters, with synthetic memory only.
  let jobs = state === "empty" || state === "loading" ? [] : longJobs;
  if (!showExcluded) jobs = jobs.filter(job => !job.archivedAt);
  if (filters.status !== "all") jobs = jobs.filter(job => {
    const status = { "needs-assignment": ["UNASSIGNED", "OFFERED"], "in-progress": ["IN_PROGRESS"], completed: ["COMPLETED"], assigned: ["ASSIGNED"], offered: ["OFFERED"] }[filters.status];
    return status?.includes(job.operationalStatus);
  });
  if (filters.datePreset === "today") jobs = jobs.filter(job => job.scheduledDate === fixture.jobs[0].scheduledDate);
  const detail = getServiceLifecycleFixture("assigned");
  const noWrite = async () => { window.__servicesHarness.mutations++; throw new Error("Synthetic harness cannot persist"); };
  return <main className="app-shell"><section className="foundation" aria-labelledby="page-title">
    <div className="environment-banner">SANDBOX · TEST DATA · LOCAL ONLY</div>
    <header className="foundation__header"><div className="brand-block"><p className="eyebrow">{translate("brand.operationsPlatform")}</p><h1 id="page-title">CleanFlow</h1>
      <nav className="main-navigation" aria-label={translate("common.mainNavigation")}>{["dashboard", "properties", "jobs", "cleaners", "payouts", "clients"].map(section => <button key={section} type="button" className="navigation-button" aria-current={section === "jobs" ? "page" : undefined}>{translate(`navigation.${section}`)}</button>)}</nav>
    </div></header>
    {state === "create" ? <CreateCleaningForm properties={fixture.properties} onBack={() => setState("normal")} onCreated={noWrite} /> : selected ? <JobDetail {...detail} job={{ ...detail.job, ...selected }} property={null} availableCleaners={detail.knownCleaners}
      onBack={() => setSelected(null)} onUpdatePrices={noWrite} onUpdateDetails={noWrite} onUpdateSchedule={noWrite} onArchive={noWrite} onRestore={noWrite}
      onSaveDataProvenance={noWrite} onAssignCleanerDirectly={noWrite} onOpenChecklistRun={() => {}} /> : <ServicesV2Pilot
      jobs={jobs} cleaners={fixture.cleaners} properties={fixture.properties} filters={filters}
      isLoading={state === "loading" || state === "refresh"} hasError={state === "error"}
      onFiltersChange={updates => setFilters(current => ({ ...current, ...updates }))} onClearFilters={() => setFilters(createJobListFilters())}
      onSelect={(job, anchor) => { window.__servicesHarness.opens.push(job.id); setRestoreScroll(anchor); setSelected(job); }}
      onCreate={() => setState("create")} hasMore={more} isLoadingMore={state === "more"}
      onLoadMore={() => { window.__servicesHarness.loadMore++; setMore(false); }}
      onRetry={() => setState("normal")} canManageExcluded={true} showExcluded={showExcluded} onToggleExcluded={() => setShowExcluded(value => !value)}
      restoreScroll={restoreScroll} onScrollRestored={() => setRestoreScroll(null)} />}
  </section></main>;
}
createRoot(document.getElementById("root")).render(<TranslationProvider><Harness /></TranslationProvider>);

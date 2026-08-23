import { useEffect, useState } from "react";
import {
  createCleaner,
  getAllCleaners,
  getCleaners,
  updateCleaner,
} from "./features/cleaners/cleanerService.js";
import { getOperationalDashboard } from "./features/dashboard/dashboardService.js";
import {
  createJobOffers,
  getJobOffers,
  respondToJobOffer,
} from "./features/jobs/jobOfferService.js";
import {
  createIssue,
  getJobIssues,
  resolveIssue,
} from "./features/issues/issueService.js";
import {
  assignCleanerToJob,
  completeInProgressJob,
  createJob,
  getJobs,
  startAssignedJob,
} from "./features/jobs/jobService.js";
import { languageOptions, useTranslation } from "./i18n/translations.js";
import { getProperties } from "./features/properties/propertyService.js";

const content = {
  productName: "CleanFlow",
  unnamedProperty: "Unnamed property",
  missingValue: "Not provided",
};

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

const localeByLanguage = { en: "en-US", pt: "pt-BR", es: "es-ES" };
const supportedCleanerLanguages = ["en", "pt", "es"];

function normalizedCleanerLanguage(language) {
  return supportedCleanerLanguages.includes(language) ? language : "en";
}

function normalizedCleanerText(value) {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeCleanerPhone(phone) {
  return phone.trim().replace(/[\s()-]/g, "");
}

function createEmptyCleanerForm(defaultPreferredLanguage) {
  return {
    name: "",
    phone: "",
    preferredLanguage: normalizedCleanerLanguage(defaultPreferredLanguage),
    active: true,
  };
}

function cleanerToForm(cleaner, defaultPreferredLanguage) {
  if (!cleaner) {
    return createEmptyCleanerForm(defaultPreferredLanguage);
  }

  return {
    name: normalizedCleanerText(cleaner.name),
    phone: normalizedCleanerText(cleaner.phone),
    preferredLanguage: normalizedCleanerLanguage(
      cleaner.preferredLanguage || defaultPreferredLanguage,
    ),
    active: typeof cleaner.active === "boolean" ? cleaner.active : true,
  };
}

function formatPrice(value, translate = null, language = "en") {
  if (!hasValue(value)) {
    return translate ? translate("common.notProvided") : content.missingValue;
  }

  return new Intl.NumberFormat(localeByLanguage[language] || "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value, translate = null, language = "en") {
  if (!value) {
    return translate ? translate("common.notProvided") : content.missingValue;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeByLanguage[language] || "en-US", {
    dateStyle: "medium",
  }).format(date);
}

function formatCreatedAt(value, language = "en") {
  if (!value || typeof value.toDate !== "function") {
    return null;
  }

  return new Intl.DateTimeFormat(localeByLanguage[language] || "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value.toDate());
}

const statusTranslationKeys = {
    UNASSIGNED: "status.unassigned",
    OFFERED: "status.offered",
    ASSIGNED: "status.assigned",
    IN_PROGRESS: "status.inProgress",
    COMPLETED: "status.completed",
    PENDING: "status.pending",
    INTERESTED: "status.interested",
    DECLINED: "status.declined",
    OPEN: "status.open",
    RESOLVED: "status.resolved",
};

const statusFallbackMessages = {
  "status.unassigned": "Unassigned", "status.offered": "Offered", "status.assigned": "Assigned",
  "status.inProgress": "In progress", "status.completed": "Completed", "status.pending": "Pending",
  "status.interested": "Interested", "status.declined": "Not available", "status.open": "Open",
  "status.resolved": "Resolved",
};

function formatStatus(status, translate = null) {
  const key = statusTranslationKeys[status];

  return key && translate ? translate(key) : key ? statusFallbackMessages[key] : content.missingValue;
}

function formatOperationalStatus(status, translate = null) {
  return formatStatus(status, translate);
}

function App() {
  const { language, setLanguage, translate } = useTranslation();
  const [properties, setProperties] = useState([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);
  const [hasPropertyError, setHasPropertyError] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [hasJobError, setHasJobError] = useState(false);
  const [cleaners, setCleaners] = useState([]);
  const [isLoadingCleaners, setIsLoadingCleaners] = useState(false);
  const [hasCleanerError, setHasCleanerError] = useState(false);
  const [directoryCleaners, setDirectoryCleaners] = useState([]);
  const [isLoadingDirectoryCleaners, setIsLoadingDirectoryCleaners] = useState(false);
  const [hasDirectoryCleanersError, setHasDirectoryCleanersError] = useState(false);
  const [jobOffers, setJobOffers] = useState([]);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);
  const [hasOffersError, setHasOffersError] = useState(false);
  const [jobIssues, setJobIssues] = useState([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [hasIssuesError, setHasIssuesError] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [hasDashboardError, setHasDashboardError] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [view, setView] = useState("dashboard");
  const [jobDetailOrigin, setJobDetailOrigin] = useState("jobs");
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [createdJob, setCreatedJob] = useState(null);
  const [offersSentCount, setOffersSentCount] = useState(null);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [selectedCleaner, setSelectedCleaner] = useState(null);
  const [savedCleaner, setSavedCleaner] = useState(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadProperties() {
      try {
        const loadedProperties = await getProperties();

        if (isCurrent) {
          setProperties(loadedProperties);
        }
      } catch {
        if (isCurrent) {
          setHasPropertyError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingProperties(false);
        }
      }
    }

    loadProperties();

    return () => {
      isCurrent = false;
    };
  }, []);

  async function refreshDashboard() {
    setIsLoadingDashboard(true);
    setHasDashboardError(false);

    try {
      const loadedDashboard = await getOperationalDashboard();
      setDashboardData(loadedDashboard);
      setJobs(loadedDashboard.jobs);
    } catch {
      setHasDashboardError(true);
    } finally {
      setIsLoadingDashboard(false);
    }
  }

  useEffect(() => {
    if (view === "dashboard") {
      refreshDashboard();
    }
  }, [view]);

  useEffect(() => {
    if (view !== "cleaner-list") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingDirectoryCleaners(true);
    setHasDirectoryCleanersError(false);

    async function loadDirectoryCleaners() {
      try {
        const loadedCleaners = await getAllCleaners();

        if (isCurrent) {
          setDirectoryCleaners(loadedCleaners);
        }
      } catch {
        if (isCurrent) {
          setHasDirectoryCleanersError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingDirectoryCleaners(false);
        }
      }
    }

    loadDirectoryCleaners();

    return () => {
      isCurrent = false;
    };
  }, [view]);

  useEffect(() => {
    if (view !== "job-list") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingJobs(true);
    setHasJobError(false);

    async function loadJobs() {
      try {
        const loadedJobs = await getJobs();

        if (isCurrent) {
          setJobs(loadedJobs);
        }
      } catch {
        if (isCurrent) {
          setHasJobError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingJobs(false);
        }
      }
    }

    loadJobs();

    return () => {
      isCurrent = false;
    };
  }, [view]);

  async function refreshJobOffers() {
    if (!selectedJob) {
      return;
    }

    setIsLoadingOffers(true);
    setHasOffersError(false);

    try {
      const loadedOffers = await getJobOffers(selectedJob.id);
      setJobOffers(loadedOffers);
    } catch {
      setHasOffersError(true);
    } finally {
      setIsLoadingOffers(false);
    }
  }

  async function refreshJobIssues() {
    if (!selectedJob) {
      return;
    }

    setIsLoadingIssues(true);
    setHasIssuesError(false);

    try {
      const loadedIssues = await getJobIssues(selectedJob.id);
      setJobIssues(loadedIssues);
    } catch {
      setHasIssuesError(true);
    } finally {
      setIsLoadingIssues(false);
    }
  }

  async function assignCleaner(offer) {
    if (!selectedJob) {
      return;
    }

    try {
      const assignedJob = await assignCleanerToJob(selectedJob.id, {
        id: offer.cleanerId,
        name: offer.cleanerName,
      });

      setSelectedJob(assignedJob);
      setJobs((currentJobs) =>
        currentJobs.map((job) => (job.id === assignedJob.id ? assignedJob : job)),
      );
    } catch (error) {
      if (error.job) {
        setSelectedJob(error.job);
        setJobs((currentJobs) =>
          currentJobs.map((job) => (job.id === error.job.id ? error.job : job)),
        );
      }

      throw error;
    }
  }

  async function startCleaning() {
    if (!selectedJob) {
      return;
    }

    try {
      const startedJob = await startAssignedJob(selectedJob.id);
      setSelectedJob(startedJob);
      setJobs((currentJobs) =>
        currentJobs.map((job) => (job.id === startedJob.id ? startedJob : job)),
      );
    } catch (error) {
      if (error.job) {
        setSelectedJob(error.job);
        setJobs((currentJobs) =>
          currentJobs.map((job) => (job.id === error.job.id ? error.job : job)),
        );
      }

      throw error;
    }
  }

  async function completeCleaning() {
    if (!selectedJob) {
      return;
    }

    try {
      const completedJob = await completeInProgressJob(selectedJob.id);
      setSelectedJob(completedJob);
      setJobs((currentJobs) =>
        currentJobs.map((job) => (job.id === completedJob.id ? completedJob : job)),
      );
    } catch (error) {
      if (error.job) {
        setSelectedJob(error.job);
        setJobs((currentJobs) =>
          currentJobs.map((job) => (job.id === error.job.id ? error.job : job)),
        );
      }

      throw error;
    }
  }

  async function resolveJobIssue({ issueId, resolutionNote }) {
    if (!selectedJob) {
      return;
    }

    try {
      const resolvedIssue = await resolveIssue({
        jobId: selectedJob.id,
        issueId,
        resolutionNote,
      });

      setJobIssues((currentIssues) =>
        currentIssues.map((issue) =>
          issue.id === resolvedIssue.id ? resolvedIssue : issue,
        ),
      );
    } catch (error) {
      if (error.issue) {
        setJobIssues((currentIssues) =>
          currentIssues.map((issue) =>
            issue.id === error.issue.id ? error.issue : issue,
          ),
        );
      }

      throw error;
    }
  }

  useEffect(() => {
    if (view === "job-detail" && selectedJob) {
      refreshJobOffers();
      refreshJobIssues();
    }
  }, [view, selectedJob]);

  useEffect(() => {
    if (view !== "offer-cleaners") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingCleaners(true);
    setHasCleanerError(false);

    async function loadCleaners() {
      try {
        const loadedCleaners = await getCleaners();

        if (isCurrent) {
          setCleaners(loadedCleaners);
        }
      } catch {
        if (isCurrent) {
          setHasCleanerError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingCleaners(false);
        }
      }
    }

    loadCleaners();

    return () => {
      isCurrent = false;
    };
  }, [view]);

  function showProperties() {
    setActiveSection("properties");
    setSelectedProperty(null);
    setSelectedJob(null);
    setCreatedJob(null);
    setOffersSentCount(null);
    setSelectedOffer(null);
    setJobIssues([]);
    setView("property-list");
  }

  function showDashboard() {
    setActiveSection("dashboard");
    setSelectedProperty(null);
    setSelectedJob(null);
    setSelectedOffer(null);
    setJobIssues([]);
    setView("dashboard");
  }

  function showJobs() {
    setActiveSection("jobs");
    setSelectedProperty(null);
    setSelectedJob(null);
    setOffersSentCount(null);
    setSelectedOffer(null);
    setJobIssues([]);
    setView("job-list");
  }

  function showCleaners() {
    setActiveSection("cleaners");
    setSelectedProperty(null);
    setSelectedJob(null);
    setSelectedCleaner(null);
    setSavedCleaner(null);
    setSelectedOffer(null);
    setJobIssues([]);
    setView("cleaner-list");
  }

  function openCleaner(cleaner) {
    setActiveSection("cleaners");
    setSelectedCleaner(cleaner);
    setSavedCleaner(null);
    setView("cleaner-edit");
  }

  function showNewCleaner() {
    setSelectedCleaner(null);
    setSavedCleaner(null);
    setView("cleaner-create");
  }

  function openProperty(property) {
    setActiveSection("properties");
    setSelectedProperty(property);
    setView("property-detail");
  }

  function openJob(job) {
    setActiveSection("jobs");
    setJobDetailOrigin("jobs");
    setSelectedJob(job);
    setJobOffers([]);
    setHasOffersError(false);
    setIsLoadingOffers(true);
    setJobIssues([]);
    setHasIssuesError(false);
    setIsLoadingIssues(true);
    setSelectedOffer(null);
    setView("job-detail");
  }

  function openDashboardJob(job) {
    setActiveSection("dashboard");
    setJobDetailOrigin("dashboard");
    setSelectedJob(job);
    setJobOffers([]);
    setHasOffersError(false);
    setIsLoadingOffers(true);
    setJobIssues([]);
    setHasIssuesError(false);
    setIsLoadingIssues(true);
    setSelectedOffer(null);
    setView("job-detail");
  }

  function showOfferCleaners() {
    setOffersSentCount(null);
    setView("offer-cleaners");
  }

  function openCleanerOffer(offer) {
    setSelectedOffer(offer);
    setView("cleaner-offer");
  }

  function openAssignedCleanerJob() {
    setSelectedOffer(null);
    setView("cleaner-job");
  }

  function returnToJobDetail() {
    setSelectedOffer(null);
    setJobOffers([]);
    setHasOffersError(false);
    setIsLoadingOffers(true);
    setJobIssues([]);
    setHasIssuesError(false);
    setIsLoadingIssues(true);
    setView("job-detail");
  }

  return (
    <main className="app-shell">
      <section
        className={`foundation${view === "dashboard" ? " foundation--dashboard" : ""}`}
        aria-labelledby="page-title"
      >
        <header className="foundation__header">
          <div className="brand-block">
            <p className="eyebrow">{translate("brand.operationsPlatform")}</p>
            <h1 id="page-title">{content.productName}</h1>
            <MainNavigation
              activeSection={activeSection}
              translate={translate}
              onShowDashboard={showDashboard}
              onShowProperties={showProperties}
              onShowJobs={showJobs}
              onShowCleaners={showCleaners}
            />
          </div>
          <div className="header-actions">
            <LanguageSelector language={language} onChange={setLanguage} />
            <span className="badge">{translate("brand.foundationBuild")}</span>
          </div>
        </header>

        {view === "dashboard" && (
          <Dashboard
            dashboardData={dashboardData}
            isLoading={isLoadingDashboard}
            hasError={hasDashboardError}
            translate={translate}
            onRefresh={refreshDashboard}
            onOpenJob={openDashboardJob}
          />
        )}

        {view === "property-list" && (
          <PropertyList
            properties={properties}
            isLoading={isLoadingProperties}
            hasError={hasPropertyError}
            onSelect={openProperty}
          />
        )}

        {view === "property-detail" && selectedProperty && (
          <PropertyDetail
            property={selectedProperty}
            onBack={showProperties}
            onCreateCleaning={() => setView("create-cleaning")}
          />
        )}

        {view === "create-cleaning" && selectedProperty && (
          <CreateCleaningForm
            property={selectedProperty}
            onBack={() => setView("property-detail")}
            onCreated={(job) => {
              setCreatedJob(job);
              setView("create-success");
            }}
          />
        )}

        {view === "create-success" && createdJob && (
          <CleaningSuccess
            job={createdJob}
            onBack={showProperties}
            onViewJob={() => openJob(createdJob)}
          />
        )}

        {view === "job-list" && (
          <JobList
            jobs={jobs}
            isLoading={isLoadingJobs}
            hasError={hasJobError}
            onSelect={openJob}
          />
        )}

        {view === "cleaner-list" && (
          <CleanerDirectory
            cleaners={directoryCleaners}
            isLoading={isLoadingDirectoryCleaners}
            hasError={hasDirectoryCleanersError}
            onSelect={openCleaner}
            onCreate={showNewCleaner}
          />
        )}

        {view === "cleaner-create" && (
          <CleanerProfileForm
            key="new-cleaner"
            defaultPreferredLanguage={language}
            onBack={showCleaners}
            onSaved={(cleaner) => {
              setSavedCleaner(cleaner);
              setView("cleaner-success");
            }}
          />
        )}

        {view === "cleaner-edit" && selectedCleaner && (
          <CleanerProfileForm
            key={selectedCleaner.id}
            cleaner={selectedCleaner}
            defaultPreferredLanguage={language}
            onBack={showCleaners}
            onSaved={(cleaner) => {
              setSavedCleaner(cleaner);
              setView("cleaner-success");
            }}
          />
        )}

        {view === "cleaner-success" && savedCleaner && (
          <CleanerProfileSuccess cleaner={savedCleaner} onBack={showCleaners} />
        )}

        {view === "job-detail" && selectedJob && (
          <JobDetail
            job={selectedJob}
            offers={jobOffers}
            isLoadingOffers={isLoadingOffers}
            hasOffersError={hasOffersError}
            issues={jobIssues}
            isLoadingIssues={isLoadingIssues}
            hasIssuesError={hasIssuesError}
            onBack={jobDetailOrigin === "dashboard" ? showDashboard : showJobs}
            onOfferToCleaners={showOfferCleaners}
            onRefreshOffers={refreshJobOffers}
            onRefreshIssues={refreshJobIssues}
            onSimulateOffer={openCleanerOffer}
            onAssignCleaner={assignCleaner}
            onSimulateAssignedCleaner={openAssignedCleanerJob}
            onResolveIssue={resolveJobIssue}
          />
        )}

        {view === "offer-cleaners" && selectedJob && (
          <OfferCleaners
            job={selectedJob}
            cleaners={cleaners}
            isLoading={isLoadingCleaners}
            hasError={hasCleanerError}
            onBack={returnToJobDetail}
            onSent={(count, updatedJob) => {
              setSelectedJob(updatedJob);
              setJobs((currentJobs) =>
                currentJobs.map((job) =>
                  job.id === updatedJob.id ? updatedJob : job,
                ),
              );
              setOffersSentCount(count);
              setView("offers-success");
            }}
          />
        )}

        {view === "offers-success" && selectedJob && offersSentCount !== null && (
          <OffersSuccess
            count={offersSentCount}
            onBackToJob={returnToJobDetail}
            onBackToJobs={showJobs}
          />
        )}

        {view === "cleaner-offer" && selectedJob && selectedOffer && (
          <CleanerOfferSimulation
            job={selectedJob}
            offer={selectedOffer}
            onBackToJob={returnToJobDetail}
          />
        )}

        {view === "cleaner-job" && selectedJob && (
          <AssignedCleanerJob
            job={selectedJob}
            onBackToJob={returnToJobDetail}
            onStartCleaning={startCleaning}
            onCompleteCleaning={completeCleaning}
            onReportIssue={() => setView("issue-form")}
          />
        )}

        {view === "issue-form" && selectedJob && (
          <IssueForm
            job={selectedJob}
            onBack={() => setView("cleaner-job")}
            onSubmitted={() => setView("issue-success")}
          />
        )}

        {view === "issue-success" && selectedJob && (
          <IssueSuccess onBackToCleaning={() => setView("cleaner-job")} />
        )}
      </section>
    </main>
  );
}

function LanguageSelector({ language, onChange }) {
  const { translate } = useTranslation();

  return (
    <select
      className="language-selector"
      value={language}
      aria-label={translate("common.language")}
      onChange={(event) => onChange(event.target.value)}
    >
      {languageOptions.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function MainNavigation({
  activeSection,
  translate,
  onShowDashboard,
  onShowProperties,
  onShowJobs,
  onShowCleaners,
}) {
  return (
    <nav className="main-navigation" aria-label={translate("common.mainNavigation")}>
      <button
        className="navigation-button"
        type="button"
        aria-current={activeSection === "dashboard" ? "page" : undefined}
        onClick={onShowDashboard}
      >
        {translate("navigation.dashboard")}
      </button>
      <button
        className="navigation-button"
        type="button"
        aria-current={activeSection === "properties" ? "page" : undefined}
        onClick={onShowProperties}
      >
        {translate("navigation.properties")}
      </button>
      <button
        className="navigation-button"
        type="button"
        aria-current={activeSection === "jobs" ? "page" : undefined}
        onClick={onShowJobs}
      >
        {translate("navigation.jobs")}
      </button>
      <button
        className="navigation-button"
        type="button"
        aria-current={activeSection === "cleaners" ? "page" : undefined}
        onClick={onShowCleaners}
      >
        {translate("navigation.cleaners")}
      </button>
    </nav>
  );
}

function Dashboard({ dashboardData, isLoading, hasError, translate, onRefresh, onOpenJob }) {
  const { language } = useTranslation();
  const [operationFilter, setOperationFilter] = useState("active");

  if (isLoading) {
    return <StateCard message={translate("dashboard.loading")} status="status" />;
  }

  if (hasError) {
    return (
      <section className="dashboard-state" aria-live="polite">
        <StateCard message={translate("dashboard.error")} status="alert" isError />
        <button className="button" type="button" onClick={onRefresh}>
          {translate("dashboard.refresh")}
        </button>
      </section>
    );
  }

  const jobs = dashboardData?.jobs || [];
  const issues = dashboardData?.issues || [];
  const offersByJob = dashboardData?.offersByJob || {};
  const openIssues = issues.filter((issue) => issue.status === "OPEN");
  const jobsNeedingAssignment = jobs.filter((job) =>
    ["UNASSIGNED", "OFFERED"].includes(job.operationalStatus),
  );
  const inProgressJobs = jobs.filter(
    (job) => job.operationalStatus === "IN_PROGRESS",
  );
  const completedJobs = jobs.filter(
    (job) => job.operationalStatus === "COMPLETED",
  );
  const activeOperationJobs = jobs.filter((job) =>
    ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS"].includes(
      job.operationalStatus,
    ),
  );
  const offeredJobsWithInterest = jobs.filter(
    (job) =>
      job.operationalStatus === "OFFERED" &&
      !job.assignedCleanerId &&
      (offersByJob[job.id] || []).some((offer) => offer.status === "INTERESTED"),
  );
  const openIssueJobIds = new Set(openIssues.map((issue) => issue.job.id));
  const attentionItems = [
    ...sortIssuesByJobScheduledDate(openIssues).map((issue) => ({
      id: `issue-${issue.id}`,
      job: issue.job,
      label: translate("dashboard.openIssue"),
      detail: `${formatIssueCategory(issue.category, translate)} — ${issue.description}`,
      status: formatOperationalStatus(issue.job.operationalStatus, translate),
      action: translate("dashboard.reviewIssue"),
    })),
    ...sortByScheduledDate(offeredJobsWithInterest).map((job) => {
      const interestedNames = (offersByJob[job.id] || [])
        .filter((offer) => offer.status === "INTERESTED")
        .map((offer) => offer.cleanerName)
        .filter(Boolean)
        .join(", ");

      return {
        id: `interest-${job.id}`,
        job,
        label: translate("dashboard.cleanerInterested"),
        detail: interestedNames || translate("dashboard.cleanerInterestedDescription"),
        status: formatOperationalStatus(job.operationalStatus, translate),
        action: translate("dashboard.reviewAndAssign"),
      };
    }),
    ...sortByScheduledDate(
      jobsNeedingAssignment.filter(
        (job) =>
          job.operationalStatus === "UNASSIGNED" ||
          !(offersByJob[job.id] || []).some(
            (offer) => offer.status === "INTERESTED",
          ),
      ),
    ).map((job) => ({
      id: `needs-assignment-${job.id}`,
      job,
      label:
        job.operationalStatus === "UNASSIGNED"
          ? translate("dashboard.needsAssignment")
          : translate("dashboard.offersAwaitingResponse"),
      detail:
        job.operationalStatus === "UNASSIGNED"
          ? translate("dashboard.noOffers")
          : translate("dashboard.noInterestedCleaners"),
      status: formatOperationalStatus(job.operationalStatus, translate),
      action:
        job.operationalStatus === "UNASSIGNED" ? translate("dashboard.sendOffers") : translate("dashboard.reviewOffers"),
    })),
  ];
  const filterOptions = {
    active: {
      label: translate("dashboard.activeOperation"),
      jobs: activeOperationJobs,
    },
    needsAssignment: {
      label: translate("dashboard.needsAssignment"),
      jobs: jobsNeedingAssignment,
    },
    inProgress: {
      label: translate("dashboard.inProgress"),
      jobs: inProgressJobs,
    },
    completed: {
      label: translate("dashboard.completed"),
      jobs: completedJobs,
    },
    openIssues: {
      label: translate("dashboard.jobsWithOpenIssues"),
      jobs: jobs.filter((job) => openIssueJobIds.has(job.id)),
    },
  };
  const visibleOperation = sortByScheduledDate(
    filterOptions[operationFilter]?.jobs || [],
  );

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard__intro">
        <div>
          <p className="eyebrow">{translate("dashboard.managerWorkspace")}</p>
          <h2 id="dashboard-title" className="dashboard__title">
            {translate("dashboard.title")}
          </h2>
          <p>{translate("dashboard.subtitle")}</p>
        </div>
        <button className="button" type="button" onClick={onRefresh}>
          {translate("dashboard.refresh")}
        </button>
      </div>

      {jobs.length === 0 ? (
        <StateCard message={translate("dashboard.noMatchingJobs")} />
      ) : (
        <>
          <div className="dashboard-summary" aria-label={translate("dashboard.operation")}>
            <SummaryCard label={translate("dashboard.totalJobs")} count={jobs.length} />
            <SummaryCard
              label={translate("dashboard.needsAssignment")}
              count={jobsNeedingAssignment.length}
              isActive={operationFilter === "needsAssignment"}
              onClick={() => setOperationFilter("needsAssignment")}
            />
            <SummaryCard
              label={translate("dashboard.inProgress")}
              count={inProgressJobs.length}
              isActive={operationFilter === "inProgress"}
              onClick={() => setOperationFilter("inProgress")}
            />
            <SummaryCard
              label={translate("dashboard.completed")}
              count={completedJobs.length}
              isActive={operationFilter === "completed"}
              onClick={() => setOperationFilter("completed")}
            />
            <SummaryCard
              label={translate("dashboard.openIssues")}
              count={openIssues.length}
              tone="attention"
              isActive={operationFilter === "openIssues"}
              onClick={() => setOperationFilter("openIssues")}
            />
          </div>

          <div className="dashboard-grid">
            <section className="dashboard-panel" aria-labelledby="attention-title">
              <div className="dashboard-panel__header">
                <div>
                  <p className="eyebrow">{translate("dashboard.priorities")}</p>
                  <h3 id="attention-title">{translate("dashboard.needsAttention")}</h3>
                </div>
              </div>

              {attentionItems.length === 0 ? (
                <p className="dashboard-empty">{translate("dashboard.noAttention")}</p>
              ) : (
                <div className="attention-list">
                  {attentionItems.map((item) => (
                    <button
                      key={item.id}
                      className="attention-item"
                      type="button"
                      onClick={() => onOpenJob(item.job)}
                    >
                      <span className="attention-item__label">{item.label}</span>
                      <strong>{item.job.propertyName || translate("properties.unnamed")}</strong>
                      <span>{item.detail}</span>
                      <small>
                        {item.status} · {formatDate(item.job.scheduledDate, translate, language)}
                      </small>
                      <span className="attention-item__action">
                        {item.action} <span aria-hidden="true">→</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="dashboard-panel" aria-labelledby="completed-title">
              <div className="dashboard-panel__header">
                <div>
                  <p className="eyebrow">{translate("dashboard.history")}</p>
                  <h3 id="completed-title">{translate("dashboard.recentlyCompleted")}</h3>
                </div>
              </div>

              {completedJobs.length === 0 ? (
                <p className="dashboard-empty">{translate("dashboard.noCompleted")}</p>
              ) : (
                <div className="recent-list">
                  {sortByCompletedAt(completedJobs).map((job) => (
                    <button
                      key={job.id}
                      className="recent-item"
                      type="button"
                      onClick={() => onOpenJob(job)}
                    >
                      <strong>{job.propertyName || translate("properties.unnamed")}</strong>
                      <span>{formatDate(job.scheduledDate, translate, language)}</span>
                      <span>{job.assignedCleanerName || translate("common.notProvided")}</span>
                      <small>{formatCreatedAt(job.completedAt, language) || translate("dashboard.completionUnavailable")}</small>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="dashboard-panel dashboard-panel--operation" aria-labelledby="operation-title">
            <div className="dashboard-panel__header">
              <div>
                <p className="eyebrow">{translate("dashboard.schedule")}</p>
                <h3 id="operation-title">{translate("dashboard.operation")}</h3>
                <p className="dashboard-panel__subtitle">
                  {filterOptions[operationFilter]?.label}
                </p>
              </div>
              {operationFilter !== "active" && (
                <button
                  className="button"
                  type="button"
                  onClick={() => setOperationFilter("active")}
                >
                  {translate("dashboard.showActiveJobs")}
                </button>
              )}
            </div>

            {visibleOperation.length === 0 ? (
              <p className="dashboard-empty">{translate("dashboard.noMatchingJobs")}</p>
            ) : (
              <div className="operation-list">
                {visibleOperation.map((job) => (
                  <button
                    key={job.id}
                    className="operation-item"
                    type="button"
                    onClick={() => onOpenJob(job)}
                  >
                    <span>{formatDate(job.scheduledDate, translate, language)}</span>
                    <strong>{job.propertyName || translate("properties.unnamed")}</strong>
                    <span className="operation-item__status">
                      {formatOperationalStatus(job.operationalStatus, translate)}
                    </span>
                    <span>{job.assignedCleanerName || translate("dashboard.notAssigned")}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function SummaryCard({ label, count, tone, isActive, onClick }) {
  const className = [
    "summary-card",
    tone ? `summary-card--${tone}` : "",
    isActive ? "summary-card--active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!onClick) {
    return (
      <article className={className}>
        <span>{label}</span>
        <strong>{count}</strong>
      </article>
    );
  }

  return (
    <button
      className={className}
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function sortByScheduledDate(items) {
  return [...items].sort((firstItem, secondItem) =>
    (firstItem.scheduledDate || "").localeCompare(secondItem.scheduledDate || ""),
  );
}

function sortByCompletedAt(jobs) {
  return [...jobs].sort((firstJob, secondJob) => {
    const firstCompletedAt = firstJob.completedAt?.toMillis?.() || 0;
    const secondCompletedAt = secondJob.completedAt?.toMillis?.() || 0;

    return secondCompletedAt - firstCompletedAt;
  });
}

function sortIssuesByJobScheduledDate(issues) {
  return [...issues].sort((firstIssue, secondIssue) =>
    (firstIssue.job.scheduledDate || "").localeCompare(
      secondIssue.job.scheduledDate || "",
    ),
  );
}

function formatIssueCategory(category, translate = null) {
  const key = {
    ACCESS: "issueCategory.access",
    SUPPLIES: "issueCategory.supplies",
    BROKEN_ITEM: "issueCategory.brokenItem",
    HEAVY_CLEANING: "issueCategory.heavyCleaning",
    OTHER: "issueCategory.other",
  }[category];

  return key && translate ? translate(key) : category || content.missingValue;
}

function PropertyList({ properties, isLoading, hasError, onSelect }) {
  const { translate } = useTranslation();
  if (isLoading) {
    return <StateCard message={translate("properties.loading")} status="status" />;
  }

  if (hasError) {
    return <StateCard message={translate("properties.error")} status="alert" isError />;
  }

  if (properties.length === 0) {
    return <StateCard message={translate("properties.empty")} />;
  }

  return (
    <div className="property-list">
      {properties.map((property) => {
        const propertyName = property.name || translate("properties.unnamed");

        return (
          <button
            key={property.id}
            className="property-card"
            type="button"
            aria-label={translate("properties.view", { property: propertyName })}
            onClick={() => onSelect(property)}
          >
            <span className="property-card__title">{propertyName}</span>

            <span className="property-card__label">
              <span className="status-dot" aria-hidden="true" />
              {translate("common.property")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PropertyDetail({ property, onBack, onCreateCleaning }) {
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
        <button
          className="button button--primary"
          type="button"
          onClick={onCreateCleaning}
        >
          {translate("properties.createCleaning")}
        </button>
      </div>
    </section>
  );
}

function CreateCleaningForm({ property, onBack, onCreated }) {
  const { translate } = useTranslation();
  const propertyName = property.name ?? "";
  const clientName = property.clientName ?? "";
  const displayPropertyName = propertyName || translate("properties.unnamed");
  const displayClientName = clientName || translate("common.notProvided");
  const [formValues, setFormValues] = useState({
    scheduledDate: "",
    clientPrice: property.defaultClientPrice ?? "",
    cleanerPayout: property.defaultCleanerPrice ?? "",
    notes: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setHasSaveError(false);

    const clientPrice =
      formValues.clientPrice === "" ? null : Number(formValues.clientPrice);
    const cleanerPayout =
      formValues.cleanerPayout === ""
        ? null
        : Number(formValues.cleanerPayout);
    const notes = formValues.notes.trim();

    try {
      const jobId = await createJob({
        propertyId: property.id,
        propertyName,
        clientName,
        scheduledDate: formValues.scheduledDate,
        clientPrice,
        cleanerPayout,
        notes,
      });

      onCreated({
        id: jobId,
        propertyId: property.id,
        propertyName,
        clientName,
        scheduledDate: formValues.scheduledDate,
        clientPrice,
        cleanerPayout,
        notes,
        operationalStatus: "UNASSIGNED",
      });
    } catch {
      setHasSaveError(true);
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="create-cleaning-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("jobs.new")}</p>
      <h2 id="create-cleaning-title" className="panel__title">
        {translate("jobs.create")}
      </h2>

      <form className="cleaning-form" onSubmit={handleSubmit}>
        <label>
          {translate("common.property")}
          <input type="text" value={displayPropertyName} readOnly />
        </label>

        <label>
          {translate("common.client")}
          <input type="text" value={displayClientName} readOnly />
        </label>

        <label>
          {translate("common.date")}
          <input
            type="date"
            name="scheduledDate"
            value={formValues.scheduledDate}
            onChange={updateField}
            required
          />
        </label>

        <div className="form-row">
          <label>
            {translate("jobs.clientPrice")}
            <input
              type="number"
              name="clientPrice"
              min="0"
              step="0.01"
              value={formValues.clientPrice}
              onChange={updateField}
            />
          </label>

          <label>
            {translate("jobs.cleanerPayout")}
            <input
              type="number"
              name="cleanerPayout"
              min="0"
              step="0.01"
              value={formValues.cleanerPayout}
              onChange={updateField}
            />
          </label>
        </div>

        <label>
          {translate("common.notes")}
          <textarea
            name="notes"
            rows="4"
            value={formValues.notes}
            onChange={updateField}
          />
        </label>

        <label>
          {translate("common.status")}
          <input type="text" value={translate("status.unassigned")} readOnly />
        </label>

        {hasSaveError && (
          <p className="form-error" role="alert">
            {translate("jobs.createError")}
          </p>
        )}

        <div className="button-row">
          <button
            className="button button--primary"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? translate("jobs.creating") : translate("jobs.create")}
          </button>
        </div>
      </form>
    </section>
  );
}

function CleaningSuccess({ job, onBack, onViewJob }) {
  const { language, translate } = useTranslation();
  return (
    <section className="panel success-panel" aria-labelledby="success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">{translate("jobs.saved")}</p>
      <h2 id="success-title" className="panel__title">
        {translate("jobs.created")}
      </h2>
      <p className="success-panel__detail">
        {job.propertyName || translate("properties.unnamed")}
      </p>
      <p className="success-panel__date">{formatDate(job.scheduledDate, translate, language)}</p>

      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onViewJob}>
          {translate("jobs.viewJob")}
        </button>
        <button className="button" type="button" onClick={onBack}>
          {translate("jobs.backToProperties")}
        </button>
      </div>
    </section>
  );
}

function JobList({ jobs, isLoading, hasError, onSelect }) {
  const { language, translate } = useTranslation();
  if (isLoading) {
    return <StateCard message={translate("jobs.loading")} status="status" />;
  }

  if (hasError) {
    return <StateCard message={translate("jobs.error")} status="alert" isError />;
  }

  if (jobs.length === 0) {
    return <StateCard message={translate("jobs.empty")} />;
  }

  const sortedJobs = [...jobs].sort((firstJob, secondJob) =>
    (firstJob.scheduledDate || "").localeCompare(secondJob.scheduledDate || ""),
  );

  return (
    <section aria-labelledby="jobs-title">
      <p className="eyebrow">{translate("navigation.jobs")}</p>
      <h2 id="jobs-title" className="list-title">
        {translate("jobs.title")}
      </h2>

      <div className="job-list">
        {sortedJobs.map((job) => (
          <button
            key={job.id}
            className="job-card"
            type="button"
            aria-label={translate("properties.view", { property: job.propertyName || translate("properties.unnamed") })}
            onClick={() => onSelect(job)}
          >
            <span className="job-card__date">{formatDate(job.scheduledDate, translate, language)}</span>
            <span className="job-card__summary">
              <strong>{job.propertyName || translate("properties.unnamed")}</strong>
              <span>{job.clientName || translate("common.notProvided")}</span>
            </span>
            <span className="status-badge">
              {formatOperationalStatus(job.operationalStatus, translate)}
            </span>
            {(hasValue(job.clientPrice) || hasValue(job.cleanerPayout)) && (
              <span className="job-card__prices">
                {hasValue(job.clientPrice) && <span>{translate("common.client")} {formatPrice(job.clientPrice, translate, language)}</span>}
                {hasValue(job.cleanerPayout) && (
                  <span>{translate("common.cleaner")} {formatPrice(job.cleanerPayout, translate, language)}</span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function preferredLanguageLabel(preferredLanguage, translate) {
  return {
    en: translate("language.english"),
    pt: translate("language.portuguese"),
    es: translate("language.spanish"),
  }[preferredLanguage] || translate("common.notProvided");
}

function CleanerDirectory({ cleaners, isLoading, hasError, onSelect, onCreate }) {
  const { translate } = useTranslation();

  if (isLoading) {
    return <StateCard message={translate("cleaners.loading")} status="status" />;
  }

  if (hasError) {
    return <StateCard message={translate("cleaners.error")} status="alert" isError />;
  }

  const sortedCleaners = [...cleaners].sort((firstCleaner, secondCleaner) =>
    (firstCleaner.name || "").localeCompare(secondCleaner.name || ""),
  );

  return (
    <section aria-labelledby="cleaners-title">
      <div className="directory-heading">
        <div>
          <p className="eyebrow">{translate("navigation.cleaners")}</p>
          <h2 id="cleaners-title" className="list-title">
            {translate("cleaners.title")}
          </h2>
        </div>
        <button className="button button--primary" type="button" onClick={onCreate}>
          {translate("cleaners.new")}
        </button>
      </div>

      {sortedCleaners.length === 0 ? (
        <StateCard message={translate("cleaners.empty")} />
      ) : (
        <div className="cleaner-directory">
          {sortedCleaners.map((cleaner) => (
            <button
              key={cleaner.id}
              className="cleaner-directory-card"
              type="button"
              aria-label={translate("cleaners.edit", {
                cleaner: cleaner.name || translate("common.notProvided"),
              })}
              onClick={() => onSelect(cleaner)}
            >
              <span className="cleaner-directory-card__identity">
                <strong>{cleaner.name || translate("common.notProvided")}</strong>
                <span>{cleaner.phone || translate("cleaners.noPhone")}</span>
              </span>
              <span>{preferredLanguageLabel(cleaner.preferredLanguage, translate)}</span>
              <span className="status-badge">
                {cleaner.active === false
                  ? translate("common.inactive")
                  : translate("common.active")}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function CleanerProfileForm({ cleaner, defaultPreferredLanguage, onBack, onSaved }) {
  const { translate } = useTranslation();
  const isEditing = Boolean(cleaner);
  const [formValues, setFormValues] = useState(() =>
    cleanerToForm(cleaner, defaultPreferredLanguage),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setFormValues(cleanerToForm(cleaner, defaultPreferredLanguage));
    setFormError("");
    setIsSaving(false);
  }, [cleaner, defaultPreferredLanguage]);

  function updateField(event) {
    const { name, value, checked, type } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function saveCleaner(event) {
    event.preventDefault();
    const name = formValues.name.trim();
    const phone = normalizeCleanerPhone(formValues.phone);

    if (!name) {
      setFormError(translate("cleaners.nameRequired"));
      return;
    }

    if (!phone) {
      setFormError(translate("cleaners.phoneRequired"));
      return;
    }

    if (phone && !/^\+\d{7,15}$/.test(phone)) {
      setFormError(translate("cleaners.phoneInvalid"));
      return;
    }

    if (!supportedCleanerLanguages.includes(formValues.preferredLanguage)) {
      setFormError(translate("cleaners.preferredLanguageRequired"));
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const cleanerValues = {
        name,
        phone,
        preferredLanguage: formValues.preferredLanguage,
        active: formValues.active,
      };
      const savedProfile = isEditing
        ? await updateCleaner(cleaner.id, cleanerValues)
        : await createCleaner(cleanerValues);

      onSaved({ ...savedProfile, wasCreated: !isEditing });
    } catch {
      setFormError(
        translate(isEditing ? "cleaners.updateError" : "cleaners.createError"),
      );
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="cleaner-profile-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("navigation.cleaners")}</p>
      <h2 id="cleaner-profile-title" className="panel__title">
        {translate(isEditing ? "cleaners.editTitle" : "cleaners.createTitle")}
      </h2>

      <form className="cleaning-form" noValidate onSubmit={saveCleaner}>
        <label>
          {translate("cleaners.name")}
          <input name="name" value={formValues.name} onChange={updateField} required />
        </label>

        <label>
          {translate("cleaners.phone")}
          <input
            type="tel"
            name="phone"
            value={formValues.phone}
            placeholder={translate("cleaners.phoneExample")}
            autoComplete="off"
            inputMode="tel"
            onChange={updateField}
            required
          />
        </label>

        <label>
          {translate("cleaners.preferredLanguage")}
          <select
            name="preferredLanguage"
            value={formValues.preferredLanguage}
            onChange={updateField}
            required
          >
            <option value="en">{translate("language.english")}</option>
            <option value="pt">{translate("language.portuguese")}</option>
            <option value="es">{translate("language.spanish")}</option>
          </select>
        </label>

        <label className="cleaner-active-field">
          <input
            type="checkbox"
            name="active"
            checked={formValues.active}
            onChange={updateField}
          />
          {translate("common.active")}
        </label>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={isSaving}>
            {isSaving ? translate("cleaners.saving") : translate("cleaners.save")}
          </button>
        </div>
      </form>
    </section>
  );
}

function CleanerProfileSuccess({ cleaner, onBack }) {
  const { translate } = useTranslation();

  return (
    <section className="panel success-panel" aria-labelledby="cleaner-success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">{translate("navigation.cleaners")}</p>
      <h2 id="cleaner-success-title" className="panel__title">
        {translate(cleaner.wasCreated ? "cleaners.created" : "cleaners.updated")}
      </h2>
      <p className="success-panel__detail">{cleaner.name}</p>
      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onBack}>
          {translate("cleaners.backToDirectory")}
        </button>
      </div>
    </section>
  );
}

function JobDetail({
  job,
  offers,
  isLoadingOffers,
  hasOffersError,
  issues,
  isLoadingIssues,
  hasIssuesError,
  onBack,
  onOfferToCleaners,
  onRefreshOffers,
  onRefreshIssues,
  onSimulateOffer,
  onAssignCleaner,
  onSimulateAssignedCleaner,
  onResolveIssue,
}) {
  const { language, translate } = useTranslation();
  const [assigningCleanerId, setAssigningCleanerId] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
  const [resolvingIssueId, setResolvingIssueId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [isResolvingIssue, setIsResolvingIssue] = useState(false);
  const [resolutionError, setResolutionError] = useState(null);
  const createdAt = formatCreatedAt(job.createdAt, language);
  const assignedAt = formatCreatedAt(job.assignedAt, language);
  const startedAt = formatCreatedAt(job.startedAt, language);
  const completedAt = formatCreatedAt(job.completedAt, language);
  const isAssigned = Boolean(
    job.assignedCleanerId ||
      ["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus),
  );
  const canSimulateAssignedCleaner = ["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(
    job.operationalStatus,
  );
  const sortedOffers = [...offers].sort((firstOffer, secondOffer) =>
    (firstOffer.cleanerName || "").localeCompare(secondOffer.cleanerName || ""),
  );
  const sortedIssues = [...issues].sort((firstIssue, secondIssue) => {
    const firstCreatedAt = firstIssue.createdAt?.toMillis?.() || 0;
    const secondCreatedAt = secondIssue.createdAt?.toMillis?.() || 0;

    return secondCreatedAt - firstCreatedAt;
  });

  async function assignCleaner(offer) {
    setAssigningCleanerId(offer.cleanerId);
    setAssignmentError(null);

    try {
      await onAssignCleaner(offer);
    } catch (error) {
      setAssignmentError(
        error.code === "job-already-assigned"
          ? translate("offers.alreadyAssigned")
          : translate("offers.assignmentError"),
      );
    } finally {
      setAssigningCleanerId(null);
    }
  }

  function openResolutionForm(issue) {
    setResolvingIssueId(issue.id);
    setResolutionNote("");
    setResolutionError(null);
  }

  function closeResolutionForm() {
    setResolvingIssueId(null);
    setResolutionNote("");
    setResolutionError(null);
  }

  async function resolveSelectedIssue(event) {
    event.preventDefault();

    if (!resolvingIssueId) {
      return;
    }

    setIsResolvingIssue(true);
    setResolutionError(null);

    try {
      await onResolveIssue({
        issueId: resolvingIssueId,
        resolutionNote,
      });
      closeResolutionForm();
    } catch (error) {
      setResolutionError(
        error.code === "issue-not-open"
          ? translate("issues.alreadyResolved")
          : translate("issues.resolveError"),
      );
    } finally {
      setIsResolvingIssue(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="job-detail-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("jobs.details")}</p>
      <h2 id="job-detail-title" className="panel__title">
        {job.propertyName || translate("properties.unnamed")}
      </h2>

      <dl className="detail-list">
        <DetailItem label={translate("common.property")} value={job.propertyName || translate("properties.unnamed")} />
        <DetailItem label={translate("common.client")} value={job.clientName || translate("common.notProvided")} />
        <DetailItem label={translate("jobs.scheduledDate")} value={formatDate(job.scheduledDate, translate, language)} />
        <DetailItem
          label={translate("jobs.operationalStatus")}
          value={formatOperationalStatus(job.operationalStatus, translate)}
        />
        <DetailItem label={translate("jobs.clientPrice")} value={formatPrice(job.clientPrice, translate, language)} />
        <DetailItem label={translate("jobs.cleanerPayout")} value={formatPrice(job.cleanerPayout, translate, language)} />
        {isAssigned && (
          <DetailItem
            label={translate("jobs.assignedCleaner")}
            value={job.assignedCleanerName || translate("common.notProvided")}
          />
        )}
        {isAssigned && (
          <DetailItem label={translate("jobs.assignedTime")} value={assignedAt || translate("common.notProvided")} />
        )}
        {["IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus) && (
          <DetailItem label={translate("jobs.startedTime")} value={startedAt || translate("common.notProvided")} />
        )}
        {job.operationalStatus === "COMPLETED" && (
          <DetailItem label={translate("jobs.completedTime")} value={completedAt || translate("common.notProvided")} />
        )}
        {createdAt && <DetailItem label={translate("jobs.createdTime")} value={createdAt} />}
      </dl>

      {job.notes && (
        <section className="notes-section" aria-label={translate("common.notes")}>
          <h3>{translate("common.notes")}</h3>
          <p>{job.notes}</p>
        </section>
      )}

      <section className="issues-section" aria-labelledby="issues-title">
        <div className="issues-section__header">
          <h3 id="issues-title">{translate("issues.title")}</h3>
          <button
            className="button"
            type="button"
            onClick={onRefreshIssues}
            disabled={isLoadingIssues}
          >
            {translate("issues.refresh")}
          </button>
        </div>

        {isLoadingIssues && <StateCard message={translate("issues.loading")} status="status" />}

        {!isLoadingIssues && hasIssuesError && (
          <StateCard message={translate("issues.error")} status="alert" isError />
        )}

        {!isLoadingIssues && !hasIssuesError && sortedIssues.length === 0 && (
          <StateCard message={translate("issues.empty")} />
        )}

        {!isLoadingIssues && !hasIssuesError && sortedIssues.length > 0 && (
          <div className="issue-list">
            {sortedIssues.map((issue) => {
              const createdAt = formatCreatedAt(issue.createdAt, language);
              const resolvedAt = formatCreatedAt(issue.resolvedAt, language);
              const isOpen = issue.status === "OPEN";
              const isResolutionFormVisible = resolvingIssueId === issue.id;

              return (
                <article key={issue.id} className="issue-card">
                  <div className="issue-card__header">
                    <strong>{formatIssueCategory(issue.category, translate)}</strong>
                    <span className="status-badge">{issue.status === "RESOLVED" ? translate("status.resolved") : translate("status.open")}</span>
                  </div>
                  <p>{issue.description || translate("common.notProvided")}</p>
                  <span>{translate("issues.reportedBy", { cleaner: issue.cleanerName || translate("common.notProvided") })}</span>
                  {createdAt && <span>{translate("issues.reported")} {createdAt}</span>}
                  {resolvedAt && <span>{translate("issues.resolved")} {resolvedAt}</span>}
                  {issue.status === "RESOLVED" && hasValue(issue.resolutionNote) && (
                    <p className="issue-card__resolution-note">
                      {translate("issues.resolution")}: {issue.resolutionNote}
                    </p>
                  )}

                  {isOpen && !isResolutionFormVisible && (
                    <div>
                      <button
                        className="button"
                        type="button"
                        onClick={() => openResolutionForm(issue)}
                      >
                        {translate("issues.resolve")}
                      </button>
                    </div>
                  )}

                  {isOpen && isResolutionFormVisible && (
                    <form className="issue-resolution-form" onSubmit={resolveSelectedIssue}>
                      <p className="issue-resolution-form__summary">
                        <strong>{formatIssueCategory(issue.category, translate)}</strong>
                        <span>{issue.description || translate("common.notProvided")}</span>
                      </p>
                      <label>
                        {translate("issues.resolutionNote")}
                        <textarea
                          name="resolutionNote"
                          value={resolutionNote}
                          onChange={(event) => setResolutionNote(event.target.value)}
                          rows="3"
                        />
                      </label>
                      {resolutionError && (
                        <p className="form-error" role="alert">
                          {resolutionError}
                        </p>
                      )}
                      <div className="button-row">
                        <button
                          className="button"
                          type="button"
                          disabled={isResolvingIssue}
                          onClick={closeResolutionForm}
                        >
                          {translate("common.cancel")}
                        </button>
                        <button
                          className="button button--primary"
                          type="submit"
                          disabled={isResolvingIssue}
                        >
                          {isResolvingIssue ? translate("issues.resolving") : translate("issues.resolve")}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="offers-section" aria-labelledby="offers-title">
        <div className="offers-section__header">
          <h3 id="offers-title">{translate("offers.title")}</h3>
          <button
            className="button"
            type="button"
            onClick={onRefreshOffers}
            disabled={isLoadingOffers}
          >
            {translate("offers.refresh")}
          </button>
        </div>

        {isLoadingOffers && <StateCard message={translate("offers.loading")} status="status" />}

        {!isLoadingOffers && hasOffersError && (
          <StateCard message={translate("offers.error")} status="alert" isError />
        )}

        {!isLoadingOffers && !hasOffersError && sortedOffers.length === 0 && (
          <StateCard message={translate("offers.empty")} />
        )}

        {!isLoadingOffers && !hasOffersError && sortedOffers.length > 0 && (
          <div className="offer-status-list">
            {sortedOffers.map((offer) => {
              const respondedAt = formatCreatedAt(offer.respondedAt, language);

              return (
                <article key={offer.id} className="offer-status-item">
                  <div>
                    <strong>{offer.cleanerName || translate("common.notProvided")}</strong>
                    {respondedAt && <span>{translate("offers.responded")} {respondedAt}</span>}
                  </div>
                  <span className="status-badge">{translate({ PENDING: "status.pending", INTERESTED: "status.interested", DECLINED: "status.declined" }[offer.status] || "common.notProvided")}</span>
                  <div className="offer-status-actions">
                    <button
                      className="button"
                      type="button"
                      onClick={() => onSimulateOffer(offer)}
                    >
                      {translate("offers.simulateOffer")}
                    </button>
                    {offer.status === "INTERESTED" && !isAssigned && (
                      <button
                        className="button button--primary"
                        type="button"
                        disabled={assigningCleanerId !== null}
                        onClick={() => assignCleaner(offer)}
                      >
                        {assigningCleanerId === offer.cleanerId
                          ? translate("offers.assigning")
                          : translate("offers.assign")}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {assignmentError && (
          <p className="form-error assignment-error" role="alert">
            {assignmentError}
          </p>
        )}
      </section>

      <div className="button-row">
        {canSimulateAssignedCleaner && (
          <button className="button" type="button" onClick={onSimulateAssignedCleaner}>
            {translate("offers.simulateAssignedCleaner")}
          </button>
        )}
        <button
          className="button button--primary"
          type="button"
          onClick={onOfferToCleaners}
        >
          {translate("offers.offerToCleaners")}
        </button>
      </div>
    </section>
  );
}

function OfferCleaners({ job, cleaners, isLoading, hasError, onBack, onSent }) {
  const { translate } = useTranslation();
  const [selectedCleanerIds, setSelectedCleanerIds] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [hasSendError, setHasSendError] = useState(false);

  function toggleCleaner(cleanerId) {
    setSelectedCleanerIds((currentIds) =>
      currentIds.includes(cleanerId)
        ? currentIds.filter((id) => id !== cleanerId)
        : [...currentIds, cleanerId],
    );
  }

  async function sendOffers(event) {
    event.preventDefault();
    const selectedCleaners = cleaners.filter((cleaner) =>
      selectedCleanerIds.includes(cleaner.id),
    );

    if (selectedCleaners.length === 0) {
      return;
    }

    setIsSending(true);
    setHasSendError(false);

    try {
      const updatedJob = await createJobOffers({
        jobId: job.id,
        cleaners: selectedCleaners,
      });
      onSent(selectedCleaners.length, updatedJob);
    } catch {
      setHasSendError(true);
      setIsSending(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="offer-cleaners-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("offers.title")}</p>
      <h2 id="offer-cleaners-title" className="panel__title">
        {translate("offers.offerToCleaners")}
      </h2>
      <p className="offer-job-name">
        {job.propertyName || translate("properties.unnamed")}
      </p>

      {isLoading && <StateCard message={translate("offers.loadingCleaners")} status="status" />}

      {!isLoading && hasError && (
        <StateCard message={translate("offers.cleanerError")} status="alert" isError />
      )}

      {!isLoading && !hasError && cleaners.length === 0 && (
        <StateCard message={translate("offers.emptyCleaners")} />
      )}

      {!isLoading && !hasError && cleaners.length > 0 && (
        <form className="offer-form" onSubmit={sendOffers}>
          <div className="cleaner-list">
            {cleaners.map((cleaner) => (
              <label key={cleaner.id} className="cleaner-option">
                <input
                  type="checkbox"
                  checked={selectedCleanerIds.includes(cleaner.id)}
                  onChange={() => toggleCleaner(cleaner.id)}
                />
                <span>{cleaner.name || translate("common.notProvided")}</span>
              </label>
            ))}
          </div>

          {hasSendError && (
            <p className="form-error" role="alert">
              {translate("offers.sendError")}
            </p>
          )}

          <div className="button-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={selectedCleanerIds.length === 0 || isSending}
            >
              {isSending ? translate("offers.sending") : translate("offers.send")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function OffersSuccess({ count, onBackToJob, onBackToJobs }) {
  const { translate } = useTranslation();
  return (
    <section className="panel success-panel" aria-labelledby="offers-success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">{translate("offers.title")}</p>
      <h2 id="offers-success-title" className="panel__title">
        {translate("offers.sent")}
      </h2>
      <p className="success-panel__detail">
        {translate(count === 1 ? "offers.receivedOne" : "offers.receivedMany", { count })}
      </p>

      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onBackToJob}>
          {translate("jobs.backToJob")}
        </button>
        <button className="button" type="button" onClick={onBackToJobs}>
          {translate("jobs.backToJobs")}
        </button>
      </div>
    </section>
  );
}

function CleanerOfferSimulation({ job, offer, onBackToJob }) {
  const { language, translate } = useTranslation();
  const [offerStatus, setOfferStatus] = useState(offer.status || "PENDING");
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponseError, setHasResponseError] = useState(false);

  async function submitResponse(status) {
    setIsResponding(true);
    setHasResponseError(false);

    try {
      await respondToJobOffer({
        jobId: job.id,
        cleanerId: offer.cleanerId,
        status,
      });
      setOfferStatus(status);
    } catch {
      setHasResponseError(true);
    } finally {
      setIsResponding(false);
    }
  }

  return (
    <section className="panel cleaner-offer-panel" aria-labelledby="cleaner-offer-title">
      <BackButton onClick={onBackToJob} />

      <p className="eyebrow">{translate("cleaner.developmentSimulation")}</p>
      <h2 id="cleaner-offer-title" className="panel__title">
        {translate("cleaner.offerTitle")}
      </h2>

      <dl className="detail-list">
        <DetailItem label={translate("common.property")} value={job.propertyName || translate("properties.unnamed")} />
        <DetailItem label={translate("jobs.scheduledDate")} value={formatDate(job.scheduledDate, translate, language)} />
        <DetailItem label={translate("cleaner.offerStatus")} value={formatStatus(offerStatus, translate)} />
      </dl>

      {hasResponseError && (
        <p className="form-error" role="alert">
          {translate("cleaner.responseError")}
        </p>
      )}

      {offerStatus === "PENDING" && (
        <div className="button-row" aria-label={translate("cleaner.offerStatus")}>
          <button
            className="button button--primary"
            type="button"
            disabled={isResponding}
            onClick={() => submitResponse("INTERESTED")}
          >
            {translate("cleaner.interested")}
          </button>
          <button
            className="button"
            type="button"
            disabled={isResponding}
            onClick={() => submitResponse("DECLINED")}
          >
            {translate("cleaner.notAvailable")}
          </button>
        </div>
      )}
    </section>
  );
}

function AssignedCleanerJob({
  job,
  onBackToJob,
  onStartCleaning,
  onCompleteCleaning,
  onReportIssue,
}) {
  const { language, translate } = useTranslation();
  const [isStarting, setIsStarting] = useState(false);
  const [hasStartError, setHasStartError] = useState(false);
  const [isCompletionConfirmationVisible, setIsCompletionConfirmationVisible] =
    useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [hasCompletionError, setHasCompletionError] = useState(false);
  const startedAt = formatCreatedAt(job.startedAt, language);
  const completedAt = formatCreatedAt(job.completedAt, language);
  const isInProgress = job.operationalStatus === "IN_PROGRESS";
  const isCompleted = job.operationalStatus === "COMPLETED";

  async function startCleaning() {
    setIsStarting(true);
    setHasStartError(false);

    try {
      await onStartCleaning();
    } catch {
      setHasStartError(true);
    } finally {
      setIsStarting(false);
    }
  }

  async function completeCleaning() {
    setIsCompleting(true);
    setHasCompletionError(false);

    try {
      await onCompleteCleaning();
    } catch {
      setHasCompletionError(true);
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <section className="panel cleaner-job-panel" aria-labelledby="cleaner-job-title">
      <BackButton onClick={onBackToJob} />

      <p className="eyebrow">{translate("cleaner.developmentSimulation")}</p>
      <h2 id="cleaner-job-title" className="panel__title">
        {isCompleted
          ? translate("cleaner.completedTitle")
          : isInProgress
            ? translate("cleaner.inProgressTitle")
            : translate("cleaner.assignedTitle")}
      </h2>

      <dl className="detail-list">
        <DetailItem label={translate("common.property")} value={job.propertyName || translate("properties.unnamed")} />
        <DetailItem label={translate("jobs.scheduledDate")} value={formatDate(job.scheduledDate, translate, language)} />
        <DetailItem
          label={translate("jobs.assignedCleaner")}
          value={job.assignedCleanerName || translate("common.notProvided")}
        />
        <DetailItem
          label={translate("jobs.operationalStatus")}
          value={formatOperationalStatus(job.operationalStatus, translate)}
        />
        {(isInProgress || isCompleted) && (
          <DetailItem label={translate("jobs.startedTime")} value={startedAt || translate("common.notProvided")} />
        )}
        {isCompleted && (
          <DetailItem label={translate("jobs.completedTime")} value={completedAt || translate("common.notProvided")} />
        )}
      </dl>

      {job.notes && (
        <section className="notes-section" aria-label={translate("common.notes")}>
          <h3>{translate("common.notes")}</h3>
          <p>{job.notes}</p>
        </section>
      )}

      {hasStartError && (
        <p className="form-error" role="alert">
          {translate("cleaner.startError")}
        </p>
      )}

      {hasCompletionError && (
        <p className="form-error" role="alert">
          {translate("cleaner.completeError")}
        </p>
      )}

      {job.operationalStatus === "ASSIGNED" && (
        <div className="button-row">
          <button
            className="button button--primary"
            type="button"
            disabled={isStarting}
            onClick={startCleaning}
          >
            {isStarting ? translate("cleaner.starting") : translate("cleaner.start")}
          </button>
        </div>
      )}

      {isInProgress && (
        <div className="button-row">
          <button className="button" type="button" onClick={onReportIssue}>
            {translate("cleaner.reportIssue")}
          </button>
          {!isCompletionConfirmationVisible && (
            <button
              className="button button--primary"
              type="button"
              onClick={() => setIsCompletionConfirmationVisible(true)}
            >
              {translate("cleaner.complete")}
            </button>
          )}
        </div>
      )}

      {isInProgress && isCompletionConfirmationVisible && (
        <section className="completion-confirmation" aria-label={translate("cleaner.completeConfirmation")}>
          <p>{translate("cleaner.completeConfirmation")}</p>
          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={isCompleting}
              onClick={() => setIsCompletionConfirmationVisible(false)}
            >
              {translate("common.cancel")}
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={isCompleting}
              onClick={completeCleaning}
            >
              {isCompleting ? translate("cleaner.completing") : translate("cleaner.complete")}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

function IssueForm({ job, onBack, onSubmitted }) {
  const { translate } = useTranslation();
  const [category, setCategory] = useState("ACCESS");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  async function submitIssue(event) {
    event.preventDefault();
    setIsSaving(true);
    setHasSaveError(false);

    try {
      await createIssue({
        jobId: job.id,
        propertyId: job.propertyId,
        cleanerId: job.assignedCleanerId,
        cleanerName: job.assignedCleanerName,
        category,
        description,
      });
      onSubmitted();
    } catch {
      setHasSaveError(true);
      setIsSaving(false);
    }
  }

  return (
    <section className="panel cleaner-job-panel" aria-labelledby="issue-form-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("cleaner.issueTitle")}</p>
      <h2 id="issue-form-title" className="panel__title">
        {translate("cleaner.reportIssue")}
      </h2>

      <form className="cleaning-form" onSubmit={submitIssue}>
        <label>
          {translate("cleaner.issueCategory")}
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="ACCESS">{translate("issueCategory.access")}</option>
            <option value="SUPPLIES">{translate("issueCategory.supplies")}</option>
            <option value="BROKEN_ITEM">{translate("issueCategory.brokenItem")}</option>
            <option value="HEAVY_CLEANING">{translate("issueCategory.heavyCleaning")}</option>
            <option value="OTHER">{translate("issueCategory.other")}</option>
          </select>
        </label>

        <label>
          {translate("cleaner.issueDescription")}
          <textarea
            rows="4"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </label>

        <label>
          {translate("cleaner.reportedBy")}
          <input type="text" value={job.assignedCleanerName || translate("common.notProvided")} readOnly />
        </label>

        {hasSaveError && (
          <p className="form-error" role="alert">
            {translate("cleaner.issueError")}
          </p>
        )}

        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={isSaving}>
            {isSaving ? translate("cleaner.reporting") : translate("cleaner.submitIssue")}
          </button>
        </div>
      </form>
    </section>
  );
}

function IssueSuccess({ onBackToCleaning }) {
  const { translate } = useTranslation();
  return (
    <section className="panel success-panel" aria-labelledby="issue-success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">{translate("cleaner.issueTitle")}</p>
      <h2 id="issue-success-title" className="panel__title">
        {translate("cleaner.issueReported")}
      </h2>

      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onBackToCleaning}>
          {translate("cleaner.backToCleaning")}
        </button>
      </div>
    </section>
  );
}

function StateCard({ message, status, isError = false }) {
  return (
    <p className={`state-card${isError ? " state-card--error" : ""}`} role={status}>
      {message}
    </p>
  );
}

function BackButton({ onClick }) {
  const { translate } = useTranslation();

  return (
    <button className="back-button" type="button" onClick={onClick}>
      ← {translate("common.back")}
    </button>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default App;

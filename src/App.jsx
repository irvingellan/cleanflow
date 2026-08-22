import { useEffect, useState } from "react";
import { getCleaners } from "./features/cleaners/cleanerService.js";
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
import { getProperties } from "./features/properties/propertyService.js";

const content = {
  productName: "CleanFlow",
  productDescription: "Operations platform",
  buildLabel: "Foundation build",
  dashboardNavigation: "Dashboard",
  propertiesNavigation: "Properties",
  jobsNavigation: "Jobs",
  loadingProperties: "Loading properties…",
  loadingJobs: "Loading jobs…",
  loadingCleaners: "Loading cleaners…",
  propertyErrorMessage: "Unable to load properties.",
  jobErrorMessage: "Unable to load jobs.",
  cleanerErrorMessage: "Unable to load cleaners.",
  emptyProperties: "No properties found.",
  emptyJobs: "No jobs found.",
  emptyCleaners: "No active cleaners found.",
  propertyLabel: "Property",
  unnamedProperty: "Unnamed property",
  missingValue: "Not provided",
  propertyDetails: "Property details",
  jobDetails: "Job details",
  createCleaning: "Create cleaning",
  createCleaningError: "Unable to create cleaning.",
  successTitle: "Cleaning created",
  offerToCleaners: "Offer to cleaners",
  sendOffers: "Send offers",
  sendOffersError: "Unable to send offers.",
  offersSent: "Offers sent",
  loadingOffers: "Loading offers…",
  offersErrorMessage: "Unable to load offers.",
  emptyOffers: "No offers sent yet.",
  loadingIssues: "Loading issues…",
  issuesErrorMessage: "Unable to load issues.",
  emptyIssues: "No issues reported.",
  refreshIssues: "Refresh issues",
  refreshOffers: "Refresh offers",
  simulateOffer: "Simulate offer",
  cleanerOffer: "Cleaner offer",
  interested: "Interested",
  notAvailable: "Not available",
  responseErrorMessage: "Unable to save your response.",
  assign: "Assign",
  assignmentErrorMessage: "Unable to assign cleaner.",
  alreadyAssignedErrorMessage: "This job is already assigned.",
  simulateAssignedCleaner: "Simulate assigned cleaner",
  assignedCleaning: "Assigned cleaning",
  cleaningInProgress: "Cleaning in progress",
  startCleaning: "Start cleaning",
  startCleaningError: "Unable to start cleaning.",
  completeCleaning: "Complete cleaning",
  cleaningCompleted: "Cleaning completed",
  completeCleaningError: "Unable to complete cleaning.",
  reportIssue: "Report issue",
  submitIssue: "Submit issue",
  createIssueError: "Unable to report issue.",
  issueReported: "Issue reported",
  resolveIssue: "Resolve issue",
  resolveIssueError: "Unable to resolve issue.",
  issueAlreadyResolvedError: "This issue is already resolved.",
};

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function formatPrice(value) {
  if (!hasValue(value)) {
    return content.missingValue;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value) {
  if (!value) {
    return content.missingValue;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

function formatCreatedAt(value) {
  if (!value || typeof value.toDate !== "function") {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value.toDate());
}

function formatOperationalStatus(status) {
  return {
    UNASSIGNED: "Unassigned",
    OFFERED: "Offered",
    ASSIGNED: "Assigned",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
  }[status] || content.missingValue;
}

function App() {
  const [properties, setProperties] = useState([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);
  const [hasPropertyError, setHasPropertyError] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [hasJobError, setHasJobError] = useState(false);
  const [cleaners, setCleaners] = useState([]);
  const [isLoadingCleaners, setIsLoadingCleaners] = useState(false);
  const [hasCleanerError, setHasCleanerError] = useState(false);
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
            <p className="eyebrow">{content.productDescription}</p>
            <h1 id="page-title">{content.productName}</h1>
            <MainNavigation
              activeSection={activeSection}
              onShowDashboard={showDashboard}
              onShowProperties={showProperties}
              onShowJobs={showJobs}
            />
          </div>
          <span className="badge">{content.buildLabel}</span>
        </header>

        {view === "dashboard" && (
          <Dashboard
            dashboardData={dashboardData}
            isLoading={isLoadingDashboard}
            hasError={hasDashboardError}
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

function MainNavigation({ activeSection, onShowDashboard, onShowProperties, onShowJobs }) {
  return (
    <nav className="main-navigation" aria-label="Main navigation">
      <button
        className="navigation-button"
        type="button"
        aria-current={activeSection === "dashboard" ? "page" : undefined}
        onClick={onShowDashboard}
      >
        {content.dashboardNavigation}
      </button>
      <button
        className="navigation-button"
        type="button"
        aria-current={activeSection === "properties" ? "page" : undefined}
        onClick={onShowProperties}
      >
        {content.propertiesNavigation}
      </button>
      <button
        className="navigation-button"
        type="button"
        aria-current={activeSection === "jobs" ? "page" : undefined}
        onClick={onShowJobs}
      >
        {content.jobsNavigation}
      </button>
    </nav>
  );
}

function Dashboard({ dashboardData, isLoading, hasError, onRefresh, onOpenJob }) {
  const [operationFilter, setOperationFilter] = useState("active");

  if (isLoading) {
    return <StateCard message="Loading dashboard…" status="status" />;
  }

  if (hasError) {
    return (
      <section className="dashboard-state" aria-live="polite">
        <StateCard message="Unable to load dashboard." status="alert" isError />
        <button className="button" type="button" onClick={onRefresh}>
          Refresh dashboard
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
      label: "Open issue",
      detail: `${formatIssueCategory(issue.category)} — ${issue.description}`,
      status: formatOperationalStatus(issue.job.operationalStatus),
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
        label: "Cleaner interested",
        detail: interestedNames || "A cleaner is interested",
        status: formatOperationalStatus(job.operationalStatus),
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
          ? "Needs assignment"
          : "Offers awaiting response",
      detail:
        job.operationalStatus === "UNASSIGNED"
          ? "No offers have been sent yet"
          : "No cleaner has expressed interest yet",
      status: formatOperationalStatus(job.operationalStatus),
    })),
  ];
  const filterOptions = {
    active: {
      label: "Active operation",
      jobs: activeOperationJobs,
    },
    needsAssignment: {
      label: "Needs assignment",
      jobs: jobsNeedingAssignment,
    },
    inProgress: {
      label: "In progress",
      jobs: inProgressJobs,
    },
    completed: {
      label: "Completed",
      jobs: completedJobs,
    },
    openIssues: {
      label: "Jobs with open issues",
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
          <p className="eyebrow">Manager workspace</p>
          <h2 id="dashboard-title" className="dashboard__title">
            Operations dashboard
          </h2>
          <p>Today’s cleaning operation at a glance.</p>
        </div>
        <button className="button" type="button" onClick={onRefresh}>
          Refresh dashboard
        </button>
      </div>

      {jobs.length === 0 ? (
        <StateCard message="No jobs available for this organization." />
      ) : (
        <>
          <div className="dashboard-summary" aria-label="Operational summary">
            <SummaryCard label="Total jobs" count={jobs.length} />
            <SummaryCard
              label="Needs assignment"
              count={jobsNeedingAssignment.length}
              isActive={operationFilter === "needsAssignment"}
              onClick={() => setOperationFilter("needsAssignment")}
            />
            <SummaryCard
              label="In progress"
              count={inProgressJobs.length}
              isActive={operationFilter === "inProgress"}
              onClick={() => setOperationFilter("inProgress")}
            />
            <SummaryCard
              label="Completed"
              count={completedJobs.length}
              isActive={operationFilter === "completed"}
              onClick={() => setOperationFilter("completed")}
            />
            <SummaryCard
              label="Open issues"
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
                  <p className="eyebrow">Priorities</p>
                  <h3 id="attention-title">Needs attention</h3>
                </div>
              </div>

              {attentionItems.length === 0 ? (
                <p className="dashboard-empty">No current items need attention.</p>
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
                      <strong>{item.job.propertyName || content.unnamedProperty}</strong>
                      <span>{item.detail}</span>
                      <small>
                        {item.status} · {formatDate(item.job.scheduledDate)}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="dashboard-panel" aria-labelledby="completed-title">
              <div className="dashboard-panel__header">
                <div>
                  <p className="eyebrow">History</p>
                  <h3 id="completed-title">Recently completed</h3>
                </div>
              </div>

              {completedJobs.length === 0 ? (
                <p className="dashboard-empty">No completed cleanings yet.</p>
              ) : (
                <div className="recent-list">
                  {sortByCompletedAt(completedJobs).map((job) => (
                    <button
                      key={job.id}
                      className="recent-item"
                      type="button"
                      onClick={() => onOpenJob(job)}
                    >
                      <strong>{job.propertyName || content.unnamedProperty}</strong>
                      <span>{formatDate(job.scheduledDate)}</span>
                      <span>{job.assignedCleanerName || content.missingValue}</span>
                      <small>{formatCreatedAt(job.completedAt) || "Completion time unavailable"}</small>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="dashboard-panel dashboard-panel--operation" aria-labelledby="operation-title">
            <div className="dashboard-panel__header">
              <div>
                <p className="eyebrow">Schedule</p>
                <h3 id="operation-title">Operation</h3>
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
                  Show active jobs
                </button>
              )}
            </div>

            {visibleOperation.length === 0 ? (
              <p className="dashboard-empty">No jobs match this view.</p>
            ) : (
              <div className="operation-list">
                {visibleOperation.map((job) => (
                  <button
                    key={job.id}
                    className="operation-item"
                    type="button"
                    onClick={() => onOpenJob(job)}
                  >
                    <span>{formatDate(job.scheduledDate)}</span>
                    <strong>{job.propertyName || content.unnamedProperty}</strong>
                    <span className="operation-item__status">
                      {formatOperationalStatus(job.operationalStatus)}
                    </span>
                    <span>{job.assignedCleanerName || "Not assigned"}</span>
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

function formatIssueCategory(category) {
  return {
    ACCESS: "Access",
    SUPPLIES: "Supplies",
    BROKEN_ITEM: "Broken item",
    HEAVY_CLEANING: "Heavy cleaning",
    OTHER: "Other",
  }[category] || content.missingValue;
}

function PropertyList({ properties, isLoading, hasError, onSelect }) {
  if (isLoading) {
    return <StateCard message={content.loadingProperties} status="status" />;
  }

  if (hasError) {
    return <StateCard message={content.propertyErrorMessage} status="alert" isError />;
  }

  if (properties.length === 0) {
    return <StateCard message={content.emptyProperties} />;
  }

  return (
    <div className="property-list">
      {properties.map((property) => {
        const propertyName = property.name || content.unnamedProperty;

        return (
          <button
            key={property.id}
            className="property-card"
            type="button"
            aria-label={`View ${propertyName}`}
            onClick={() => onSelect(property)}
          >
            <span className="property-card__title">{propertyName}</span>

            <span className="property-card__label">
              <span className="status-dot" aria-hidden="true" />
              {content.propertyLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PropertyDetail({ property, onBack, onCreateCleaning }) {
  const propertyName = property.name || content.unnamedProperty;
  const clientName = property.clientName || content.missingValue;
  let activeStatus = content.missingValue;

  if (property.active === true) {
    activeStatus = "Active";
  }

  if (property.active === false) {
    activeStatus = "Inactive";
  }

  return (
    <section className="panel" aria-labelledby="property-detail-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{content.propertyDetails}</p>
      <h2 id="property-detail-title" className="panel__title">
        {propertyName}
      </h2>

      <dl className="detail-list">
        <DetailItem label="Client" value={clientName} />
        {property.defaultClientPrice !== undefined && (
          <DetailItem
            label="Default client price"
            value={formatPrice(property.defaultClientPrice)}
          />
        )}
        {property.defaultCleanerPrice !== undefined && (
          <DetailItem
            label="Default cleaner price"
            value={formatPrice(property.defaultCleanerPrice)}
          />
        )}
        <DetailItem label="Status" value={activeStatus} />
      </dl>

      <div className="button-row">
        <button
          className="button button--primary"
          type="button"
          onClick={onCreateCleaning}
        >
          {content.createCleaning}
        </button>
      </div>
    </section>
  );
}

function CreateCleaningForm({ property, onBack, onCreated }) {
  const propertyName = property.name ?? "";
  const clientName = property.clientName ?? "";
  const displayPropertyName = propertyName || content.unnamedProperty;
  const displayClientName = clientName || content.missingValue;
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

      <p className="eyebrow">New job</p>
      <h2 id="create-cleaning-title" className="panel__title">
        {content.createCleaning}
      </h2>

      <form className="cleaning-form" onSubmit={handleSubmit}>
        <label>
          Property name
          <input type="text" value={displayPropertyName} readOnly />
        </label>

        <label>
          Client name
          <input type="text" value={displayClientName} readOnly />
        </label>

        <label>
          Date
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
            Client price
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
            Cleaner payout
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
          Notes
          <textarea
            name="notes"
            rows="4"
            value={formValues.notes}
            onChange={updateField}
          />
        </label>

        <label>
          Status
          <input type="text" value="UNASSIGNED" readOnly />
        </label>

        {hasSaveError && (
          <p className="form-error" role="alert">
            {content.createCleaningError}
          </p>
        )}

        <div className="button-row">
          <button
            className="button button--primary"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Creating…" : content.createCleaning}
          </button>
        </div>
      </form>
    </section>
  );
}

function CleaningSuccess({ job, onBack, onViewJob }) {
  return (
    <section className="panel success-panel" aria-labelledby="success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">Job saved</p>
      <h2 id="success-title" className="panel__title">
        {content.successTitle}
      </h2>
      <p className="success-panel__detail">
        {job.propertyName || content.unnamedProperty}
      </p>
      <p className="success-panel__date">{formatDate(job.scheduledDate)}</p>

      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onViewJob}>
          View job
        </button>
        <button className="button" type="button" onClick={onBack}>
          Back to properties
        </button>
      </div>
    </section>
  );
}

function JobList({ jobs, isLoading, hasError, onSelect }) {
  if (isLoading) {
    return <StateCard message={content.loadingJobs} status="status" />;
  }

  if (hasError) {
    return <StateCard message={content.jobErrorMessage} status="alert" isError />;
  }

  if (jobs.length === 0) {
    return <StateCard message={content.emptyJobs} />;
  }

  const sortedJobs = [...jobs].sort((firstJob, secondJob) =>
    (firstJob.scheduledDate || "").localeCompare(secondJob.scheduledDate || ""),
  );

  return (
    <section aria-labelledby="jobs-title">
      <p className="eyebrow">{content.jobsNavigation}</p>
      <h2 id="jobs-title" className="list-title">
        Cleaning jobs
      </h2>

      <div className="job-list">
        {sortedJobs.map((job) => (
          <button
            key={job.id}
            className="job-card"
            type="button"
            aria-label={`View job for ${job.propertyName || content.unnamedProperty}`}
            onClick={() => onSelect(job)}
          >
            <span className="job-card__date">{formatDate(job.scheduledDate)}</span>
            <span className="job-card__summary">
              <strong>{job.propertyName || content.unnamedProperty}</strong>
              <span>{job.clientName || content.missingValue}</span>
            </span>
            <span className="status-badge">
              {job.operationalStatus || content.missingValue}
            </span>
            {(hasValue(job.clientPrice) || hasValue(job.cleanerPayout)) && (
              <span className="job-card__prices">
                {hasValue(job.clientPrice) && <span>Client {formatPrice(job.clientPrice)}</span>}
                {hasValue(job.cleanerPayout) && (
                  <span>Cleaner {formatPrice(job.cleanerPayout)}</span>
                )}
              </span>
            )}
          </button>
        ))}
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
  const [assigningCleanerId, setAssigningCleanerId] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
  const [resolvingIssueId, setResolvingIssueId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [isResolvingIssue, setIsResolvingIssue] = useState(false);
  const [resolutionError, setResolutionError] = useState(null);
  const createdAt = formatCreatedAt(job.createdAt);
  const assignedAt = formatCreatedAt(job.assignedAt);
  const startedAt = formatCreatedAt(job.startedAt);
  const completedAt = formatCreatedAt(job.completedAt);
  const isAssigned = Boolean(
    job.assignedCleanerId ||
      ["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus),
  );
  const canSimulateAssignedCleaner = ["ASSIGNED", "IN_PROGRESS"].includes(
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
          ? content.alreadyAssignedErrorMessage
          : content.assignmentErrorMessage,
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
          ? content.issueAlreadyResolvedError
          : content.resolveIssueError,
      );
    } finally {
      setIsResolvingIssue(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="job-detail-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{content.jobDetails}</p>
      <h2 id="job-detail-title" className="panel__title">
        {job.propertyName || content.unnamedProperty}
      </h2>

      <dl className="detail-list">
        <DetailItem label="Property" value={job.propertyName || content.unnamedProperty} />
        <DetailItem label="Client" value={job.clientName || content.missingValue} />
        <DetailItem label="Scheduled date" value={formatDate(job.scheduledDate)} />
        <DetailItem
          label="Operational status"
          value={job.operationalStatus || content.missingValue}
        />
        <DetailItem label="Client price" value={formatPrice(job.clientPrice)} />
        <DetailItem label="Cleaner payout" value={formatPrice(job.cleanerPayout)} />
        {isAssigned && (
          <DetailItem
            label="Assigned cleaner"
            value={job.assignedCleanerName || content.missingValue}
          />
        )}
        {isAssigned && (
          <DetailItem label="Assigned time" value={assignedAt || content.missingValue} />
        )}
        {["IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus) && (
          <DetailItem label="Started time" value={startedAt || content.missingValue} />
        )}
        {job.operationalStatus === "COMPLETED" && (
          <DetailItem label="Completed time" value={completedAt || content.missingValue} />
        )}
        {createdAt && <DetailItem label="Created" value={createdAt} />}
      </dl>

      {job.notes && (
        <section className="notes-section" aria-label="Notes">
          <h3>Notes</h3>
          <p>{job.notes}</p>
        </section>
      )}

      <section className="issues-section" aria-labelledby="issues-title">
        <div className="issues-section__header">
          <h3 id="issues-title">Issues</h3>
          <button
            className="button"
            type="button"
            onClick={onRefreshIssues}
            disabled={isLoadingIssues}
          >
            {content.refreshIssues}
          </button>
        </div>

        {isLoadingIssues && <StateCard message={content.loadingIssues} status="status" />}

        {!isLoadingIssues && hasIssuesError && (
          <StateCard message={content.issuesErrorMessage} status="alert" isError />
        )}

        {!isLoadingIssues && !hasIssuesError && sortedIssues.length === 0 && (
          <StateCard message={content.emptyIssues} />
        )}

        {!isLoadingIssues && !hasIssuesError && sortedIssues.length > 0 && (
          <div className="issue-list">
            {sortedIssues.map((issue) => {
              const createdAt = formatCreatedAt(issue.createdAt);
              const resolvedAt = formatCreatedAt(issue.resolvedAt);
              const isOpen = issue.status === "OPEN";
              const isResolutionFormVisible = resolvingIssueId === issue.id;

              return (
                <article key={issue.id} className="issue-card">
                  <div className="issue-card__header">
                    <strong>{issue.category || content.missingValue}</strong>
                    <span className="status-badge">{issue.status || "OPEN"}</span>
                  </div>
                  <p>{issue.description || content.missingValue}</p>
                  <span>Reported by {issue.cleanerName || content.missingValue}</span>
                  {createdAt && <span>Reported {createdAt}</span>}
                  {resolvedAt && <span>Resolved {resolvedAt}</span>}
                  {issue.status === "RESOLVED" && hasValue(issue.resolutionNote) && (
                    <p className="issue-card__resolution-note">
                      Resolution: {issue.resolutionNote}
                    </p>
                  )}

                  {isOpen && !isResolutionFormVisible && (
                    <div>
                      <button
                        className="button"
                        type="button"
                        onClick={() => openResolutionForm(issue)}
                      >
                        {content.resolveIssue}
                      </button>
                    </div>
                  )}

                  {isOpen && isResolutionFormVisible && (
                    <form className="issue-resolution-form" onSubmit={resolveSelectedIssue}>
                      <p className="issue-resolution-form__summary">
                        <strong>{issue.category || content.missingValue}</strong>
                        <span>{issue.description || content.missingValue}</span>
                      </p>
                      <label>
                        Resolution note (optional)
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
                          Cancel
                        </button>
                        <button
                          className="button button--primary"
                          type="submit"
                          disabled={isResolvingIssue}
                        >
                          {isResolvingIssue ? "Resolving…" : content.resolveIssue}
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
          <h3 id="offers-title">Offers</h3>
          <button
            className="button"
            type="button"
            onClick={onRefreshOffers}
            disabled={isLoadingOffers}
          >
            {content.refreshOffers}
          </button>
        </div>

        {isLoadingOffers && <StateCard message={content.loadingOffers} status="status" />}

        {!isLoadingOffers && hasOffersError && (
          <StateCard message={content.offersErrorMessage} status="alert" isError />
        )}

        {!isLoadingOffers && !hasOffersError && sortedOffers.length === 0 && (
          <StateCard message={content.emptyOffers} />
        )}

        {!isLoadingOffers && !hasOffersError && sortedOffers.length > 0 && (
          <div className="offer-status-list">
            {sortedOffers.map((offer) => {
              const respondedAt = formatCreatedAt(offer.respondedAt);

              return (
                <article key={offer.id} className="offer-status-item">
                  <div>
                    <strong>{offer.cleanerName || content.missingValue}</strong>
                    {respondedAt && <span>Responded {respondedAt}</span>}
                  </div>
                  <span className="status-badge">{offer.status || "PENDING"}</span>
                  <div className="offer-status-actions">
                    <button
                      className="button"
                      type="button"
                      onClick={() => onSimulateOffer(offer)}
                    >
                      {content.simulateOffer}
                    </button>
                    {offer.status === "INTERESTED" && !isAssigned && (
                      <button
                        className="button button--primary"
                        type="button"
                        disabled={assigningCleanerId !== null}
                        onClick={() => assignCleaner(offer)}
                      >
                        {assigningCleanerId === offer.cleanerId
                          ? "Assigning…"
                          : content.assign}
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
            {content.simulateAssignedCleaner}
          </button>
        )}
        <button
          className="button button--primary"
          type="button"
          onClick={onOfferToCleaners}
        >
          {content.offerToCleaners}
        </button>
      </div>
    </section>
  );
}

function OfferCleaners({ job, cleaners, isLoading, hasError, onBack, onSent }) {
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

      <p className="eyebrow">Job offers</p>
      <h2 id="offer-cleaners-title" className="panel__title">
        {content.offerToCleaners}
      </h2>
      <p className="offer-job-name">
        {job.propertyName || content.unnamedProperty}
      </p>

      {isLoading && <StateCard message={content.loadingCleaners} status="status" />}

      {!isLoading && hasError && (
        <StateCard message={content.cleanerErrorMessage} status="alert" isError />
      )}

      {!isLoading && !hasError && cleaners.length === 0 && (
        <StateCard message={content.emptyCleaners} />
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
                <span>{cleaner.name || content.missingValue}</span>
              </label>
            ))}
          </div>

          {hasSendError && (
            <p className="form-error" role="alert">
              {content.sendOffersError}
            </p>
          )}

          <div className="button-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={selectedCleanerIds.length === 0 || isSending}
            >
              {isSending ? "Sending…" : content.sendOffers}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function OffersSuccess({ count, onBackToJob, onBackToJobs }) {
  return (
    <section className="panel success-panel" aria-labelledby="offers-success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">Job offers</p>
      <h2 id="offers-success-title" className="panel__title">
        {content.offersSent}
      </h2>
      <p className="success-panel__detail">
        {count} {count === 1 ? "cleaner" : "cleaners"} received an offer.
      </p>

      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onBackToJob}>
          Back to job
        </button>
        <button className="button" type="button" onClick={onBackToJobs}>
          Back to jobs
        </button>
      </div>
    </section>
  );
}

function CleanerOfferSimulation({ job, offer, onBackToJob }) {
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

      <p className="eyebrow">Development simulation</p>
      <h2 id="cleaner-offer-title" className="panel__title">
        {content.cleanerOffer}
      </h2>

      <dl className="detail-list">
        <DetailItem label="Property" value={job.propertyName || content.unnamedProperty} />
        <DetailItem label="Scheduled date" value={formatDate(job.scheduledDate)} />
        <DetailItem label="Offer status" value={offerStatus} />
      </dl>

      {hasResponseError && (
        <p className="form-error" role="alert">
          {content.responseErrorMessage}
        </p>
      )}

      {offerStatus === "PENDING" && (
        <div className="button-row" aria-label="Offer response">
          <button
            className="button button--primary"
            type="button"
            disabled={isResponding}
            onClick={() => submitResponse("INTERESTED")}
          >
            {content.interested}
          </button>
          <button
            className="button"
            type="button"
            disabled={isResponding}
            onClick={() => submitResponse("DECLINED")}
          >
            {content.notAvailable}
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
  const [isStarting, setIsStarting] = useState(false);
  const [hasStartError, setHasStartError] = useState(false);
  const [isCompletionConfirmationVisible, setIsCompletionConfirmationVisible] =
    useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [hasCompletionError, setHasCompletionError] = useState(false);
  const startedAt = formatCreatedAt(job.startedAt);
  const completedAt = formatCreatedAt(job.completedAt);
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

      <p className="eyebrow">Development simulation</p>
      <h2 id="cleaner-job-title" className="panel__title">
        {isCompleted
          ? content.cleaningCompleted
          : isInProgress
            ? content.cleaningInProgress
            : content.assignedCleaning}
      </h2>

      <dl className="detail-list">
        <DetailItem label="Property" value={job.propertyName || content.unnamedProperty} />
        <DetailItem label="Scheduled date" value={formatDate(job.scheduledDate)} />
        <DetailItem
          label="Assigned cleaner"
          value={job.assignedCleanerName || content.missingValue}
        />
        <DetailItem
          label="Operational status"
          value={job.operationalStatus || content.missingValue}
        />
        {(isInProgress || isCompleted) && (
          <DetailItem label="Started time" value={startedAt || content.missingValue} />
        )}
        {isCompleted && (
          <DetailItem label="Completed time" value={completedAt || content.missingValue} />
        )}
      </dl>

      {job.notes && (
        <section className="notes-section" aria-label="Notes">
          <h3>Notes</h3>
          <p>{job.notes}</p>
        </section>
      )}

      {hasStartError && (
        <p className="form-error" role="alert">
          {content.startCleaningError}
        </p>
      )}

      {hasCompletionError && (
        <p className="form-error" role="alert">
          {content.completeCleaningError}
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
            {isStarting ? "Starting…" : content.startCleaning}
          </button>
        </div>
      )}

      {isInProgress && (
        <div className="button-row">
          <button className="button" type="button" onClick={onReportIssue}>
            {content.reportIssue}
          </button>
          {!isCompletionConfirmationVisible && (
            <button
              className="button button--primary"
              type="button"
              onClick={() => setIsCompletionConfirmationVisible(true)}
            >
              {content.completeCleaning}
            </button>
          )}
        </div>
      )}

      {isInProgress && isCompletionConfirmationVisible && (
        <section className="completion-confirmation" aria-label="Complete cleaning confirmation">
          <p>Complete this cleaning?</p>
          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={isCompleting}
              onClick={() => setIsCompletionConfirmationVisible(false)}
            >
              Cancel
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={isCompleting}
              onClick={completeCleaning}
            >
              {isCompleting ? "Completing…" : content.completeCleaning}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

function IssueForm({ job, onBack, onSubmitted }) {
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

      <p className="eyebrow">Cleaning issue</p>
      <h2 id="issue-form-title" className="panel__title">
        {content.reportIssue}
      </h2>

      <form className="cleaning-form" onSubmit={submitIssue}>
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="ACCESS">ACCESS</option>
            <option value="SUPPLIES">SUPPLIES</option>
            <option value="BROKEN_ITEM">BROKEN_ITEM</option>
            <option value="HEAVY_CLEANING">HEAVY_CLEANING</option>
            <option value="OTHER">OTHER</option>
          </select>
        </label>

        <label>
          Description
          <textarea
            rows="4"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </label>

        <label>
          Reported by
          <input type="text" value={job.assignedCleanerName || content.missingValue} readOnly />
        </label>

        {hasSaveError && (
          <p className="form-error" role="alert">
            {content.createIssueError}
          </p>
        )}

        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={isSaving}>
            {isSaving ? "Reporting…" : content.submitIssue}
          </button>
        </div>
      </form>
    </section>
  );
}

function IssueSuccess({ onBackToCleaning }) {
  return (
    <section className="panel success-panel" aria-labelledby="issue-success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">Cleaning issue</p>
      <h2 id="issue-success-title" className="panel__title">
        {content.issueReported}
      </h2>

      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onBackToCleaning}>
          Back to cleaning
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
  return (
    <button className="back-button" type="button" onClick={onClick}>
      ← Back
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

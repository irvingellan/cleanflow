import { useEffect, useState } from "react";
import { appVersion } from "./appVersion.js";
import {
  signInWithEmail,
  signOutManager,
  subscribeToAuthState,
} from "./features/auth/authService.js";
import {
  createCleaner,
  getAllCleaners,
  getCleaners,
  updateCleaner,
} from "./features/cleaners/cleanerService.js";
import {
  createClient,
  getActiveClients,
  getClients,
} from "./features/clients/clientService.js";
import { getOperationalDashboard } from "./features/dashboard/dashboardService.js";
import {
  createPublicOfferLink,
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
  getCleanerJobHistory,
  getClientJobHistory,
  getPropertyJobHistory,
  getJobs,
  startAssignedJob,
} from "./features/jobs/jobService.js";
import {
  getPublicOffer,
  respondToPublicOffer,
} from "./features/public-offers/publicOfferService.js";
import { languageOptions, useTranslation } from "./i18n/translations.js";
import {
  createProperty,
  getProperties,
  getPropertiesForClient,
  linkPropertyToClient,
} from "./features/properties/propertyService.js";

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

function createEmptyPropertyForm(preselectedClient = null) {
  return {
    name: "",
    clientName: preselectedClient?.name || "",
    defaultClientPrice: "",
    defaultCleanerPrice: "",
    active: true,
  };
}

function optionalPrice(value) {
  if (value.trim() === "") {
    return undefined;
  }

  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
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

function formatShortWeekday(value, language = "en") {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeByLanguage[language] || "en-US", {
    weekday: "short",
  })
    .format(date)
    .replace(/\.$/, "");
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

function publicOfferTokenFromPathname(pathname = window.location.pathname) {
  const pathSegments = pathname.split("/").filter(Boolean);

  if (pathSegments[0] !== "offer") {
    return null;
  }

  if (pathSegments.length !== 2) {
    return "";
  }

  try {
    return decodeURIComponent(pathSegments[1]);
  } catch {
    return "";
  }
}

function App() {
  const publicOfferToken = publicOfferTokenFromPathname();
  const isPublicOfferRoute = publicOfferToken !== null;
  const [authUser, setAuthUser] = useState(undefined);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasSignOutError, setHasSignOutError] = useState(false);

  useEffect(() => {
    if (isPublicOfferRoute) {
      return undefined;
    }

    return subscribeToAuthState(setAuthUser);
  }, [isPublicOfferRoute]);

  if (isPublicOfferRoute) {
    return <PublicOfferPage token={publicOfferToken} />;
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setHasSignOutError(false);

    try {
      await signOutManager();
    } catch {
      setHasSignOutError(true);
    } finally {
      setIsSigningOut(false);
    }
  }

  if (authUser === undefined) {
    return <AuthenticationLoading />;
  }

  if (!authUser) {
    return <ManagerLogin />;
  }

  return (
    <ManagerApplication
      hasSignOutError={hasSignOutError}
      isSigningOut={isSigningOut}
      onSignOut={handleSignOut}
    />
  );
}

function PublicOfferPage({ token }) {
  const { language, setLanguage, translate } = useTranslation();
  const [offer, setOffer] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResponding, setIsResponding] = useState(false);
  const [responseError, setResponseError] = useState(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadOffer() {
      if (!token) {
        if (isCurrent) {
          setLoadError("offer_not_found");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setLoadError(null);

      try {
        const loadedOffer = await getPublicOffer(token);

        if (isCurrent) {
          setOffer(loadedOffer);
        }
      } catch (error) {
        if (isCurrent) {
          setLoadError(error.code || "request_failed");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadOffer();

    return () => {
      isCurrent = false;
    };
  }, [token]);

  async function submitResponse(status) {
    setIsResponding(true);
    setResponseError(null);

    try {
      const result = await respondToPublicOffer({ token, status });
      setOffer((currentOffer) => ({ ...currentOffer, status: result.status }));
    } catch (error) {
      if (["offer_not_found", "offer_expired", "offer_unavailable"].includes(error.code)) {
        setLoadError(error.code);
      } else {
        setResponseError(error.code || "request_failed");
      }
    } finally {
      setIsResponding(false);
    }
  }

  const errorMessage = {
    offer_not_found: "publicOffer.notFound",
    offer_expired: "publicOffer.expired",
    offer_unavailable: "publicOffer.unavailable",
  }[loadError] || "publicOffer.loadError";
  const hasAnswered = offer && offer.status !== "PENDING";

  return (
    <main className="app-shell public-offer-shell">
      <section className="foundation public-offer-foundation" aria-labelledby="public-offer-page-title">
        <header className="public-offer-header">
          <div>
            <p className="eyebrow">{translate("brand.operationsPlatform")}</p>
            <h1 id="public-offer-page-title">{content.productName}</h1>
          </div>
          <LanguageSelector language={language} onChange={setLanguage} />
        </header>

        {isLoading && <StateCard message={translate("publicOffer.loading")} status="status" />}

        {!isLoading && loadError && (
          <StateCard message={translate(errorMessage)} status="alert" isError />
        )}

        {!isLoading && !loadError && offer && (
          <section className="panel public-offer-panel" aria-labelledby="public-offer-title">
            <p className="eyebrow">{translate("publicOffer.eyebrow")}</p>
            <h2 id="public-offer-title" className="panel__title">
              {translate("publicOffer.title")}
            </h2>

            <dl className="detail-list">
              <DetailItem
                label={translate("common.property")}
                value={offer.propertyName || translate("properties.unnamed")}
              />
              <DetailItem
                label={translate("publicOffer.serviceDate")}
                value={formatDate(offer.scheduledDate, translate, language)}
              />
              {offer.scheduledStart && (
                <DetailItem label={translate("publicOffer.startTime")} value={offer.scheduledStart} />
              )}
              <DetailItem
                label={translate("publicOffer.yourPayment")}
                value={formatPrice(offer.cleanerPayout, translate, language)}
              />
              <DetailItem
                label={translate("publicOffer.status")}
                value={formatStatus(offer.status, translate)}
              />
            </dl>

            {responseError && (
              <p className="form-error" role="alert">
                {translate("publicOffer.responseError")}
              </p>
            )}

            {offer.status === "PENDING" && (
              <div className="public-offer-actions" aria-label={translate("publicOffer.status")}>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={isResponding}
                  onClick={() => submitResponse("INTERESTED")}
                >
                  {isResponding ? translate("publicOffer.responding") : translate("cleaner.interested")}
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

            {hasAnswered && (
              <p className="public-offer-confirmation" role="status">
                {offer.status === "INTERESTED"
                  ? translate("publicOffer.interestedConfirmation")
                  : translate("publicOffer.declinedConfirmation")}
              </p>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

function ManagerApplication({ hasSignOutError, isSigningOut, onSignOut }) {
  const { language, setLanguage, translate } = useTranslation();
  const [properties, setProperties] = useState([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);
  const [hasPropertyError, setHasPropertyError] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [hasJobError, setHasJobError] = useState(false);
  const [jobListFilter, setJobListFilter] = useState("all");
  const [cleaners, setCleaners] = useState([]);
  const [isLoadingCleaners, setIsLoadingCleaners] = useState(false);
  const [hasCleanerError, setHasCleanerError] = useState(false);
  const [directoryCleaners, setDirectoryCleaners] = useState([]);
  const [isLoadingDirectoryCleaners, setIsLoadingDirectoryCleaners] = useState(false);
  const [hasDirectoryCleanersError, setHasDirectoryCleanersError] = useState(false);
  const [clients, setClients] = useState([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [hasClientsError, setHasClientsError] = useState(false);
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
  const [propertyDetailOrigin, setPropertyDetailOrigin] = useState("properties");
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
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
        const loadedJobs = await getJobs(jobListFilter);

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
  }, [view, jobListFilter]);

  useEffect(() => {
    if (view !== "client-list") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingClients(true);
    setHasClientsError(false);

    async function loadClients() {
      try {
        const loadedClients = await getClients();

        if (isCurrent) {
          setClients(loadedClients);
        }
      } catch {
        if (isCurrent) {
          setHasClientsError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingClients(false);
        }
      }
    }

    loadClients();

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

  async function createCleanerOfferLink(offer) {
    if (!selectedJob) {
      throw new Error("No job selected.");
    }

    return createPublicOfferLink({
      jobId: selectedJob.id,
      cleanerId: offer.cleanerId,
    });
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
    setPropertyDetailOrigin("properties");
    setSelectedProperty(null);
    setSelectedClient(null);
    setSelectedJob(null);
    setCreatedJob(null);
    setOffersSentCount(null);
    setSelectedOffer(null);
    setJobIssues([]);
    setView("property-list");
  }

  function showNewProperty() {
    setPropertyDetailOrigin("properties");
    setSelectedProperty(null);
    setSelectedClient(null);
    setView("property-create");
  }

  function showPropertyClientLink() {
    setView("property-link-client");
  }

  function showDashboard() {
    setActiveSection("dashboard");
    setSelectedProperty(null);
    setSelectedJob(null);
    setSelectedOffer(null);
    setJobIssues([]);
    setView("dashboard");
  }

  function showJobList(filter) {
    setActiveSection("jobs");
    setSelectedProperty(null);
    setSelectedJob(null);
    setOffersSentCount(null);
    setSelectedOffer(null);
    setJobIssues([]);
    setJobListFilter(filter);
    setView("job-list");
  }

  function showJobs() {
    showJobList("all");
  }

  function showJobsWithFilter(filter) {
    showJobList(filter);
  }

  function returnToJobs() {
    showJobList(jobListFilter);
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

  function showClients() {
    setActiveSection("clients");
    setSelectedProperty(null);
    setSelectedClient(null);
    setSelectedJob(null);
    setSelectedCleaner(null);
    setSavedCleaner(null);
    setSelectedOffer(null);
    setJobIssues([]);
    setView("client-list");
  }

  function openCleaner(cleaner) {
    setActiveSection("cleaners");
    setSelectedCleaner(cleaner);
    setSavedCleaner(null);
    setView("cleaner-detail");
  }

  function showNewCleaner() {
    setSelectedCleaner(null);
    setSavedCleaner(null);
    setView("cleaner-create");
  }

  function showNewClient() {
    setSelectedClient(null);
    setView("client-create");
  }

  function openClient(client) {
    setActiveSection("clients");
    setSelectedProperty(null);
    setSelectedClient(client);
    setView("client-detail");
  }

  function openProperty(property) {
    setActiveSection("properties");
    setPropertyDetailOrigin("properties");
    setSelectedClient(null);
    setSelectedProperty(property);
    setView("property-detail");
  }

  function openClientProperty(property) {
    setActiveSection("clients");
    setPropertyDetailOrigin("client");
    setSelectedProperty(property);
    setView("property-detail");
  }

  function openClientJob(job) {
    setActiveSection("clients");
    setJobDetailOrigin("client");
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

  function openCleanerJob(job) {
    setActiveSection("cleaners");
    setJobDetailOrigin("cleaner");
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

  function returnToCleanerDetail() {
    setSelectedJob(null);
    setJobOffers([]);
    setHasOffersError(false);
    setJobIssues([]);
    setHasIssuesError(false);
    setSelectedOffer(null);
    setView("cleaner-detail");
  }

  function returnToClientDetail() {
    setSelectedProperty(null);
    setView("client-detail");
  }

  function showNewPropertyForClient() {
    setPropertyDetailOrigin("client");
    setSelectedProperty(null);
    setView("property-create");
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

  function openPropertyJob(job) {
    setActiveSection("properties");
    setJobDetailOrigin("property");
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

  function returnToPropertyDetail() {
    setSelectedJob(null);
    setJobOffers([]);
    setHasOffersError(false);
    setJobIssues([]);
    setHasIssuesError(false);
    setSelectedOffer(null);
    setView("property-detail");
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
              onShowClients={showClients}
            />
          </div>
          <div className="header-actions">
            <LanguageSelector language={language} onChange={setLanguage} />
            <button
              className="header-sign-out"
              type="button"
              disabled={isSigningOut}
              onClick={onSignOut}
            >
              {isSigningOut ? translate("auth.signingOut") : translate("auth.signOut")}
            </button>
            <span className="badge">{appVersion}</span>
            {hasSignOutError && (
              <p className="header-auth-error" role="alert">
                {translate("auth.signOutError")}
              </p>
            )}
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
            onShowJobs={showJobs}
            onShowJobsWithFilter={showJobsWithFilter}
          />
        )}

        {view === "property-list" && (
          <PropertyList
            properties={properties}
            isLoading={isLoadingProperties}
            hasError={hasPropertyError}
            onSelect={openProperty}
            onCreate={showNewProperty}
          />
        )}

        {view === "property-create" && (
          <PropertyCreateForm
            properties={properties}
            preselectedClient={
              propertyDetailOrigin === "client" ? selectedClient : null
            }
            onBack={
              propertyDetailOrigin === "client" ? returnToClientDetail : showProperties
            }
            onSaved={(property) => {
              setProperties((currentProperties) => [...currentProperties, property]);
              if (propertyDetailOrigin === "client") {
                setSelectedProperty(null);
                setView("client-detail");
              } else {
                setSelectedProperty(property);
                setView("property-detail");
              }
            }}
          />
        )}

        {view === "property-detail" && selectedProperty && (
          <PropertyDetail
            property={selectedProperty}
            onBack={
              propertyDetailOrigin === "client" ? returnToClientDetail : showProperties
            }
            onCreateCleaning={() => setView("create-cleaning")}
            onOpenJob={openPropertyJob}
            onLinkClient={showPropertyClientLink}
          />
        )}

        {view === "property-link-client" && selectedProperty && (
          <PropertyClientLinkForm
            property={selectedProperty}
            onBack={() => setView("property-detail")}
            onLinked={(propertyUpdate) => {
              const linkedProperty = { ...selectedProperty, ...propertyUpdate };
              setSelectedProperty(linkedProperty);
              setProperties((currentProperties) =>
                currentProperties.map((property) =>
                  property.id === linkedProperty.id ? linkedProperty : property,
                ),
              );
              setView("property-detail");
            }}
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
            filter={jobListFilter}
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

        {view === "cleaner-detail" && selectedCleaner && (
          <CleanerDetail
            cleaner={selectedCleaner}
            onBack={showCleaners}
            onOpenJob={openCleanerJob}
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

        {view === "client-list" && (
          <ClientDirectory
            clients={clients}
            isLoading={isLoadingClients}
            hasError={hasClientsError}
            onCreate={showNewClient}
            onSelect={openClient}
          />
        )}

        {view === "client-detail" && selectedClient && (
          <ClientDetail
            client={selectedClient}
            onBack={showClients}
            onOpenProperty={openClientProperty}
            onCreateProperty={showNewPropertyForClient}
            onOpenJob={openClientJob}
          />
        )}

        {view === "client-create" && (
          <ClientCreateForm
            onBack={showClients}
            onSaved={(client) => {
              setClients((currentClients) => [...currentClients, client]);
              setView("client-list");
            }}
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
            onBack={
              jobDetailOrigin === "dashboard"
                ? showDashboard
                : jobDetailOrigin === "property"
                  ? returnToPropertyDetail
                  : jobDetailOrigin === "client"
                    ? returnToClientDetail
                    : jobDetailOrigin === "cleaner"
                      ? returnToCleanerDetail
                    : returnToJobs
            }
            onOfferToCleaners={showOfferCleaners}
            onRefreshOffers={refreshJobOffers}
            onRefreshIssues={refreshJobIssues}
            onSimulateOffer={openCleanerOffer}
            onCreatePublicOfferLink={createCleanerOfferLink}
            onAssignCleaner={assignCleaner}
            onStartCleaning={startCleaning}
            onCompleteCleaning={completeCleaning}
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

function AuthenticationLoading() {
  const { language, setLanguage, translate } = useTranslation();

  return (
    <AuthenticationLayout language={language} onLanguageChange={setLanguage}>
      <StateCard message={translate("auth.loading")} status="status" />
    </AuthenticationLayout>
  );
}

function ManagerLogin() {
  const { language, setLanguage, translate } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setErrorMessage(translate("auth.credentialsRequired"));
      return;
    }

    setIsSigningIn(true);
    setErrorMessage("");

    try {
      await signInWithEmail({ email: email.trim(), password });
    } catch {
      setErrorMessage(translate("auth.signInError"));
      setIsSigningIn(false);
    }
  }

  return (
    <AuthenticationLayout language={language} onLanguageChange={setLanguage}>
      <section className="panel auth-panel" aria-labelledby="login-title">
        <p className="eyebrow">{translate("auth.managerAccess")}</p>
        <h2 id="login-title" className="panel__title">
          {translate("auth.signIn")}
        </h2>

        <form className="cleaning-form" noValidate onSubmit={handleSubmit}>
          <label>
            {translate("auth.email")}
            <input
              autoComplete="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            {translate("auth.password")}
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {errorMessage && (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="button-row">
            <button className="button button--primary" type="submit" disabled={isSigningIn}>
              {isSigningIn ? translate("auth.signingIn") : translate("auth.signIn")}
            </button>
          </div>
        </form>
      </section>
    </AuthenticationLayout>
  );
}

function AuthenticationLayout({ children, language, onLanguageChange }) {
  const { translate } = useTranslation();

  return (
    <main className="app-shell">
      <section className="foundation auth-foundation" aria-labelledby="page-title">
        <header className="foundation__header">
          <div className="brand-block">
            <p className="eyebrow">{translate("brand.operationsPlatform")}</p>
            <h1 id="page-title">{content.productName}</h1>
          </div>
          <div className="header-actions">
            <LanguageSelector language={language} onChange={onLanguageChange} />
            <span className="badge">{appVersion}</span>
          </div>
        </header>
        {children}
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
  onShowClients,
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
      <button
        className="navigation-button"
        type="button"
        aria-current={activeSection === "clients" ? "page" : undefined}
        onClick={onShowClients}
      >
        {translate("navigation.clients")}
      </button>
    </nav>
  );
}

function Dashboard({
  dashboardData,
  isLoading,
  hasError,
  translate,
  onRefresh,
  onOpenJob,
  onShowJobs,
  onShowJobsWithFilter,
}) {
  const { language } = useTranslation();

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

  const counts = dashboardData?.counts || {};
  const attentionJobs = dashboardData?.attentionJobs || [];
  const openIssues = dashboardData?.openIssues || [];
  const offersByJob = dashboardData?.offersByJob || {};
  const pendingOffersByJob = dashboardData?.pendingOffersByJob || {};
  const next48HoursJobs = dashboardData?.next48HoursJobs || [];
  const recentlyCompletedJobs = dashboardData?.recentlyCompletedJobs || [];
  const weeklySummary = dashboardData?.weeklySummary;
  const offeredJobsWithInterest = attentionJobs.filter(
    (job) =>
      job.operationalStatus === "OFFERED" &&
      !job.assignedCleanerId &&
      (offersByJob[job.id] || []).some((offer) => offer.status === "INTERESTED"),
  );
  const offeredJobsAwaitingResponse = attentionJobs.filter(
    (job) =>
      job.operationalStatus === "OFFERED" &&
      !job.assignedCleanerId &&
      !(offersByJob[job.id] || []).some((offer) => offer.status === "INTERESTED") &&
      pendingOffersByJob[job.id],
  );
  const jobsNeedingAssignment = attentionJobs.filter(
    (job) =>
      job.operationalStatus === "UNASSIGNED" ||
      (job.operationalStatus === "OFFERED" &&
        !job.assignedCleanerId &&
        !(offersByJob[job.id] || []).some((offer) => offer.status === "INTERESTED") &&
        !pendingOffersByJob[job.id]),
  );
  const buildAssignmentAttentionItem = (job, isUrgent = false) => ({
    id: `needs-assignment-${job.id}`,
    type: "assignment",
    icon: "assignment",
    isUrgent,
    job,
    label: translate("dashboard.needsAssignment"),
    detail:
      job.operationalStatus === "UNASSIGNED"
        ? translate("dashboard.noOffers")
        : translate("dashboard.noInterestedCleaners"),
    status: formatOperationalStatus(job.operationalStatus, translate),
    action:
      job.operationalStatus === "UNASSIGNED"
        ? translate("dashboard.sendOffers")
        : translate("dashboard.reviewOffers"),
  });
  const urgentAssignmentItems = sortByScheduledDate(
    jobsNeedingAssignment.filter(isNearTermJob),
  ).map((job) => buildAssignmentAttentionItem(job, true));
  const otherAssignmentItems = sortByScheduledDate(
    jobsNeedingAssignment.filter((job) => !isNearTermJob(job)),
  ).map((job) => buildAssignmentAttentionItem(job));
  const priorityGroups = [
    urgentAssignmentItems,
    sortByScheduledDate(offeredJobsWithInterest).map((job) => {
      const interestedNames = (offersByJob[job.id] || [])
        .filter((offer) => offer.status === "INTERESTED")
        .map((offer) => offer.cleanerName)
        .filter(Boolean)
        .join(", ");

      return {
        id: `interest-${job.id}`,
        type: "interested",
        icon: "user-check",
        job,
        label: translate("dashboard.cleanerInterested"),
        detail: interestedNames || translate("dashboard.cleanerInterestedDescription"),
        status: formatOperationalStatus(job.operationalStatus, translate),
        action: translate("dashboard.reviewAndAssign"),
      };
    }),
    sortIssuesByJobScheduledDate(openIssues).map((issue) => ({
      id: `issue-${issue.job.id}-${issue.id}`,
      type: "issue",
      icon: issueIconName(issue.category),
      job: issue.job,
      label: formatIssueCategory(issue.category, translate),
      detail: `${translate("dashboard.openIssue")} — ${issue.description}`,
      status: formatOperationalStatus(issue.job.operationalStatus, translate),
      action: translate("dashboard.reviewIssue"),
    })),
    sortByScheduledDate(offeredJobsAwaitingResponse).map((job) => ({
      id: `awaiting-response-${job.id}`,
      type: "awaiting",
      icon: "mail",
      job,
      label: translate("dashboard.offersAwaitingResponse"),
      detail: translate("dashboard.noInterestedCleaners"),
      status: formatOperationalStatus(job.operationalStatus, translate),
      action: translate("dashboard.reviewOffers"),
    })),
    otherAssignmentItems,
  ];
  const attentionItems = priorityGroups.flat();
  const visibleAttentionItems = selectPriorityAttentionItems(priorityGroups, 5);
  const hasMoreAttention =
    attentionItems.length > visibleAttentionItems.length ||
    counts.needsAssignment > attentionJobs.length ||
    visibleAttentionItems.length === 5;
  const next48HourGroups = groupNext48HourJobs(next48HoursJobs, translate);

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

      <div className="dashboard-summary" aria-label={translate("dashboard.operation")}>
        <SummaryCard
          label={translate("dashboard.today")}
          count={counts.today || 0}
          icon="calendar"
          onClick={() => onShowJobsWithFilter("today")}
        />
        <SummaryCard
          label={translate("dashboard.needsAssignment")}
          count={counts.needsAssignment || 0}
          icon="assignment"
          onClick={() => onShowJobsWithFilter("needs-assignment")}
        />
        <SummaryCard
          label={translate("dashboard.inProgress")}
          count={counts.inProgress || 0}
          icon="clock"
          onClick={() => onShowJobsWithFilter("in-progress")}
        />
        <SummaryCard
          label={translate("dashboard.completedToday")}
          count={counts.completedToday || 0}
          icon="check-circle"
          onClick={() => onShowJobsWithFilter("completed-today")}
        />
        <SummaryCard
          label={translate("dashboard.openIssues")}
          count={counts.openIssues || 0}
          icon="alert"
          tone="attention"
        />
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="attention-title">
          <div className="dashboard-panel__header dashboard-panel__header--action">
            <div>
              <p className="eyebrow">{translate("dashboard.priorities")}</p>
              <h3 id="attention-title">{translate("dashboard.needsAttention")}</h3>
            </div>
            {hasMoreAttention && (
              <button className="button button--small" type="button" onClick={onShowJobs}>
                {translate("dashboard.viewAll")}
              </button>
            )}
          </div>

          {visibleAttentionItems.length === 0 ? (
            <p className="dashboard-empty">{translate("dashboard.noAttention")}</p>
          ) : (
            <div className="attention-list">
              {visibleAttentionItems.map((item) => (
                <button
                  key={item.id}
                  className={`attention-item attention-item--${item.type}${
                    item.isUrgent ? " attention-item--urgent" : ""
                  }`}
                  type="button"
                  onClick={() => onOpenJob(item.job)}
                >
                  <span className="attention-item__label">
                    <OperationalIcon name={item.icon || "assignment"} />
                    {item.label}
                  </span>
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
          <div className="dashboard-panel__header dashboard-panel__header--action">
            <div>
              <p className="eyebrow">{translate("dashboard.history")}</p>
              <h3 id="completed-title">{translate("dashboard.recentlyCompleted")}</h3>
            </div>
            <button className="button button--small" type="button" onClick={onShowJobs}>
              {translate("dashboard.viewAll")}
            </button>
          </div>

          {recentlyCompletedJobs.length === 0 ? (
            <p className="dashboard-empty">{translate("dashboard.noCompleted")}</p>
          ) : (
            <div className="recent-list">
              {recentlyCompletedJobs.map((job) => (
                <button
                  key={job.id}
                  className="recent-item"
                  type="button"
                  onClick={() => onOpenJob(job)}
                >
                  <strong>{job.propertyName || translate("properties.unnamed")}</strong>
                  <span>{formatDate(job.scheduledDate, translate, language)}</span>
                  <span>{job.assignedCleanerName || translate("common.notProvided")}</span>
                  <small>
                    {formatCreatedAt(job.completedAt, language) ||
                      translate("dashboard.completionUnavailable")}
                  </small>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-panel" aria-labelledby="next-48-hours-title">
        <div className="dashboard-panel__header dashboard-panel__header--action">
          <div>
            <p className="eyebrow">{translate("dashboard.schedule")}</p>
            <h3 id="next-48-hours-title">{translate("dashboard.next48Hours")}</h3>
          </div>
          <button className="button button--small" type="button" onClick={onShowJobs}>
            {translate("dashboard.viewAll")}
          </button>
        </div>

        {next48HourGroups.length === 0 ? (
          <p className="dashboard-empty">{translate("dashboard.noNext48Hours")}</p>
        ) : (
          <div className="dashboard-next-list">
            {next48HourGroups.map(({ day, jobs }) => (
              <section key={day} className="dashboard-next-group" aria-label={day}>
                <h4>{day}</h4>
                {jobs.map((job) => (
                  <DashboardNextJob key={job.id} job={job} onOpen={onOpenJob} />
                ))}
              </section>
            ))}
          </div>
        )}
      </section>

      <DashboardWeekSummary summary={weeklySummary} />
    </section>
  );
}

function DashboardNextJob({ job, onOpen }) {
  const { language, translate } = useTranslation();
  const schedule = [
    formatDate(job.scheduledDate, translate, language),
    job.scheduledStart,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button className="dashboard-next-item" type="button" onClick={() => onOpen(job)}>
      <span>{schedule}</span>
      <strong>{job.propertyName || translate("properties.unnamed")}</strong>
      <span className="dashboard-next-item__status">
        {formatOperationalStatus(job.operationalStatus, translate)}
      </span>
      <span>{job.assignedCleanerName || translate("dashboard.needsAssignment")}</span>
    </button>
  );
}

function DashboardWeekSummary({ summary }) {
  const { language, translate } = useTranslation();

  if (!summary) {
    return null;
  }

  const metrics = [
    { key: "scheduled", icon: "calendar", label: translate("dashboard.weeklyScheduled") },
    { key: "assigned", icon: "user-check", label: translate("dashboard.weeklyAssigned") },
    {
      key: "needsAssignment",
      icon: "assignment",
      label: translate("dashboard.weeklyNeedsAssignment"),
    },
    { key: "completed", icon: "check-circle", label: translate("dashboard.weeklyCompleted") },
  ];
  const maxDailyLoad = Math.max(1, ...summary.dailyLoad.map(({ count }) => count));

  return (
    <section className="dashboard-week" aria-labelledby="this-week-title">
      <div className="dashboard-week__header">
        <h3 id="this-week-title">
          <OperationalIcon name="calendar" />
          {translate("dashboard.thisWeek")}
        </h3>
      </div>

      <div className="dashboard-week__metrics">
        {metrics.map(({ key, icon, label }) => (
          <div key={key} className="dashboard-week__metric">
            <span>
              <OperationalIcon name={icon} />
              {label}
            </span>
            <strong>{summary[key] || 0}</strong>
          </div>
        ))}
      </div>

      <div className="dashboard-week__load" aria-label={translate("dashboard.dailyLoad")}>
        <span className="dashboard-week__load-title">{translate("dashboard.dailyLoad")}</span>
        <div className="dashboard-week__days">
          {summary.dailyLoad.map(({ date, count }) => (
            <div key={date} className="dashboard-week__day">
              <strong>{count}</strong>
              <span className="dashboard-week__bar" aria-hidden="true">
                <span style={{ height: `${(count / maxDailyLoad) * 100}%` }} />
              </span>
              <span>{formatShortWeekday(date, language)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function groupNext48HourJobs(jobs, translate) {
  const today = localDateKeyForDashboard(new Date());
  const tomorrow = localDateKeyForDashboard(
    new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1),
  );
  const followingDay = localDateKeyForDashboard(
    new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 2),
  );
  const groups = new Map();

  for (const job of jobs) {
    const groupKey = job.scheduledDate === today
      ? "dashboard.today"
      : job.scheduledDate === tomorrow
        ? "dashboard.tomorrow"
        : job.scheduledDate === followingDay
          ? "dashboard.followingDay"
          : null;

    if (groupKey) {
      const currentJobs = groups.get(groupKey) || [];
      currentJobs.push(job);
      groups.set(groupKey, currentJobs);
    }
  }

  return ["dashboard.today", "dashboard.tomorrow", "dashboard.followingDay"]
    .filter((groupKey) => groups.has(groupKey))
    .map((groupKey) => ({
      day: translate(groupKey),
      jobs: groups.get(groupKey),
    }));
}

function localDateKeyForDashboard(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function SummaryCard({ label, count, icon, tone, isActive, onClick }) {
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
        <span className="summary-card__label">
          <OperationalIcon name={icon} />
          {label}
        </span>
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
      <span className="summary-card__label">
        <OperationalIcon name={icon} />
        {label}
      </span>
      <strong>{count}</strong>
    </button>
  );
}

function OperationalIcon({ name }) {
  const symbols = {
    calendar: "📅",
    assignment: "⏰",
    clock: "🧹",
    "check-circle": "✅",
    alert: "⚠️",
    "user-check": "👤",
    mail: "📩",
    key: "🚪",
    package: "📦",
    wrench: "🛠️",
    sparkle: "🧹",
  };

  return (
    <span className="operational-icon" aria-hidden="true">
      {symbols[name] || symbols.alert}
    </span>
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

function isNearTermJob(job) {
  if (!job.scheduledDate) {
    return false;
  }

  const scheduledAt = new Date(
    `${job.scheduledDate}T${job.scheduledStart || "00:00:00"}`,
  );

  if (Number.isNaN(scheduledAt.getTime())) {
    return false;
  }

  return scheduledAt.getTime() <= Date.now() + 48 * 60 * 60 * 1000;
}

function selectPriorityAttentionItems(priorityGroups, maximumItems) {
  const visibleItems = [];
  const selectedIds = new Set();
  const addItem = (item) => {
    if (!item || selectedIds.has(item.id) || visibleItems.length >= maximumItems) {
      return;
    }

    selectedIds.add(item.id);
    visibleItems.push(item);
  };

  for (const group of priorityGroups) {
    addItem(group[0]);
  }

  for (const group of priorityGroups) {
    for (const item of group) {
      addItem(item);
    }
  }

  return visibleItems;
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

function issueIconName(category) {
  return {
    ACCESS: "key",
    SUPPLIES: "package",
    BROKEN_ITEM: "wrench",
    HEAVY_CLEANING: "sparkle",
    OTHER: "alert",
  }[category] || "alert";
}

function PropertyList({ properties, isLoading, hasError, onSelect, onCreate }) {
  const { translate } = useTranslation();
  if (isLoading) {
    return <StateCard message={translate("properties.loading")} status="status" />;
  }

  if (hasError) {
    return <StateCard message={translate("properties.error")} status="alert" isError />;
  }

  return (
    <section aria-labelledby="properties-title">
      <div className="directory-heading">
        <div>
          <p className="eyebrow">{translate("navigation.properties")}</p>
          <h2 id="properties-title" className="list-title">
            {translate("properties.title")}
          </h2>
        </div>
        <button className="button button--primary" type="button" onClick={onCreate}>
          {translate("properties.new")}
        </button>
      </div>

      {properties.length === 0 ? (
        <StateCard message={translate("properties.empty")} />
      ) : (
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
      )}
    </section>
  );
}

function ClientDirectory({ clients, isLoading, hasError, onCreate, onSelect }) {
  const { translate } = useTranslation();

  if (isLoading) {
    return <StateCard message={translate("clients.loading")} status="status" />;
  }

  if (hasError) {
    return <StateCard message={translate("clients.error")} status="alert" isError />;
  }

  const sortedClients = [...clients].sort((firstClient, secondClient) =>
    (firstClient.name || "").localeCompare(secondClient.name || ""),
  );

  return (
    <section aria-labelledby="clients-title">
      <div className="directory-heading">
        <div>
          <p className="eyebrow">{translate("navigation.clients")}</p>
          <h2 id="clients-title" className="list-title">
            {translate("clients.title")}
          </h2>
        </div>
        <button className="button button--primary" type="button" onClick={onCreate}>
          {translate("clients.new")}
        </button>
      </div>

      {sortedClients.length === 0 ? (
        <StateCard message={translate("clients.empty")} />
      ) : (
        <div className="client-directory">
          {sortedClients.map((client) => {
            const clientName = client.name || translate("common.notProvided");

            return (
            <button
              key={client.id}
              className="client-card"
              type="button"
              aria-label={translate("clients.view", { client: clientName })}
              onClick={() => onSelect(client)}
            >
              <strong>{client.name || translate("common.notProvided")}</strong>
              <span className="status-badge">
                {client.active === false
                  ? translate("common.inactive")
                  : translate("common.active")}
              </span>
            </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ClientDetail({
  client,
  onBack,
  onOpenProperty,
  onCreateProperty,
  onOpenJob,
}) {
  const { language, translate } = useTranslation();
  const [properties, setProperties] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [jobHistory, setJobHistory] = useState(null);
  const [hasJobHistoryError, setHasJobHistoryError] = useState(false);
  const clientName = client.name || translate("common.notProvided");
  const clientStatus = client.active === false
    ? translate("common.inactive")
    : translate("common.active");

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setHasError(false);

    async function loadLinkedProperties() {
      try {
        const loadedProperties = await getPropertiesForClient(client.id);

        if (isCurrent) {
          setProperties(loadedProperties);
        }
      } catch {
        if (isCurrent) {
          setHasError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadLinkedProperties();

    return () => {
      isCurrent = false;
    };
  }, [client.id]);

  const sortedProperties = [...properties].sort((firstProperty, secondProperty) =>
    (firstProperty.name || "").localeCompare(secondProperty.name || ""),
  );

  useEffect(() => {
    if (isLoading) {
      return undefined;
    }

    let isCurrent = true;
    setJobHistory(null);
    setHasJobHistoryError(false);

    async function loadJobHistory() {
      try {
        const loadedHistory = await getClientJobHistory(
          client.id,
          hasError ? [] : properties.map((property) => property.id),
        );

        if (isCurrent) {
          setJobHistory(loadedHistory);
        }
      } catch {
        if (isCurrent) {
          setHasJobHistoryError(true);
        }
      }
    }

    loadJobHistory();

    return () => {
      isCurrent = false;
    };
  }, [client.id, hasError, isLoading, properties]);

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

        {isLoading && (
          <p className="property-history-state">{translate("clients.propertiesLoading")}</p>
        )}

        {hasError && (
          <p className="property-history-state property-history-state--error" role="alert">
            {translate("clients.propertiesError")}
          </p>
        )}

        {!isLoading && !hasError && sortedProperties.length === 0 && (
          <p className="property-history-state">{translate("clients.noLinkedProperties")}</p>
        )}

        {!isLoading && !hasError && sortedProperties.length > 0 && (
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
  const { language, translate } = useTranslation();

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

function ClientCreateForm({ onBack, onSaved }) {
  const { translate } = useTranslation();
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function saveClient(event) {
    event.preventDefault();
    const clientName = name.trim();

    if (!clientName) {
      setFormError(translate("clients.nameRequired"));
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const client = await createClient({ name: clientName, active });
      onSaved(client);
    } catch {
      setFormError(translate("clients.createError"));
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="client-create-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("navigation.clients")}</p>
      <h2 id="client-create-title" className="panel__title">
        {translate("clients.createTitle")}
      </h2>

      <form className="cleaning-form" noValidate onSubmit={saveClient}>
        <label>
          {translate("clients.name")}
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>

        <label className="cleaner-active-field">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
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
            {isSaving ? translate("clients.creating") : translate("clients.save")}
          </button>
        </div>
      </form>
    </section>
  );
}

function PropertyCreateForm({ properties, preselectedClient, onBack, onSaved }) {
  const { translate } = useTranslation();
  const [formValues, setFormValues] = useState(() =>
    createEmptyPropertyForm(preselectedClient),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const clientNames = [...new Set(
    properties.map((property) => property.clientName).filter(Boolean),
  )].sort((firstClient, secondClient) => firstClient.localeCompare(secondClient));

  function updateField(event) {
    const { name, value, checked, type } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function saveProperty(event) {
    event.preventDefault();
    const name = formValues.name.trim();
    const clientName = formValues.clientName.trim();
    const defaultClientPrice = optionalPrice(formValues.defaultClientPrice);
    const defaultCleanerPrice = optionalPrice(formValues.defaultCleanerPrice);

    if (!name) {
      setFormError(translate("properties.nameRequired"));
      return;
    }

    if (!clientName) {
      setFormError(translate("properties.clientRequired"));
      return;
    }

    if (defaultClientPrice === null || defaultCleanerPrice === null) {
      setFormError(translate("properties.priceInvalid"));
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const property = await createProperty({
        name,
        clientId: preselectedClient?.id,
        clientName,
        defaultClientPrice,
        defaultCleanerPrice,
        active: formValues.active,
      });

      onSaved(property);
    } catch {
      setFormError(translate("properties.createError"));
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="property-create-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("navigation.properties")}</p>
      <h2 id="property-create-title" className="panel__title">
        {translate("properties.createTitle")}
      </h2>

      <form className="cleaning-form" noValidate onSubmit={saveProperty}>
        <label>
          {translate("properties.name")}
          <input name="name" value={formValues.name} onChange={updateField} required />
        </label>

        {preselectedClient ? (
          <label>
            {translate("properties.currentClient")}
            <input value={preselectedClient.name || ""} readOnly />
          </label>
        ) : (
          <label>
            {translate("common.client")}
            <select
              name="clientName"
              value={formValues.clientName}
              onChange={updateField}
              required
            >
              <option value="">{translate("properties.selectClient")}</option>
              {clientNames.map((clientName) => (
                <option key={clientName} value={clientName}>{clientName}</option>
              ))}
            </select>
          </label>
        )}

        <label>
          {translate("properties.defaultClientPrice")}
          <input
            type="number"
            name="defaultClientPrice"
            value={formValues.defaultClientPrice}
            min="0"
            step="0.01"
            inputMode="decimal"
            onChange={updateField}
          />
        </label>

        <label>
          {translate("properties.defaultCleanerPrice")}
          <input
            type="number"
            name="defaultCleanerPrice"
            value={formValues.defaultCleanerPrice}
            min="0"
            step="0.01"
            inputMode="decimal"
            onChange={updateField}
          />
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
            {isSaving ? translate("properties.creating") : translate("properties.save")}
          </button>
        </div>
      </form>
    </section>
  );
}

function PropertyClientLinkForm({ property, onBack, onLinked }) {
  const { translate } = useTranslation();
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const currentClientName = property.clientName || translate("common.notProvided");

  useEffect(() => {
    let isCurrent = true;

    async function loadActiveClients() {
      setIsLoading(true);
      setHasLoadError(false);

      try {
        const loadedClients = await getActiveClients();

        if (isCurrent) {
          setClients(loadedClients);
        }
      } catch {
        if (isCurrent) {
          setHasLoadError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadActiveClients();

    return () => {
      isCurrent = false;
    };
  }, [property.id]);

  const sortedClients = [...clients].sort((firstClient, secondClient) =>
    (firstClient.name || "").localeCompare(secondClient.name || ""),
  );

  async function saveLink(event) {
    event.preventDefault();
    const selectedClient = clients.find((client) => client.id === selectedClientId);

    if (!selectedClient) {
      setFormError(translate("properties.clientRequired"));
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const propertyUpdate = await linkPropertyToClient(property.id, selectedClient);
      onLinked(propertyUpdate);
    } catch {
      setFormError(translate("properties.linkClientError"));
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="property-link-client-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("properties.details")}</p>
      <h2 id="property-link-client-title" className="panel__title">
        {translate("properties.linkClient")}
      </h2>

      <dl className="detail-list">
        <DetailItem label={translate("common.property")} value={property.name || translate("properties.unnamed")} />
        <DetailItem label={translate("properties.currentClient")} value={currentClientName} />
      </dl>

      {isLoading && <StateCard message={translate("properties.loadingClients")} status="status" />}

      {hasLoadError && (
        <StateCard message={translate("properties.clientsError")} status="alert" isError />
      )}

      {!isLoading && !hasLoadError && (
        <form className="cleaning-form" noValidate onSubmit={saveLink}>
          {sortedClients.length === 0 ? (
            <StateCard message={translate("properties.noActiveClients")} />
          ) : (
            <label>
              {translate("properties.selectClient")}
              <select
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
                required
              >
                <option value="">{translate("properties.selectClient")}</option>
                {sortedClients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </label>
          )}

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}

          {sortedClients.length > 0 && (
            <div className="button-row">
              <button className="button button--primary" type="submit" disabled={isSaving}>
                {isSaving ? translate("properties.linkingClient") : translate("properties.confirmClientLink")}
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

function PropertyDetail({ property, onBack, onCreateCleaning, onOpenJob, onLinkClient }) {
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

      <PropertyOperationalHistory propertyId={property.id} onOpenJob={onOpenJob} />
    </section>
  );
}

function PropertyOperationalHistory({ propertyId, onOpenJob }) {
  const { language, translate } = useTranslation();
  const [history, setHistory] = useState(null);
  const [hasHistoryError, setHasHistoryError] = useState(false);

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
        <h3 id="property-upcoming-job-title">{translate("properties.upcomingService")}</h3>

        {!history && !hasHistoryError && (
          <p className="property-history-state">{translate("properties.historyLoading")}</p>
        )}

        {hasHistoryError && (
          <p className="property-history-state property-history-state--error" role="alert">
            {translate("properties.historyError")}
          </p>
        )}

        {history && !history.upcomingJob && (
          <p className="property-history-state">{translate("properties.noUpcomingService")}</p>
        )}

        {history?.upcomingJob && (
          <PropertyHistoryJob job={history.upcomingJob} onOpen={onOpenJob} />
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
        <span>{job.assignedCleanerName || translate("dashboard.notAssigned")}</span>
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

function JobList({ jobs, isLoading, hasError, onSelect, filter }) {
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
  const filterLabel = {
    today: translate("jobs.filterToday"),
    "needs-assignment": translate("jobs.filterNeedsAssignment"),
    "in-progress": translate("jobs.filterInProgress"),
    "completed-today": translate("jobs.filterCompletedToday"),
  }[filter];

  return (
    <section aria-labelledby="jobs-title">
      <p className="eyebrow">{translate("navigation.jobs")}</p>
      <h2 id="jobs-title" className="list-title">
        {translate("jobs.title")}
      </h2>
      {filterLabel && <p className="job-list__context">{filterLabel}</p>}

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

function InformationIcon({ name }) {
  if (name === "phone") {
    return (
      <svg className="information-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 3.5h3l1.5 4-2 1.75a16.5 16.5 0 0 0 6.75 6.75l1.75-2 4 1.5v3a2 2 0 0 1-2.1 2A16.9 16.9 0 0 1 3.5 5.6a2 2 0 0 1 2-2.1Z" />
      </svg>
    );
  }

  return (
    <svg className="information-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5C9.9 18.2 8.8 15.4 8.8 12S9.9 5.8 12 3.5Z" />
    </svg>
  );
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
              aria-label={translate("cleaners.view", {
                cleaner: cleaner.name || translate("common.notProvided"),
              })}
              onClick={() => onSelect(cleaner)}
            >
              <span className="cleaner-directory-card__identity">
                <strong>{cleaner.name || translate("common.notProvided")}</strong>
                <span className="cleaner-directory-card__detail">
                  <InformationIcon name="phone" />
                  {cleaner.phone || translate("cleaners.noPhone")}
                </span>
              </span>
              <span className="cleaner-directory-card__details">
                <span className="cleaner-directory-card__detail">
                  <InformationIcon name="language" />
                  {preferredLanguageLabel(cleaner.preferredLanguage, translate)}
                </span>
              </span>
              <span className="status-badge cleaner-directory-card__status-badge">
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

function CleanerDetail({ cleaner, onBack, onOpenJob }) {
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
  onCreatePublicOfferLink,
  onAssignCleaner,
  onStartCleaning,
  onCompleteCleaning,
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
  const [publicOfferLink, setPublicOfferLink] = useState(null);
  const [isCreatingPublicOfferLinkFor, setIsCreatingPublicOfferLinkFor] = useState(null);
  const [publicOfferLinkError, setPublicOfferLinkError] = useState(null);
  const [isStartingCleaning, setIsStartingCleaning] = useState(false);
  const [hasStartCleaningError, setHasStartCleaningError] = useState(false);
  const [isCompletingCleaning, setIsCompletingCleaning] = useState(false);
  const [hasCompleteCleaningError, setHasCompleteCleaningError] = useState(false);
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
  const isInProgress = job.operationalStatus === "IN_PROGRESS";
  const isCompleted = job.operationalStatus === "COMPLETED";
  const canManageOffers = !isCompleted;
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

  async function createOfferLink(offer) {
    setIsCreatingPublicOfferLinkFor(offer.id);
    setPublicOfferLinkError(null);

    try {
      const link = await onCreatePublicOfferLink(offer);
      setPublicOfferLink({ offerId: offer.id, ...link });
    } catch {
      setPublicOfferLinkError(offer.id);
    } finally {
      setIsCreatingPublicOfferLinkFor(null);
    }
  }

  async function startCleaning() {
    setIsStartingCleaning(true);
    setHasStartCleaningError(false);

    try {
      await onStartCleaning();
    } catch {
      setHasStartCleaningError(true);
    } finally {
      setIsStartingCleaning(false);
    }
  }

  async function completeCleaning() {
    setIsCompletingCleaning(true);
    setHasCompleteCleaningError(false);

    try {
      await onCompleteCleaning();
    } catch {
      setHasCompleteCleaningError(true);
    } finally {
      setIsCompletingCleaning(false);
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

      {(job.operationalStatus === "ASSIGNED" || isInProgress || isCompleted) && (
        <section className="job-execution" aria-label={translate("jobs.operationalStatus")}>
          {isInProgress && (
            <p className="job-execution__state job-execution__state--in-progress">
              <OperationalIcon name="clock" />
              {translate("jobs.executionInProgress")}
            </p>
          )}
          {isCompleted && (
            <p className="job-execution__state job-execution__state--completed">
              <OperationalIcon name="check-circle" />
              {translate("jobs.executionCompleted")}
            </p>
          )}
          {job.operationalStatus === "ASSIGNED" && (
            <div className="button-row job-execution__actions">
              <button
                className="button button--primary"
                type="button"
                disabled={isStartingCleaning}
                onClick={startCleaning}
              >
                {isStartingCleaning
                  ? translate("jobs.startingCleaning")
                  : translate("jobs.startCleaning")}
              </button>
            </div>
          )}
          {isInProgress && (
            <div className="button-row job-execution__actions">
              <button
                className="button button--primary"
                type="button"
                disabled={isCompletingCleaning}
                onClick={completeCleaning}
              >
                {isCompletingCleaning
                  ? translate("jobs.completingCleaning")
                  : translate("jobs.completeCleaning")}
              </button>
            </div>
          )}
          {hasStartCleaningError && (
            <p className="form-error" role="alert">
              {translate("jobs.startCleaningError")}
            </p>
          )}
          {hasCompleteCleaningError && (
            <p className="form-error" role="alert">
              {translate("jobs.completeCleaningError")}
            </p>
          )}
        </section>
      )}

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
                  {canManageOffers && (
                    <div className="offer-status-actions">
                      <button
                        className="button"
                        type="button"
                        onClick={() => onSimulateOffer(offer)}
                      >
                        {translate("offers.simulateOffer")}
                      </button>
                      {offer.status === "PENDING" && (
                        <button
                          className="button"
                          type="button"
                          disabled={isCreatingPublicOfferLinkFor !== null}
                          onClick={() => createOfferLink(offer)}
                        >
                          {isCreatingPublicOfferLinkFor === offer.id
                            ? translate("offers.creatingPublicLink")
                            : translate("offers.createPublicLink")}
                        </button>
                      )}
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
                  )}
                  {publicOfferLink?.offerId === offer.id && (
                    <a
                      className="public-offer-link"
                      href={publicOfferLink.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {translate("offers.openPublicLink")}
                    </a>
                  )}
                  {publicOfferLinkError === offer.id && (
                    <p className="form-error" role="alert">
                      {translate("offers.publicLinkError")}
                    </p>
                  )}
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
        {canManageOffers && (
          <button
            className="button button--primary"
            type="button"
            onClick={onOfferToCleaners}
          >
            {translate("offers.offerToCleaners")}
          </button>
        )}
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

import { useEffect, useMemo, useState } from "react";
import { appVersion } from "./appVersion.js";
import { OperationalIcon } from "./components/OperationalIcon.jsx";
import {
  DetailItem,
  StateCard,
} from "./components/UiPrimitives.jsx";
import { FeedbackPanel } from "./features/feedback/FeedbackPanel.jsx";
import { NotificationControl } from "./features/notifications/NotificationControl.jsx";
import { PwaUpdatePrompt } from "./features/pwa/PwaUpdatePrompt.jsx";
import { PayoutDirectory, PayoutReview } from "./features/payouts/PayoutViews.jsx";
import { usePayoutsController } from "./features/payouts/usePayoutsController.js";
import { WhatsNewPanel } from "./features/releases/WhatsNewPanel.jsx";
import {
  signInWithEmail,
  signOutManager,
  subscribeToAuthState,
} from "./features/auth/authService.js";
import { currentCleanerName } from "./features/cleaners/cleanerIdentity.js";
import { CleanerDetail } from "./features/cleaners/CleanerDetail.jsx";
import { CleanerDirectory } from "./features/cleaners/CleanerDirectory.jsx";
import {
  CleanerProfileForm,
  CleanerProfileSuccess,
} from "./features/cleaners/CleanerProfileForm.jsx";
import { useCleanersController } from "./features/cleaners/useCleanersController.js";
import { ClientDetail } from "./features/clients/ClientDetail.jsx";
import { ClientDirectory } from "./features/clients/ClientDirectory.jsx";
import { ClientForm } from "./features/clients/ClientForm.jsx";
import { useClientsController } from "./features/clients/useClientsController.js";
import { getOperationalDashboard } from "./features/dashboard/dashboardService.js";
import {
  formatIssueCategory,
  issueIconName,
} from "./features/issues/issuePresentation.js";
import { JobDetail } from "./features/jobs/JobDetail.jsx";
import { CleaningSuccess, CreateCleaningForm } from "./features/jobs/JobForm.jsx";
import { JobsPage } from "./features/jobs/JobsPage.jsx";
import {
  createJobListFilters,
  dashboardJobListFilters,
} from "./features/jobs/jobListFilters.js";
import { useJobDetailController } from "./features/jobs/useJobDetailController.js";
import { useJobsWorklist } from "./features/jobs/useJobsWorklist.js";
import {
  AssignedCleanerJob,
  CleanerOfferSimulation,
  IssueForm,
  IssueSuccess,
  OfferCleaners,
  OffersSuccess,
} from "./features/jobs/JobWorkflowViews.jsx";
import {
  getPublicOffer,
  respondToPublicOffer,
} from "./features/public-offers/publicOfferService.js";
import { languageOptions, useTranslation } from "./i18n/translations.js";
import { ThemeProvider, useTheme } from "./theme/theme.js";
import {
  formatCreatedAt,
  formatDate,
  formatOperationalStatus,
  formatPrice,
  formatShortWeekday,
  formatStatus,
} from "./lib/presentation.js";
import { PropertyDetail } from "./features/properties/PropertyDetail.jsx";
import { PropertyDirectory } from "./features/properties/PropertyDirectory.jsx";
import {
  PropertyClientLinkForm,
  PropertyForm,
} from "./features/properties/PropertyForm.jsx";
import { usePropertiesController } from "./features/properties/usePropertiesController.js";

const content = {
  productName: "CleanFlow",
  unnamedProperty: "Unnamed property",
};

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
    <ThemeProvider>
      <ManagerApplication
        authUser={authUser}
        hasSignOutError={hasSignOutError}
        isSigningOut={isSigningOut}
        onSignOut={handleSignOut}
      />
    </ThemeProvider>
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

function ManagerApplication({ authUser, hasSignOutError, isSigningOut, onSignOut }) {
  const { language, setLanguage, translate } = useTranslation();
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [hasDashboardError, setHasDashboardError] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [view, setView] = useState("dashboard");
  const [jobDetailOrigin, setJobDetailOrigin] = useState("jobs");
  const [propertyDetailOrigin, setPropertyDetailOrigin] = useState("properties");
  const [createdJob, setCreatedJob] = useState(null);
  const jobWorklist = useJobsWorklist({ view });
  const jobDetail = useJobDetailController({
    view,
    onJobUpdated: jobWorklist.replaceJob,
  });
  const cleanersController = useCleanersController({ view });
  const clientsController = useClientsController({ view });
  const payoutsController = usePayoutsController({ view });
  const propertiesController = usePropertiesController();
  const {
    jobs,
    isLoading: isLoadingJobs,
    hasError: hasJobError,
    filters: jobListFilters,
    cleaners: jobFilterCleaners,
    hasMore: hasMoreJobs,
    isLoadingMore: isLoadingMoreJobs,
    setFilters: setJobListFilters,
    resetPagination: resetJobPagination,
    loadMore: loadMoreJobs,
  } = jobWorklist;
  const {
    job: selectedJob,
    detail: {
      offers: jobOffers,
      isLoadingOffers,
      hasOffersError,
      issues: jobIssues,
      isLoadingIssues,
      hasIssuesError,
      refreshOffers: refreshJobOffers,
      refreshIssues: refreshJobIssues,
    },
    offerFlow: {
      offersSentCount,
      selectedOffer,
      availableCleaners: cleaners,
      isLoadingCleaners,
      hasCleanerError,
      clearOffersSentCount,
      setSelectedOffer,
      recordOffersSent,
      createCleanerOfferLink,
    },
    actions: {
      assignCleaner,
      startCleaning,
      completeCleaning,
      resolveJobIssue,
    },
    openJob: openJobDetail,
    closeJob: closeJobDetail,
    prepareJobDetailRefresh,
  } = jobDetail;
  const {
    directory: {
      cleaners: directoryCleaners,
      isLoading: isLoadingDirectoryCleaners,
      hasError: hasDirectoryCleanersError,
    },
    profile: {
      selectedCleaner,
      savedCleaner,
      clearCleaner,
      openCleaner: selectCleaner,
      clearSavedCleaner,
      saveCleaner,
    },
  } = cleanersController;
  const {
    directory: {
      clients,
      isLoading: isLoadingClients,
      hasError: hasClientsError,
    },
    detail: {
      selectedClient,
      properties: clientProperties,
      isLoadingProperties: isLoadingClientProperties,
      hasPropertiesError: hasClientPropertiesError,
      jobHistory: clientJobHistory,
      hasJobHistoryError: hasClientJobHistoryError,
      clearClient,
      openClient: selectClient,
    },
    saveClient,
  } = clientsController;
  const {
    directory: {
      payoutGroups,
      recentPayouts,
      isLoading: isLoadingPayouts,
      hasError: hasPayoutsError,
      refresh: refreshPayouts,
    },
    review: {
      selectedGroup: selectedPayoutGroup,
      paidSummary: paidPayoutSummary,
      resetPayoutView,
      openReview,
      recordPayout,
      recordPayoutComplete,
    },
    proof: {
      attachProof,
      getProofUrl,
    },
  } = payoutsController;
  const {
    directory: {
      properties,
      isLoading: isLoadingProperties,
      hasError: hasPropertyError,
    },
    selection: {
      selectedProperty,
      clearProperty,
      openProperty: selectProperty,
    },
    saveProperty,
    linkClient,
  } = propertiesController;

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

  function showProperties() {
    setActiveSection("properties");
    setPropertyDetailOrigin("properties");
    clearProperty();
    clearClient();
    closeJobDetail();
    setCreatedJob(null);
    clearOffersSentCount();
    setView("property-list");
  }

  function showNewProperty() {
    setPropertyDetailOrigin("properties");
    clearProperty();
    clearClient();
    setView("property-create");
  }

  function showPropertyClientLink() {
    setView("property-link-client");
  }

  function showDashboard() {
    setActiveSection("dashboard");
    clearProperty();
    closeJobDetail();
    setView("dashboard");
  }

  function showJobList(filters = createJobListFilters()) {
    setActiveSection("jobs");
    clearProperty();
    closeJobDetail();
    clearOffersSentCount();
    resetJobPagination();
    setJobListFilters(createJobListFilters(filters));
    setView("job-list");
  }

  function showJobs() {
    showJobList();
  }

  function showJobsWithFilter(filter) {
    showJobList(dashboardJobListFilters(filter));
  }

  function returnToJobs() {
    showJobList(jobListFilters);
  }

  function showCleaners() {
    setActiveSection("cleaners");
    clearProperty();
    closeJobDetail();
    clearCleaner();
    setView("cleaner-list");
  }

  function showPayouts() {
    setActiveSection("payouts");
    clearProperty();
    closeJobDetail();
    clearCleaner();
    resetPayoutView();
    setView("payout-list");
  }

  function openPayoutReview(group) {
    setActiveSection("payouts");
    openReview(group);
    setView("payout-review");
  }

  function showRecordedPayout(payout) {
    recordPayoutComplete(payout);
    setView("payout-list");
  }

  function showClients() {
    setActiveSection("clients");
    clearProperty();
    clearClient();
    closeJobDetail();
    clearCleaner();
    setView("client-list");
  }

  function openCleaner(cleaner) {
    setActiveSection("cleaners");
    selectCleaner(cleaner);
    setView("cleaner-detail");
  }

  function showCleanerDetail() {
    clearSavedCleaner();
    setView("cleaner-detail");
  }

  function showEditCleaner() {
    clearSavedCleaner();
    setView("cleaner-edit");
  }

  function showNewCleaner() {
    clearCleaner();
    setView("cleaner-create");
  }

  function showNewClient() {
    clearClient();
    setView("client-create");
  }

  function openClient(client) {
    setActiveSection("clients");
    clearProperty();
    selectClient(client);
    setView("client-detail");
  }

  function openProperty(property) {
    setActiveSection("properties");
    setPropertyDetailOrigin("properties");
    clearClient();
    selectProperty(property);
    setView("property-detail");
  }

  function openClientProperty(property) {
    setActiveSection("clients");
    setPropertyDetailOrigin("client");
    selectProperty(property);
    setView("property-detail");
  }

  function openClientJob(job) {
    setActiveSection("clients");
    setJobDetailOrigin("client");
    openJobDetail(job);
    setView("job-detail");
  }

  function openCleanerJob(job) {
    setActiveSection("cleaners");
    setJobDetailOrigin("cleaner");
    openJobDetail(job);
    setView("job-detail");
  }

  function returnToCleanerDetail() {
    closeJobDetail();
    setView("cleaner-detail");
  }

  function returnToClientDetail() {
    clearProperty();
    setView("client-detail");
  }

  function showNewPropertyForClient() {
    setPropertyDetailOrigin("client");
    clearProperty();
    setView("property-create");
  }

  function openJob(job) {
    setActiveSection("jobs");
    setJobDetailOrigin("jobs");
    openJobDetail(job);
    setView("job-detail");
  }

  function openPropertyJob(job) {
    setActiveSection("properties");
    setJobDetailOrigin("property");
    openJobDetail(job);
    setView("job-detail");
  }

  function returnToPropertyDetail() {
    closeJobDetail();
    setView("property-detail");
  }

  function openDashboardJob(job) {
    setActiveSection("dashboard");
    setJobDetailOrigin("dashboard");
    openJobDetail(job);
    setView("job-detail");
  }

  function showOfferCleaners() {
    clearOffersSentCount();
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
    prepareJobDetailRefresh();
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
              onShowPayouts={showPayouts}
              onShowClients={showClients}
            />
          </div>
          <div className="header-actions">
            <div className="manager-account">
              <ManagerIdentity user={authUser} />
              <div className="manager-account__controls">
                <LanguageSelector language={language} onChange={setLanguage} />
                <ThemeToggle />
                <NotificationControl />
                <FeedbackPanel screen={view} />
                <WhatsNewPanel />
                <button
                  className="header-sign-out"
                  type="button"
                  disabled={isSigningOut}
                  onClick={onSignOut}
                >
                  {isSigningOut ? translate("auth.signingOut") : translate("auth.signOut")}
                </button>
                <span className="badge">{appVersion}</span>
              </div>
            </div>
            {hasSignOutError && (
              <p className="header-auth-error" role="alert">
                {translate("auth.signOutError")}
              </p>
            )}
          </div>
        </header>

        <PwaUpdatePrompt />

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
          <PropertyDirectory
            properties={properties}
            isLoading={isLoadingProperties}
            hasError={hasPropertyError}
            onSelect={openProperty}
            onCreate={showNewProperty}
          />
        )}

        {view === "property-create" && (
          <PropertyForm
            properties={properties}
            preselectedClient={
              propertyDetailOrigin === "client" ? selectedClient : null
            }
            onBack={
              propertyDetailOrigin === "client" ? returnToClientDetail : showProperties
            }
            onSaved={async (values) => {
              const property = await saveProperty(values);
              if (propertyDetailOrigin === "client") {
                clearProperty();
                setView("client-detail");
              } else {
                selectProperty(property);
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
            onLinked={async (client) => {
              await linkClient(selectedProperty, client);
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
          <JobsPage
            jobs={jobs}
            isLoading={isLoadingJobs}
            hasError={hasJobError}
            onSelect={openJob}
            filters={jobListFilters}
            cleaners={jobFilterCleaners}
            properties={properties}
            onFiltersChange={(updates) =>
              setJobListFilters((currentFilters) => ({ ...currentFilters, ...updates }))
            }
            onClearFilters={() => setJobListFilters(createJobListFilters())}
            hasMore={hasMoreJobs}
            isLoadingMore={isLoadingMoreJobs}
            onLoadMore={loadMoreJobs}
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

        {view === "payout-list" && (
          <PayoutDirectory
            payoutGroups={payoutGroups}
            recentPayouts={recentPayouts}
            isLoading={isLoadingPayouts}
            hasError={hasPayoutsError}
            paidSummary={paidPayoutSummary}
            onRefresh={refreshPayouts}
            onReview={openPayoutReview}
            onUploadProof={attachProof}
            onOpenProof={getProofUrl}
            formatPrice={(amount) => formatPrice(amount, translate, language)}
            formatCreatedAt={(date) => formatCreatedAt(date, language)}
          />
        )}

        {view === "payout-review" && selectedPayoutGroup && (
          <PayoutReview
            cleaner={selectedPayoutGroup.cleaner}
            jobs={selectedPayoutGroup.jobs}
            onBack={showPayouts}
            onRecord={recordPayout}
            onUploadProof={attachProof}
            onRecorded={showRecordedPayout}
            formatDate={(date) => formatDate(date, translate, language)}
            formatCreatedAt={(date) => formatCreatedAt(date, language)}
            formatPrice={(amount) => formatPrice(amount, translate, language)}
          />
        )}

        {view === "cleaner-detail" && selectedCleaner && (
          <CleanerDetail
            cleaner={selectedCleaner}
            onBack={showCleaners}
            onEdit={showEditCleaner}
            onOpenJob={openCleanerJob}
          />
        )}

        {view === "cleaner-create" && (
          <CleanerProfileForm
            key="new-cleaner"
            defaultPreferredLanguage={language}
            onBack={showCleaners}
            onSave={saveCleaner}
            onSaved={() => setView("cleaner-success")}
          />
        )}

        {view === "cleaner-edit" && selectedCleaner && (
          <CleanerProfileForm
            key={selectedCleaner.id}
            cleaner={selectedCleaner}
            defaultPreferredLanguage={language}
            onBack={showCleanerDetail}
            onSave={saveCleaner}
            onSaved={() => setView("cleaner-success")}
          />
        )}

        {view === "cleaner-success" && savedCleaner && (
          <CleanerProfileSuccess
            cleaner={savedCleaner}
            onBack={savedCleaner.wasCreated ? showCleaners : showCleanerDetail}
            backLabel={
              savedCleaner.wasCreated
                ? "cleaners.backToDirectory"
                : "cleaners.backToDetail"
            }
          />
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
            properties={clientProperties}
            isLoadingProperties={isLoadingClientProperties}
            hasPropertiesError={hasClientPropertiesError}
            jobHistory={clientJobHistory}
            hasJobHistoryError={hasClientJobHistoryError}
            onBack={showClients}
            onOpenProperty={openClientProperty}
            onCreateProperty={showNewPropertyForClient}
            onOpenJob={openClientJob}
          />
        )}

        {view === "client-create" && (
          <ClientForm
            onBack={showClients}
            onSaved={async (values) => {
              await saveClient(values);
              setView("client-list");
            }}
          />
        )}

        {view === "job-detail" && selectedJob && (
          <JobDetail
            job={selectedJob}
            knownCleaners={directoryCleaners}
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
              recordOffersSent(count, updatedJob);
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

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { translate } = useTranslation();
  const isDark = theme === "dark";
  const label = isDark ? translate("theme.switchToLight") : translate("theme.switchToDark");

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span aria-hidden="true">{isDark ? "☀" : "☾"}</span>
    </button>
  );
}

function ManagerIdentity({ user }) {
  const { translate } = useTranslation();
  const displayName = user.displayName?.trim();
  const email = user.email || "";

  return (
    <div className="manager-identity">
      <strong>{displayName || email || translate("auth.managerAccess")}</strong>
      {displayName && email && <span>{email}</span>}
    </div>
  );
}

function MainNavigation({
  activeSection,
  translate,
  onShowDashboard,
  onShowProperties,
  onShowJobs,
  onShowCleaners,
  onShowPayouts,
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
        aria-current={activeSection === "payouts" ? "page" : undefined}
        onClick={onShowPayouts}
      >
        {translate("navigation.payouts")}
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
  const cleanerNamesById = dashboardData?.cleanerNamesById || {};
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
        .map((offer) =>
          currentCleanerName(
            offer.cleanerId,
            offer.cleanerName,
            cleanerNamesById,
            "",
          ),
        )
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
              <p className="dashboard-panel__subtitle">
                {translate("dashboard.needsAttentionDescription")}
              </p>
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
                  <span>
                    {currentCleanerName(
                      job.assignedCleanerId,
                      job.assignedCleanerName,
                      cleanerNamesById,
                      translate("common.notProvided"),
                    )}
                  </span>
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
                  <DashboardNextJob
                    key={job.id}
                    job={job}
                    cleanerNamesById={cleanerNamesById}
                    onOpen={onOpenJob}
                  />
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

function DashboardNextJob({ job, cleanerNamesById, onOpen }) {
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
      <span>
        {currentCleanerName(
          job.assignedCleanerId,
          job.assignedCleanerName,
          cleanerNamesById,
          translate("dashboard.needsAssignment"),
        )}
      </span>
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

export default App;

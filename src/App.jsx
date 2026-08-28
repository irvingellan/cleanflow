import { useEffect, useMemo, useState } from "react";
import { appVersion } from "./appVersion.js";
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
import { Dashboard } from "./features/dashboard/Dashboard.jsx";
import { useDashboardController } from "./features/dashboard/useDashboardController.js";
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
  const dashboardController = useDashboardController({ view });
  const {
    dashboardData,
    isLoading: isLoadingDashboard,
    hasError: hasDashboardError,
    refresh: refreshDashboard,
  } = dashboardController;
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

export default App;

import { useEffect, useMemo, useRef, useState } from "react";
import { appVersion } from "./appVersion.js";
import { AppShell } from "./components/shell/AppShell.jsx";
import { useMediaQuery } from "./components/shell/useMediaQuery.js";
import { Icon } from "./components/Icon.jsx";
import { ManagerAccessBoundary } from "./features/auth/ManagerAccessBoundary.jsx";
import {
  DetailItem,
  StateCard,
} from "./components/UiPrimitives.jsx";
import { FeedbackPanel } from "./features/feedback/FeedbackPanel.jsx";
import { NotificationInbox, NotificationInboxBadge, useNotificationInbox } from "./features/notifications/NotificationInbox.jsx";
import { inboxMessage } from "./features/notifications/notificationInboxMessages.js";
import { notificationInboxEnabled } from "./features/notifications/notificationInboxMode.js";
import { getJobById } from "./features/jobs/jobService.js";
import { NotificationControl } from "./features/notifications/NotificationControl.jsx";
import { abortManagerPushSignOut, prepareManagerPushSignOut } from "./features/notifications/notificationService.js";
import { clearOneSignalUser } from "./features/notifications/oneSignalService.js";
import { useOneSignalIdentity } from "./features/notifications/useOneSignalIdentity.js";
import { PwaUpdatePrompt } from "./features/pwa/PwaUpdatePrompt.jsx";
import { PayoutDirectory, PayoutReview } from "./features/payouts/PayoutViews.jsx";
import { usePayoutsController } from "./features/payouts/usePayoutsController.js";
import { WhatsNewPanel } from "./features/releases/WhatsNewPanel.jsx";
import {
  signInWithEmail,
  signOutManager,
} from "./features/auth/authService.js";
import { useInitialManagerSession } from "./features/auth/useInitialManagerSession.js";
import { recordManagerAccessDiagnostic } from "./features/auth/managerAccessDiagnostics.js";
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
import { CleaningChecklistPreview } from "./features/checklist-preview/CleaningChecklistPreview.jsx";
import { ChecklistRunDetail } from "./features/checklists/ChecklistRunDetail.jsx";
import { PublicChecklistPage } from "./features/checklists/PublicChecklistPage.jsx";
import { CleanerHubApp } from "./features/cleaner-hub/CleanerHubApp.jsx";
import { PublicClientReportPage } from "./features/checklists/PublicClientReportPage.jsx";
import { PublicClientPortalPage } from "./features/client-portal/PublicClientPortalPage.jsx";
import { PublicOfferAssignmentAcknowledgment } from "./features/public-offers/PublicOfferAssignmentAcknowledgment.jsx";
import { PublicOfferCompensation } from "./features/public-offers/PublicOfferCompensation.jsx";
import { Dashboard } from "./features/dashboard/Dashboard.jsx";
import { useDashboardController } from "./features/dashboard/useDashboardController.js";
import { DevCenter } from "./features/dev-center/DevCenter.jsx";
import { useDevCenterController } from "./features/dev-center/useDevCenterController.js";
import { JobDetail } from "./features/jobs/JobDetail.jsx";
import { FIRST_ACCEPT_WINS } from "./features/jobs/automaticOffers.js";
import { SandboxLifecyclePreview } from "./features/jobs/SandboxLifecyclePreview.jsx";
import { canShowEnvironmentNavigation } from "./environment.js";
import { CreateCleaningForm } from "./features/jobs/JobForm.jsx";
import { JobsPage } from "./features/jobs/JobsPage.jsx";
import {
  createJobListFilters,
  dashboardJobListFilters,
} from "./features/jobs/jobListFilters.js";
import { useJobDetailController } from "./features/jobs/useJobDetailController.js";
import { useJobsWorklist } from "./features/jobs/useJobsWorklist.js";
import {
  AssignedCleanerJob,
  IssueForm,
  IssueSuccess,
  OfferCleaners,
} from "./features/jobs/JobWorkflowViews.jsx";
import {
  acknowledgePublicOfferAssignment,
  getPublicOffer,
  respondToPublicOffer,
} from "./features/public-offers/publicOfferService.js";
import { languageOptions, usePublicTranslation, useTranslation } from "./i18n/translations.js";
import { ThemeProvider, useTheme } from "./theme/theme.js";
import { useManagerPageLoadTelemetry } from "./features/telemetry/useManagerPageLoadTelemetry.js";
import { ManagerPageLoadDiagnostics } from "./features/telemetry/ManagerPageLoadDiagnostics.jsx";
import { WeeklyClosePreview } from "./features/weekly-close/WeeklyClosePreview.jsx";
import { CleanerAgendaView } from "./features/cleaner-agenda/CleanerAgendaView.jsx";
import { DeveloperEnvironmentControls } from "./components/EnvironmentBanner.jsx";
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
  PropertyEditForm,
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

function isChecklistPreviewPath(pathname = window.location.pathname) {
  return pathname.replace(/\/+$/, "") === "/checklist-preview";
}

export function isCleanerHubPath(pathname = window.location.pathname) {
  const route = pathname.replace(/\/+$/, "");
  return route === "/agenda" || route === "/agenda.html";
}

function isWeeklyClosePreviewPath(pathname = window.location.pathname) {
  return pathname.replace(/\/+$/, "") === "/weekly-close-preview";
}

function isManagerLoadDiagnosticsPath(pathname = window.location.pathname) {
  return pathname.replace(/\/+$/, "") === "/diagnostics/load-times";
}

function publicChecklistTokenFromSearch(
  pathname = window.location.pathname,
  search = window.location.search,
) {
  if (pathname.replace(/\/+$/, "") !== "/checklist") return null;
  return new URLSearchParams(search).get("t") || "";
}

function publicClientReportTokenFromSearch(
  pathname = window.location.pathname,
  search = window.location.search,
) {
  if (pathname.replace(/\/+$/, "") !== "/client-report") return null;
  return new URLSearchParams(search).get("t") || "";
}

function publicClientPortalTokenFromSearch(
  pathname = window.location.pathname,
  search = window.location.search,
) {
  if (pathname.replace(/\/+$/, "") !== "/portal") return null;
  return new URLSearchParams(search).get("t") || "";
}

function App() {
  const publicOfferToken = publicOfferTokenFromPathname();
  const isPublicOfferRoute = publicOfferToken !== null;
  const publicChecklistToken = publicChecklistTokenFromSearch();
  const isPublicChecklistRoute = publicChecklistToken !== null;
  const publicClientReportToken = publicClientReportTokenFromSearch();
  const isPublicClientPortalRoute = publicClientPortalTokenFromSearch() !== null;
  const isPublicClientReportRoute = publicClientReportToken !== null || isPublicClientPortalRoute;
  const isChecklistPreviewRoute = isChecklistPreviewPath();
  // Cleaner Hub has its own Firebase app/session; the manager session is never read there.
  const isCleanerHubRoute = isCleanerHubPath();
  const { authUser, status: authStatus, retry: retryAuth } = useInitialManagerSession(
    !isPublicOfferRoute && !isPublicChecklistRoute && !isPublicClientReportRoute
    && !isChecklistPreviewRoute && !isCleanerHubRoute,
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasSignOutError, setHasSignOutError] = useState(false);

  if (isCleanerHubRoute) {
    return <CleanerHubApp />;
  }

  if (isPublicOfferRoute) {
    return <ThemeProvider><PublicOfferPage token={publicOfferToken} /></ThemeProvider>;
  }

  if (isPublicChecklistRoute) {
    return <ThemeProvider><PublicChecklistPage token={publicChecklistToken} /></ThemeProvider>;
  }

  if (isPublicClientReportRoute) {
    if (isPublicClientPortalRoute) return <ThemeProvider><PublicClientPortalPage token={publicClientPortalTokenFromSearch()} /></ThemeProvider>;
    return <ThemeProvider><PublicClientReportPage token={publicClientReportToken} /></ThemeProvider>;
  }

  if (isChecklistPreviewRoute) {
    return <CleaningChecklistPreview />;
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setHasSignOutError(false);
    let pushSignOutPreparation;

    try {
      pushSignOutPreparation = await prepareManagerPushSignOut().catch(() => undefined);
      await signOutManager();
      await clearOneSignalUser().catch(() => undefined);
    } catch {
      abortManagerPushSignOut(pushSignOutPreparation);
      setHasSignOutError(true);
    } finally {
      setIsSigningOut(false);
    }
  }

  if (authUser === undefined) {
    return <ThemeProvider><AuthenticationLoading status={authStatus} onRetry={retryAuth} /></ThemeProvider>;
  }

  if (!authUser) {
    return <ThemeProvider><ManagerLogin /></ThemeProvider>;
  }

  return (
    <ThemeProvider>
      <ManagerAccessBoundary
        key={authUser.uid}
        user={authUser}
        onSignOut={handleSignOut}
        isSigningOut={isSigningOut}
        hasSignOutError={hasSignOutError}
      >
        <ManagerApplication
          authUser={authUser}
          hasSignOutError={hasSignOutError}
          isSigningOut={isSigningOut}
          onSignOut={handleSignOut}
        />
      </ManagerAccessBoundary>
    </ThemeProvider>
  );
}

function PublicOfferPage({ token }) {
  const [offer, setOffer] = useState(null);
  const [offerLoadAttempt, setOfferLoadAttempt] = useState(0);
  const { language, setLanguage, translate } = usePublicTranslation(offer?.preferredLanguage);
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResponding, setIsResponding] = useState(false);
  const [responseError, setResponseError] = useState(null);
  const requiresHub = offer?.offerDistributionMode === FIRST_ACCEPT_WINS;

  function handleResponseError(error) {
    if (["offer_not_found", "offer_expired", "offer_unavailable", "offer_already_taken"].includes(error.code)) {
      setLoadError(error.code);
    } else if (error.code === "offer_hub_required") {
      setOffer((current) => ({ ...current, offerDistributionMode: FIRST_ACCEPT_WINS }));
    } else {
      setResponseError(error.code || "request_failed");
    }
  }

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
  }, [token, offerLoadAttempt]);

  async function submitResponse(status) {
    setIsResponding(true);
    setResponseError(null);

    try {
      const result = await respondToPublicOffer({ token, status });
      setOffer((currentOffer) => ({ ...currentOffer, status: result.status }));
    } catch (error) {
      handleResponseError(error);
    } finally {
      setIsResponding(false);
    }
  }

  async function acknowledgeAssignment() {
    setIsResponding(true);
    setResponseError(null);

    try {
      const result = await acknowledgePublicOfferAssignment({ token });
      setOffer((currentOffer) => ({
        ...currentOffer,
        assignmentAcknowledgment: result.assignmentAcknowledgment,
      }));
    } catch (error) {
      handleResponseError(error);
    } finally {
      setIsResponding(false);
    }
  }

  const errorMessage = {
    offer_not_found: "publicOffer.notFound",
    offer_expired: "publicOffer.expired",
    offer_unavailable: "publicOffer.unavailable",
    offer_already_taken: "publicOffer.alreadyTaken",
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
          <LanguageSelector language={language} onChange={setLanguage} translate={translate} />
        </header>

        {isLoading && <StateCard message={translate("publicOffer.loading")} status="status" />}

        {!isLoading && loadError && (
          <>
            <StateCard message={translate(errorMessage)} status="alert" isError />
            {loadError === "request_failed" && (
              <button className="button" type="button" onClick={() => setOfferLoadAttempt((attempt) => attempt + 1)}>
                {translate("common.retry")}
              </button>
            )}
          </>
        )}

        {!isLoading && !loadError && offer && (
          <section className="panel public-offer-panel" aria-labelledby="public-offer-title">
            <p className="eyebrow">{translate("publicOffer.eyebrow")}</p>
            <h2 id="public-offer-title" className="panel__title">
              {translate("publicOffer.title")}
            </h2>

            {!requiresHub && (
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
                <PublicOfferCompensation
                  amount={offer.offeredCompensation !== undefined
                    ? offer.offeredCompensation
                    : offer.cleanerPayout}
                />
                <DetailItem
                  label={translate("publicOffer.status")}
                  value={formatStatus(offer.status, translate)}
                />
                {offer.assignmentAcknowledgment && (
                  <DetailItem
                    label={translate("publicOffer.assignment")}
                    value={translate(offer.assignmentAcknowledgment === "CONFIRMED"
                      ? "publicOffer.assignmentAcknowledgedShort"
                      : "publicOffer.assignmentAwaitingShort")}
                  />
                )}
              </dl>
            )}

            {responseError && (
              <p className="form-error" role="alert">
                {translate("publicOffer.responseError")}
              </p>
            )}

            {requiresHub ? (
              <>
                <p className="public-offer-confirmation">{translate("publicOffer.hubRequired")}</p>
                <div className="public-offer-actions">
                  <a className="button button--primary" href="/agenda">{translate("publicOffer.openHub")}</a>
                </div>
              </>
            ) : (
              <PublicOfferAssignmentAcknowledgment
                state={offer.assignmentAcknowledgment}
                isSaving={isResponding}
                onConfirm={acknowledgeAssignment}
              />
            )}

            {!requiresHub && offer.status === "PENDING" && (
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

            {!requiresHub && hasAnswered && !offer.assignmentAcknowledgment && (
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
  const isWideWorkspace = useMediaQuery("(min-width: 1280px)");
  useOneSignalIdentity(authUser?.uid);
  const inbox = useNotificationInbox({ role: "MANAGER", sessionKey: authUser.uid });
  const [activeSection, setActiveSection] = useState(() => (
    isManagerLoadDiagnosticsPath() ? "dev-center" : isWeeklyClosePreviewPath() ? "payouts" : "dashboard"
  ));
  const [view, setView] = useState(() => (
    isManagerLoadDiagnosticsPath() ? "load-time-diagnostics" : isWeeklyClosePreviewPath() ? "weekly-close-preview" : "dashboard"
  ));
  const homeNoticeRequest = useRef(0);
  const currentView = useRef(view);
  if (currentView.current !== view) {
    currentView.current = view;
    homeNoticeRequest.current += 1;
  }
  useEffect(() => () => { homeNoticeRequest.current += 1; }, []);
  const [jobDetailOrigin, setJobDetailOrigin] = useState("jobs");
  const [jobDetailInitialFocus, setJobDetailInitialFocus] = useState(null);
  const [jobsScrollRestore, setJobsScrollRestore] = useState(null);
  const [propertyDetailOrigin, setPropertyDetailOrigin] = useState("properties");
  const [showExcludedRecords, setShowExcludedRecords] = useState(false);
  const devCenterController = useDevCenterController({ view });
  const canManageExcludedRecords = devCenterController.access.authorized;
  const includeArchived = canManageExcludedRecords && showExcludedRecords;
  const canPreviewLifecycle = import.meta.env.MODE === "sandbox"
    && canShowEnvironmentNavigation(authUser, "sandbox");
  const showServicesPane = isWideWorkspace && jobDetailOrigin === "jobs" && Boolean(jobsScrollRestore);

  useEffect(() => {
    if (view !== "load-time-diagnostics" && isManagerLoadDiagnosticsPath()) {
      window.history.replaceState(window.history.state, "", "/");
    }
    if (view !== "weekly-close-preview" && isWeeklyClosePreviewPath()) {
      window.history.replaceState(window.history.state, "", "/");
    }
  }, [view]);
  const jobWorklist = useJobsWorklist({
    view,
    detailPaneActive: showServicesPane,
    preserveLoadedJobs: Boolean(jobsScrollRestore),
    includeArchived,
  });
  const jobDetail = useJobDetailController({
    view,
    onJobUpdated: jobWorklist.replaceJob,
    actorUid: authUser?.uid,
  });
  const cleanersController = useCleanersController({ view, actorUid: authUser?.uid, includeArchived });
  const clientsController = useClientsController({ view, actorUid: authUser?.uid, includeArchived });
  const payoutsController = usePayoutsController({ view });
  const propertiesController = usePropertiesController({ actorUid: authUser?.uid, includeArchived });
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
    removeJob: removeJobFromWorklist,
  } = jobWorklist;
  const {
    job: selectedJob,
    detail: {
      offers: jobOffers,
      isLoadingOffers,
      hasOffersError,
      assignments: jobAssignments,
      isLoadingAssignments,
      hasAssignmentsError,
      issues: jobIssues,
      isLoadingIssues,
      hasIssuesError,
      refreshOffers: refreshJobOffers,
      refreshIssues: refreshJobIssues,
      checklistRun,
      isLoadingChecklistRun,
      isRefreshingChecklistRun,
      hasChecklistRunError,
      isCreatingChecklistRun,
      hasCreateChecklistRunError,
      refreshChecklistRun,
      checklistCapability,
      isLoadingChecklistCapability,
      hasChecklistCapabilityError,
      isIssuingChecklistCapability,
      hasIssueChecklistCapabilityError,
      isRevokingChecklistCapability,
      hasRevokeChecklistCapabilityError,
      refreshChecklistCapability,
    },
    offerFlow: {
      offersCreatedCount,
      availableCleaners: cleaners,
      isLoadingCleaners,
      hasCleanerError,
      clearOffersCreatedCount,
      recordOffersCreated,
      createCleanerOfferLink,
      revokeCleanerOffer,
      decideCleanerOffer,
      reopenCleanerOffer,
    },
    actions: {
      setCleanerSpots,
      markReminderSent,
      assignCleaner,
      assignCleanerDirectly,
      removeCleanerAssignment,
      replaceCleanerAssignment,
      startCleaning,
      completeCleaning,
      approveChecklistRun,
      submitChecklistRunForReview,
      abandonChecklistRunAndCompleteJob,
      saveJobPrices,
      saveJobDetails,
      saveJobSchedule,
      offerManualReplacement,
      resolveJobIssue,
      saveDataProvenance: saveJobDataProvenance,
      archive: archiveJobRecord,
      restore: restoreJobRecord,
      createChecklistRun: createJobChecklistRun,
      issueChecklistCapability: issueJobChecklistCapability,
      prepareChecklistReminder,
      revokeChecklistCapability: revokeJobChecklistCapability,
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
      saveDataProvenance: saveCleanerDataProvenance,
      archive: archiveCleanerRecord,
      restore: restoreCleanerRecord,
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
    saveClientEdit,
    saveDataProvenance: saveClientDataProvenance,
    archive: archiveClientRecord,
    restore: restoreClientRecord,
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
    savePropertyEdit,
    linkClient,
    saveDataProvenance: savePropertyDataProvenance,
    saveChecklistSettings: savePropertyChecklistSettings,
    saveCleanerAccess: savePropertyCleanerAccess,
    archive: archivePropertyRecord,
    restore: restorePropertyRecord,
  } = propertiesController;

  useManagerPageLoadTelemetry({
    user: authUser,
    view,
    pageStates: {
      dashboard: { isLoading: isLoadingDashboard, hasError: hasDashboardError },
      jobs: { isLoading: isLoadingJobs, hasError: hasJobError },
      properties: { isLoading: isLoadingProperties, hasError: hasPropertyError },
      clients: { isLoading: isLoadingClients, hasError: hasClientsError },
      cleaners: { isLoading: isLoadingDirectoryCleaners, hasError: hasDirectoryCleanersError },
      payouts: { isLoading: isLoadingPayouts, hasError: hasPayoutsError },
    },
  });

  function showProperties() {
    setActiveSection("properties");
    setPropertyDetailOrigin("properties");
    clearProperty();
    clearClient();
    closeJobDetail();
    clearOffersCreatedCount();
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

  function showEditProperty() {
    setView("property-edit");
  }

  function showDashboard() {
    setActiveSection("dashboard");
    clearProperty();
    closeJobDetail();
    setView("dashboard");
  }

  function showDevCenter() {
    if (!devCenterController.access.authorized) {
      return;
    }

    setActiveSection("dev-center");
    clearProperty();
    closeJobDetail();
    setView("dev-center");
  }

  function showJobList(filters = createJobListFilters()) {
    setJobsScrollRestore(null);
    setActiveSection("jobs");
    clearProperty();
    closeJobDetail();
    clearOffersCreatedCount();
    resetJobPagination();
    setJobListFilters(createJobListFilters(filters));
    setView("job-list");
  }

  function showJobs() {
    showJobList();
  }

  function showNewJob() {
    setActiveSection("jobs");
    clearProperty();
    setView("create-cleaning");
  }

  function showJobsWithFilter(filter) {
    showJobList(dashboardJobListFilters(filter));
  }

  function showJobsForClient(client) {
    showJobList(createJobListFilters({
      clientId: client.id,
      clientName: client.name || "",
    }));
  }

  function showJobsForProperty(property) {
    showJobList(createJobListFilters({ propertyId: property.id }));
  }

  function returnToJobs() {
    setActiveSection("jobs");
    clearProperty();
    closeJobDetail();
    clearOffersCreatedCount();
    setView("job-list");
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

  function showWeeklyClose() {
    showPayouts();
    window.history.pushState(window.history.state, "", "/weekly-close-preview");
    setView("weekly-close-preview");
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

  function showEditClient() {
    setView("client-edit");
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
    setJobDetailInitialFocus(null);
    setActiveSection("clients");
    setJobDetailOrigin("client");
    openJobDetail(job);
    setView("job-detail");
  }

  function openCleanerJob(job) {
    setJobDetailInitialFocus(null);
    setActiveSection("cleaners");
    setJobDetailOrigin("cleaner");
    openJobDetail(job);
    setView("job-detail");
  }

  function returnToCleanerDetail() {
    closeJobDetail();
    setView("cleaner-detail");
  }

  function showCleanerAgenda() {
    setActiveSection("cleaners");
    clearProperty();
    closeJobDetail();
    setView("cleaner-agenda");
  }

  function openCleanerAgendaJob(job) {
    setJobDetailInitialFocus(null);
    setActiveSection("cleaners");
    setJobDetailOrigin("cleaner-agenda");
    openJobDetail(job);
    setView("job-detail");
  }

  function returnToCleanerAgenda() {
    closeJobDetail();
    setView("cleaner-agenda");
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

  function openJob(job, jobsOrigin) {
    setJobDetailInitialFocus(null);
    if (view === "job-list") {
      setJobsScrollRestore(
        jobsOrigin || {
          anchorJobId: job.id,
          anchorViewportOffset: 0,
        },
      );
    }
    setActiveSection("jobs");
    setJobDetailOrigin("jobs");
    openJobDetail(job);
    setView("job-detail");
  }

  function openPropertyJob(job) {
    setJobDetailInitialFocus(null);
    setActiveSection("properties");
    setJobDetailOrigin("property");
    openJobDetail(job);
    setView("job-detail");
  }

  function returnToPropertyDetail() {
    closeJobDetail();
    setView("property-detail");
  }

  async function openInboxTarget(destination, presentation, canNavigate = () => true) {
    if (!canNavigate()) return false;
    if (destination?.kind === "DASHBOARD") {
      showDashboard();
      return true;
    }
    if (destination?.kind === "JOB" && typeof destination.jobId === "string") {
      try {
        const job = await getJobById(destination.jobId, { serverOnly: true });
        if (!canNavigate()) return false;
        openDashboardJob(job, presentation?.initialFocus);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async function openInboxItemFromHome(item) {
    const request = ++homeNoticeRequest.current;
    const canNavigate = () => homeNoticeRequest.current === request && currentView.current === "dashboard";
    try {
      const result = await inbox.open(item.id);
      if (!canNavigate()) return;
      if (result?.state === "opened") {
        const opened = await openInboxTarget(result.destination,
          item.type === "CLEANER_INTERESTED" ? { initialFocus: "interest" } : undefined, canNavigate);
        if (opened !== false) return;
      }
    } catch {
      // Fall through to the Inbox, which explains unavailable items.
    }
    if (canNavigate()) setView("notification-inbox");
  }

  function openDashboardJob(job, initialFocus = null) {
    setJobDetailInitialFocus(initialFocus === "interest" ? "interest" : null);
    setActiveSection("dashboard");
    setJobDetailOrigin("dashboard");
    openJobDetail(job);
    setView("job-detail");
  }

  function showOfferCleaners() {
    clearOffersCreatedCount();
    setView("offer-cleaners");
  }

  function openAssignedCleanerJob() {
    clearOffersCreatedCount();
    setView("cleaner-job");
  }

  function returnToJobDetail() {
    prepareJobDetailRefresh();
    setView("job-detail");
  }

  async function createAndOpenChecklistRun() {
    const checklistRun = await createJobChecklistRun();
    if (checklistRun) {
      clearOffersCreatedCount();
      setView("checklist-run");
    }
  }

  function openChecklistRun() {
    clearOffersCreatedCount();
    setView("checklist-run");
  }

  const shellWidth = view === "dashboard" ? "dashboard"
    : view === "job-detail" && jobDetailOrigin === "jobs" ? "workspace"
      : ["job-list", "property-list", "cleaner-list", "client-list", "payout-list", "notification-inbox", "dev-center",
        "load-time-diagnostics", "weekly-close-preview", "cleaner-agenda", "payout-review", "job-detail", "checklist-run"].includes(view) ? "wide"
        : "standard";
  const isInboxView = view === "notification-inbox";
  // Wide screens keep the Services list beside the open Job, so search, filters
  // and position survive switching between services.
  const navigationItems = [
    { key: "dashboard", icon: "home", label: translate("navigation.dashboard"), active: activeSection === "dashboard" && !isInboxView, onSelect: showDashboard },
    { key: "jobs", icon: "calendar", label: translate("navigation.jobs"), active: activeSection === "jobs" && !isInboxView, onSelect: showJobs },
    { key: "properties", icon: "building", label: translate("navigation.properties"), active: activeSection === "properties" && !isInboxView, onSelect: showProperties },
    { key: "cleaners", icon: "users", label: translate("navigation.cleaners"), active: activeSection === "cleaners" && !isInboxView, onSelect: showCleaners },
    { key: "clients", icon: "briefcase", label: translate("navigation.clients"), active: activeSection === "clients" && !isInboxView, onSelect: showClients },
    { key: "payouts", icon: "wallet", label: translate("navigation.payouts"), active: activeSection === "payouts" && !isInboxView, onSelect: showPayouts },
    ...(devCenterController.access.authorized ? [{
      key: "dev-center", icon: "code", subtle: true, label: translate("navigation.devCenter"),
      active: activeSection === "dev-center" && !isInboxView, onSelect: showDevCenter,
    }] : []),
  ];
  const identityName = authUser.displayName?.trim() || authUser.email || translate("auth.managerAccess");
  const identityDetail = authUser.displayName?.trim() && authUser.email ? authUser.email : translate("auth.managerAccess");

  return (
    <AppShell
      brandName={content.productName}
      navigationLabel={translate("common.mainNavigation")}
      items={navigationItems}
      mobileTabKeys={["dashboard", "jobs"]}
      moreLabel={translate("shell.more")}
      closeLabel={translate("shell.close")}
      width={shellWidth}
      primaryAction={{ label: translate("jobs.newService"), onSelect: showNewJob }}
      inbox={notificationInboxEnabled() ? {
        label: inboxMessage(language, "inbox.title"),
        shortLabel: translate("shell.inboxShort"),
        active: isInboxView,
        onSelect: () => setView("notification-inbox"),
        badge: <NotificationInboxBadge inbox={inbox} language={language} className="cf-count" />,
      } : null}
      account={{
        label: translate("shell.accountMenu", { name: identityName }),
        name: identityName,
        detail: identityDetail === identityName ? null : identityDetail,
        initials: initialsFor(identityName),
      }}
      accountPanel={(
        <>
          <div className="cf-account-panel__group">
            <label className="cf-field-row">
              <span><Icon name="globe" /> {translate("common.language")}</span>
              <LanguageSelector language={language} onChange={setLanguage} />
            </label>
            <div className="cf-field-row">
              <span><Icon name="moon" /> {translate("shell.appearance")}</span>
              <ThemeToggle />
            </div>
          </div>
          <div className="cf-account-panel__group">
            <p className="cf-account-panel__label">{translate("shell.notifications")}</p>
            <NotificationControl userId={authUser.uid} />
          </div>
          <div className="cf-account-panel__group cf-account-panel__tools">
            <FeedbackPanel screen={view} />
            <WhatsNewPanel />
            {canPreviewLifecycle && <button className="button button--small" type="button"
              onClick={() => setView("sandbox-lifecycle-preview")}>
              {translate("lifecycle.previewEntry")}
            </button>}
          </div>
          <div className="cf-account-panel__group cf-account-panel__meta">
            <DeveloperEnvironmentControls user={authUser} />
            <span className="badge">{appVersion}</span>
          </div>
          <button
            className="header-sign-out"
            type="button"
            disabled={isSigningOut}
            onClick={onSignOut}
          >
            <Icon name="logout" />
            {isSigningOut ? translate("auth.signingOut") : translate("auth.signOut")}
          </button>
        </>
      )}
    >
        {hasSignOutError && (
          <p className="header-auth-error" role="alert">
            {translate("auth.signOutError")}
          </p>
        )}
        <PwaUpdatePrompt />
        {import.meta.env.MODE === "sandbox" && canPreviewLifecycle && view === "sandbox-lifecycle-preview"
          && <SandboxLifecyclePreview onBack={showDashboard} />}
        {view === "weekly-close-preview" && <WeeklyClosePreview onBack={showPayouts} />}
        {notificationInboxEnabled() && view === "notification-inbox" && (
          <NotificationInbox inbox={inbox} language={language} onBack={showDashboard} onOpen={openInboxTarget} />
        )}

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
            notices={notificationInboxEnabled() && inbox.state === "ready" ? inbox.items : []}
            onOpenNotice={openInboxItemFromHome}
            onShowInbox={notificationInboxEnabled() ? () => setView("notification-inbox") : null}
          />
        )}

        {view === "dev-center" && devCenterController.access.authorized && (
          <DevCenter
            access={devCenterController.access}
            isWorking={devCenterController.isWorking}
            pendingPreviewType={devCenterController.pendingPreviewType}
            hasError={devCenterController.hasError}
            lastResult={devCenterController.lastResult}
            diagnostics={devCenterController.diagnostics}
            isLoadingDiagnostics={devCenterController.isLoadingDiagnostics}
            hasDiagnosticsError={devCenterController.hasDiagnosticsError}
            onGenerate={devCenterController.generate}
            onClear={devCenterController.clear}
            onPreviewReminder={devCenterController.previewReminder}
            onRefreshDiagnostics={devCenterController.loadNotificationDiagnostics}
            notificationUserId={authUser.uid}
          />
        )}

        {view === "load-time-diagnostics" && devCenterController.access.isChecking && (
          <StateCard message={translate("auth.managerAccessLoading")} status="status" />
        )}

        {view === "load-time-diagnostics" && !devCenterController.access.isChecking
          && !devCenterController.access.authorized && (
          <section className="panel">
            <StateCard message={translate("loadDiagnostics.unauthorized")} status="alert" isError />
            <button className="button" type="button" onClick={() => {
              setActiveSection("dashboard");
              setView("dashboard");
            }}>{translate("navigation.dashboard")}</button>
          </section>
        )}

        {view === "load-time-diagnostics" && devCenterController.access.authorized && (
          <ManagerPageLoadDiagnostics onBack={() => {
            setActiveSection("dev-center");
            setView("dev-center");
          }} />
        )}

        {view === "property-list" && (
          <PropertyDirectory
            properties={properties}
            isLoading={isLoadingProperties}
            hasError={hasPropertyError}
            onSelect={openProperty}
            onCreate={showNewProperty}
            canManageExcluded={canManageExcludedRecords}
            showExcluded={showExcludedRecords}
            onToggleExcluded={() => setShowExcludedRecords((current) => !current)}
          />
        )}

        {view === "property-create" && (
          <PropertyForm
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
            onEdit={showEditProperty}
            onOpenJob={openPropertyJob}
            onLinkClient={showPropertyClientLink}
            onSaveDataProvenance={(dataProvenance) =>
              savePropertyDataProvenance(selectedProperty, dataProvenance)
            }
            canRestore={canManageExcludedRecords}
            onArchive={async () => { await archivePropertyRecord(selectedProperty); showProperties(); }}
            onRestore={() => restorePropertyRecord(selectedProperty)}
            onViewAllUpcoming={() => showJobsForProperty(selectedProperty)}
            onSaveChecklistSettings={(settings) => savePropertyChecklistSettings(selectedProperty, settings)}
            onSaveCleanerAccess={(access) => savePropertyCleanerAccess(selectedProperty, access)}
          />
        )}

        {view === "property-edit" && selectedProperty && (
          <PropertyEditForm
            property={selectedProperty}
            onBack={() => setView("property-detail")}
            onSaved={(values) => savePropertyEdit(selectedProperty, values)}
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

        {view === "create-cleaning" && (
          <CreateCleaningForm
            property={selectedProperty}
            properties={properties}
            isLoadingProperties={isLoadingProperties}
            hasPropertyError={hasPropertyError}
            onBack={selectedProperty ? () => setView("property-detail") : returnToJobs}
            onCreated={openJob}
          />
        )}

        {view === "job-list" && (
          <JobsPage
            jobs={jobs}
            isLoading={isLoadingJobs}
            hasError={hasJobError}
            onSelect={openJob}
            onCreate={showNewJob}
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
            restoreScroll={jobsScrollRestore}
            onScrollRestored={() => setJobsScrollRestore(null)}
            canManageExcluded={canManageExcludedRecords}
            showExcluded={showExcludedRecords}
            onToggleExcluded={() => setShowExcludedRecords((current) => !current)}
          />
        )}

        {view === "cleaner-list" && (
          <CleanerDirectory
            cleaners={directoryCleaners}
            isLoading={isLoadingDirectoryCleaners}
            hasError={hasDirectoryCleanersError}
            onSelect={openCleaner}
            onCreate={showNewCleaner}
            canManageExcluded={canManageExcludedRecords}
            showExcluded={showExcludedRecords}
            onToggleExcluded={() => setShowExcludedRecords((current) => !current)}
            onAgenda={showCleanerAgenda}
          />
        )}

        {view === "cleaner-agenda" && <CleanerAgendaView onBack={showCleaners} onOpenJob={openCleanerAgendaJob} />}

        {view === "payout-list" && (
          <PayoutDirectory
            payoutGroups={payoutGroups}
            recentPayouts={recentPayouts}
            isLoading={isLoadingPayouts}
            hasError={hasPayoutsError}
            paidSummary={paidPayoutSummary}
            onRefresh={refreshPayouts}
            onWeeklyClose={showWeeklyClose}
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
            onSaveDataProvenance={(dataProvenance) =>
              saveCleanerDataProvenance(selectedCleaner, dataProvenance)
            }
            canRestore={canManageExcludedRecords}
            onArchive={async () => { await archiveCleanerRecord(selectedCleaner); showCleaners(); }}
            onRestore={() => restoreCleanerRecord(selectedCleaner)}
          />
        )}

        {view === "cleaner-create" && (
          <CleanerProfileForm
            key="new-cleaner"
            onBack={showCleaners}
            onSave={saveCleaner}
            onSaved={() => setView("cleaner-success")}
          />
        )}

        {view === "cleaner-edit" && selectedCleaner && (
          <CleanerProfileForm
            key={selectedCleaner.id}
            cleaner={selectedCleaner}
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
            canManageExcluded={canManageExcludedRecords}
            showExcluded={showExcludedRecords}
            onToggleExcluded={() => setShowExcludedRecords((current) => !current)}
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
            onEdit={showEditClient}
            onOpenJob={openClientJob}
            onSaveDataProvenance={(dataProvenance) =>
              saveClientDataProvenance(selectedClient, dataProvenance)
            }
            canRestore={canManageExcludedRecords}
            onArchive={async () => { await archiveClientRecord(selectedClient); showClients(); }}
            onRestore={() => restoreClientRecord(selectedClient)}
            onViewAllUpcoming={() => showJobsForClient(selectedClient)}
          />
        )}

        {view === "client-edit" && selectedClient && (
          <ClientForm
            client={selectedClient}
            onBack={() => setView("client-detail")}
            onSaved={(values) => saveClientEdit(selectedClient, values)}
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
          <div className={`cf-split${showServicesPane ? " cf-split--with-list" : ""}`}>
            {showServicesPane && (
              <aside className="cf-split__list" aria-label={translate("navigation.jobs")}>
              <JobsPage
                variant="pane"
                selectedJobId={selectedJob.id}
                jobs={jobs}
                isLoading={isLoadingJobs}
                hasError={hasJobError}
                onSelect={openJob}
                onCreate={showNewJob}
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
                canManageExcluded={canManageExcludedRecords}
                showExcluded={showExcludedRecords}
                onToggleExcluded={() => setShowExcludedRecords((current) => !current)}
              />
              </aside>
            )}
            <div className="cf-split__detail">
          <JobDetail
            job={selectedJob}
            initialFocus={jobDetailInitialFocus}
            property={properties.find((candidate) => candidate.id === selectedJob.propertyId) || null}
            knownCleaners={directoryCleaners}
            availableCleaners={cleaners}
            isLoadingCleaners={isLoadingCleaners}
            hasCleanerError={hasCleanerError}
            offersCreatedCount={offersCreatedCount}
            offers={jobOffers}
            isLoadingOffers={isLoadingOffers}
            hasOffersError={hasOffersError}
            assignments={jobAssignments}
            isLoadingAssignments={isLoadingAssignments}
            hasAssignmentsError={hasAssignmentsError}
            issues={jobIssues}
            isLoadingIssues={isLoadingIssues}
            hasIssuesError={hasIssuesError}
            checklistRun={checklistRun}
            isLoadingChecklistRun={isLoadingChecklistRun}
            hasChecklistRunError={hasChecklistRunError}
            isCreatingChecklistRun={isCreatingChecklistRun}
            hasCreateChecklistRunError={hasCreateChecklistRunError}
            checklistCapability={checklistCapability}
            isLoadingChecklistCapability={isLoadingChecklistCapability}
            hasChecklistCapabilityError={hasChecklistCapabilityError}
            isIssuingChecklistCapability={isIssuingChecklistCapability}
            hasIssueChecklistCapabilityError={hasIssueChecklistCapabilityError}
            isRevokingChecklistCapability={isRevokingChecklistCapability}
            hasRevokeChecklistCapabilityError={hasRevokeChecklistCapabilityError}
            onBack={
              jobDetailOrigin === "dashboard"
                ? showDashboard
                : jobDetailOrigin === "property"
                  ? returnToPropertyDetail
                  : jobDetailOrigin === "client"
                    ? returnToClientDetail
                    : jobDetailOrigin === "cleaner"
                      ? returnToCleanerDetail
                    : jobDetailOrigin === "cleaner-agenda"
                      ? returnToCleanerAgenda
                    : returnToJobs
            }
            onOfferToCleaners={showOfferCleaners}
            onRefreshOffers={refreshJobOffers}
            onRefreshIssues={refreshJobIssues}
            onRefreshChecklistRun={refreshChecklistRun}
            onCreateChecklistRun={createAndOpenChecklistRun}
            onOpenChecklistRun={openChecklistRun}
            onRefreshChecklistCapability={refreshChecklistCapability}
            onIssueChecklistCapability={issueJobChecklistCapability}
            onPrepareChecklistReminder={prepareChecklistReminder}
            onRevokeChecklistCapability={revokeJobChecklistCapability}
            onCreatePublicOfferLink={createCleanerOfferLink}
            onRevokeAutomaticOffer={revokeCleanerOffer}
            onAssignCleaner={assignCleaner}
            onDecideOffer={decideCleanerOffer}
            onReopenOffer={reopenCleanerOffer}
            onSetCleanerSpots={setCleanerSpots}
            onMarkReminderSent={markReminderSent}
            onAssignCleanerDirectly={assignCleanerDirectly}
            onRemoveAssignment={removeCleanerAssignment}
            onReplaceAssignment={replaceCleanerAssignment}
            onStartCleaning={startCleaning}
            onCompleteCleaning={completeCleaning}
            onUpdatePrices={saveJobPrices}
            onUpdateDetails={saveJobDetails}
            onUpdateSchedule={saveJobSchedule}
            onOfferManualReplacement={offerManualReplacement}
            onSimulateAssignedCleaner={openAssignedCleanerJob}
            onResolveIssue={resolveJobIssue}
            onSaveDataProvenance={saveJobDataProvenance}
            canRestore={canManageExcludedRecords}
            onArchive={async () => { await archiveJobRecord(); removeJobFromWorklist(selectedJob.id); returnToJobs(); }}
            onRestore={restoreJobRecord}
          />
                    </div>
          </div>
        )}

        {view === "checklist-run" && selectedJob && checklistRun && (
          <ChecklistRunDetail
            job={selectedJob}
            checklistRun={checklistRun}
            isRefreshing={isRefreshingChecklistRun}
            hasRefreshError={hasChecklistRunError}
            assignments={jobAssignments}
            onRefresh={() => refreshChecklistRun(selectedJob, { manual: true })}
            onApproveAndComplete={approveChecklistRun}
            onSubmitForReview={submitChecklistRunForReview}
            onAbandonAndComplete={abandonChecklistRunAndCompleteJob}
            onBack={() => setView("job-detail")}
          />
        )}

        {view === "offer-cleaners" && selectedJob && (
          <OfferCleaners
            key={selectedJob.id}
            job={selectedJob}
            cleaners={cleaners}
            isLoading={isLoadingCleaners}
            hasError={hasCleanerError}
            canOfferAutomatically={!isLoadingAssignments && !isLoadingOffers && !hasAssignmentsError && !hasOffersError
              && jobOffers.length === 0 && jobAssignments.length === 0}
            onBack={returnToJobDetail}
            onSent={(count, updatedJob) => {
              recordOffersCreated(count, updatedJob);
              returnToJobDetail();
            }}
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
    </AppShell>
  );
}

function initialsFor(name) {
  const words = String(name || "").replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] || "C") + (words[1]?.[0] || "")).toUpperCase();
}

function AuthenticationLoading({ status, onRetry }) {
  const { language, setLanguage, translate } = useTranslation();
  const pending = status === "loading";
  const copy = pending ? "auth.loading" : status === "offline" ? "auth.managerAccessOffline" : "auth.restoreError";

  return (
    <AuthenticationLayout language={language} onLanguageChange={setLanguage}>
      <StateCard message={translate(copy)} status={pending ? "status" : "alert"} isError={!pending} />
      {!pending && (
        <button className="button button--primary" type="button" onClick={onRetry}>
          {translate("auth.managerAccessRetry")}
        </button>
      )}
    </AuthenticationLayout>
  );
}

function ManagerLogin() {
  const { language, setLanguage, translate } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [signInSlow, setSignInSlow] = useState(false);

  useEffect(() => {
    if (!isSigningIn) return undefined;
    const startedAt = Date.now();
    let reported = false;
    const expire = (force) => {
      if (reported || (force !== true && Date.now() - startedAt < 20_000)) return;
      reported = true;
      setSignInSlow(true);
      recordManagerAccessDiagnostic("auth_signin_timeout", { durationMs: Date.now() - startedAt, reason: "timeout" });
    };
    const timer = setTimeout(() => expire(true), 20_000);
    window.addEventListener("pageshow", expire);
    document.addEventListener("visibilitychange", expire);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pageshow", expire);
      document.removeEventListener("visibilitychange", expire);
    };
  }, [isSigningIn]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSigningIn) return;

    if (!email.trim() || !password) {
      setErrorMessage(translate("auth.credentialsRequired"));
      return;
    }

    setIsSigningIn(true);
    setSignInSlow(false);
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

          {(errorMessage || signInSlow) && (
            <p className="form-error" role="alert">
              {errorMessage || translate("auth.signInSlow")}
            </p>
          )}

          <div className="button-row">
            <button className="button button--primary" type="submit" disabled={isSigningIn}>
              {isSigningIn && !signInSlow ? translate("auth.signingIn") : translate("auth.signIn")}
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
    <main className="cf-auth">
      <section className="cf-auth__card" aria-labelledby="page-title">
        <header className="cf-auth__header">
          <div className="cf-brand cf-brand--on-surface">
            <span className="cf-brand__mark" aria-hidden="true"><Icon name="broom" size={18} /></span>
            <h1 id="page-title" className="cf-brand__name">{content.productName}</h1>
          </div>
          <LanguageSelector language={language} onChange={onLanguageChange} />
        </header>
        <p className="cf-auth__tagline">{translate("brand.operationsPlatform")}</p>
        {children}
        <p className="cf-auth__version"><span className="badge">{appVersion}</span></p>
      </section>
    </main>
  );
}

function LanguageSelector({ language, onChange, translate: localizedTranslate }) {
  const { translate: managerTranslate } = useTranslation();
  const translate = localizedTranslate || managerTranslate;

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
      <span className="theme-toggle__track" aria-hidden="true"><span className="theme-toggle__thumb"><Icon name={isDark ? "moon" : "sun"} size={13} /></span></span>
      <span className="theme-toggle__text" aria-hidden="true">{translate(isDark ? "shell.themeDark" : "shell.themeLight")}</span>
    </button>
  );
}

export default App;

import { useEffect, useState } from "react";
import { appVersion } from "../../appVersion.js";
import { content } from "../../app/content.js";
import { LanguageSelector } from "../../components/LanguageSelector.jsx";
import { AppShell } from "../../components/shell/AppShell.jsx";
import { useMediaQuery } from "../../components/shell/useMediaQuery.js";
import { Icon } from "../../components/Icon.jsx";
import {
  ThemeToggle,
} from "../auth/ManagerSignIn.jsx";
import {
  StateCard,
} from "../../components/UiPrimitives.jsx";
import { FeedbackPanel } from "../feedback/FeedbackPanel.jsx";
import { NotificationInbox, NotificationInboxBadge, useNotificationInbox } from "../notifications/NotificationInbox.jsx";
import { inboxMessage } from "../notifications/notificationInboxMessages.js";
import { notificationInboxEnabled } from "../notifications/notificationInboxMode.js";
import { getJobById } from "../jobs/jobService.js";
import { NotificationControl } from "../notifications/NotificationControl.jsx";
import { useOneSignalIdentity } from "../notifications/useOneSignalIdentity.js";
import { PwaUpdatePrompt } from "../pwa/PwaUpdatePrompt.jsx";
import { PayoutDirectory, PayoutReview } from "../payouts/PayoutViews.jsx";
import { usePayoutsController } from "../payouts/usePayoutsController.js";
import { WhatsNewPanel } from "../releases/WhatsNewPanel.jsx";
import { startManagerFunctionWarmup } from "../../services/firebase/managerFunctionWarmup.js";
import { CleanerDetail } from "../cleaners/CleanerDetail.jsx";
import { CleanerDirectory } from "../cleaners/CleanerDirectory.jsx";
import {
  CleanerProfileForm,
  CleanerProfileSuccess,
} from "../cleaners/CleanerProfileForm.jsx";
import { useCleanersController } from "../cleaners/useCleanersController.js";
import { ClientDetail } from "../clients/ClientDetail.jsx";
import { ClientDirectory } from "../clients/ClientDirectory.jsx";
import { ClientForm } from "../clients/ClientForm.jsx";
import { useClientsController } from "../clients/useClientsController.js";
import { ChecklistRunDetail } from "../checklists/ChecklistRunDetail.jsx";
import { Dashboard } from "../dashboard/Dashboard.jsx";
import { useDashboardController } from "../dashboard/useDashboardController.js";
import { DevCenter } from "../dev-center/DevCenter.jsx";
import { useDevCenterController } from "../dev-center/useDevCenterController.js";
import { JobDetail } from "../jobs/JobDetail.jsx";
import { SandboxLifecyclePreview } from "../jobs/SandboxLifecyclePreview.jsx";
import { canShowEnvironmentNavigation } from "../../environment.js";
import { CreateCleaningForm } from "../jobs/JobForm.jsx";
import { JobsPage } from "../jobs/JobsPage.jsx";
import {
  createJobListFilters,
  dashboardJobListFilters,
} from "../jobs/jobListFilters.js";
import { useJobDetailController } from "../jobs/useJobDetailController.js";
import { useJobsWorklist } from "../jobs/useJobsWorklist.js";
import {
  AssignedCleanerJob,
  IssueForm,
  IssueSuccess,
  OfferCleaners,
} from "../jobs/JobWorkflowViews.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { useManagerPageLoadTelemetry } from "../telemetry/useManagerPageLoadTelemetry.js";
import { ManagerPageLoadDiagnostics } from "../telemetry/ManagerPageLoadDiagnostics.jsx";
import { WeeklyClosePreview } from "../weekly-close/WeeklyClosePreview.jsx";
import { CleanerAgendaView } from "../cleaner-agenda/CleanerAgendaView.jsx";
import { CleanerAlertsView } from "../cleaner-alerts/CleanerAlertsView.jsx";
import { DeveloperEnvironmentControls } from "../../components/EnvironmentBanner.jsx";
import {
  formatCreatedAt,
  formatDate,
  formatPrice,
} from "../../lib/presentation.js";
import { usePropertiesController } from "../properties/usePropertiesController.js";
import { useManagerNavigation } from "./useManagerNavigation.js";
import { PropertyViews } from "./views/PropertyViews.jsx";

export function ManagerApplication({ authUser, hasSignOutError, isSigningOut, onSignOut }) {
  const { language, setLanguage, translate } = useTranslation();
  const isWideWorkspace = useMediaQuery("(min-width: 1280px)");
  useOneSignalIdentity(authUser?.uid);
  useEffect(() => startManagerFunctionWarmup(), []);
  const inbox = useNotificationInbox({ role: "MANAGER", sessionKey: authUser.uid });
  const {
    activeSection,
    setActiveSection,
    view,
    setView,
    homeNoticeRequest,
    currentView,
    jobDetailOrigin,
    setJobDetailOrigin,
    jobDetailInitialFocus,
    setJobDetailInitialFocus,
    jobsScrollRestore,
    setJobsScrollRestore,
    propertyDetailOrigin,
    setPropertyDetailOrigin,
    showPropertyClientLink,
    showEditProperty,
    showEditClient,
  } = useManagerNavigation();
  const [showExcludedRecords, setShowExcludedRecords] = useState(false);
  const devCenterController = useDevCenterController({ view });
  const canManageExcludedRecords = devCenterController.access.authorized;
  const includeArchived = canManageExcludedRecords && showExcludedRecords;
  const canPreviewLifecycle = import.meta.env.MODE === "sandbox"
    && canShowEnvironmentNavigation(authUser, "sandbox");
  const showServicesPane = isWideWorkspace && jobDetailOrigin === "jobs" && Boolean(jobsScrollRestore);

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

  function showCleanerAlerts() {
    setActiveSection("cleaners");
    clearProperty();
    closeJobDetail();
    setView("cleaner-alerts");
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

        <PropertyViews
          view={view}
          properties={properties}
          isLoadingProperties={isLoadingProperties}
          hasPropertyError={hasPropertyError}
          openProperty={openProperty}
          showNewProperty={showNewProperty}
          canManageExcludedRecords={canManageExcludedRecords}
          showExcludedRecords={showExcludedRecords}
          setShowExcludedRecords={setShowExcludedRecords}
          propertyDetailOrigin={propertyDetailOrigin}
          selectedClient={selectedClient}
          returnToClientDetail={returnToClientDetail}
          showProperties={showProperties}
          saveProperty={saveProperty}
          clearProperty={clearProperty}
          setView={setView}
          selectProperty={selectProperty}
          selectedProperty={selectedProperty}
          showEditProperty={showEditProperty}
          openPropertyJob={openPropertyJob}
          showPropertyClientLink={showPropertyClientLink}
          savePropertyDataProvenance={savePropertyDataProvenance}
          archivePropertyRecord={archivePropertyRecord}
          restorePropertyRecord={restorePropertyRecord}
          showJobsForProperty={showJobsForProperty}
          savePropertyChecklistSettings={savePropertyChecklistSettings}
          savePropertyCleanerAccess={savePropertyCleanerAccess}
          savePropertyEdit={savePropertyEdit}
          linkClient={linkClient}
        />

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
            onAlerts={showCleanerAlerts}
          />
        )}

        {view === "cleaner-agenda" && <CleanerAgendaView onBack={showCleaners} onOpenJob={openCleanerAgendaJob} />}
        {view === "cleaner-alerts" && <CleanerAlertsView onBack={showCleaners} onOpenCleaner={openCleaner} />}

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

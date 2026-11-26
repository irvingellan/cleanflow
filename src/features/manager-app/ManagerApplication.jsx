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
import { FeedbackPanel } from "../feedback/FeedbackPanel.jsx";
import { NotificationInboxBadge, useNotificationInbox } from "../notifications/NotificationInbox.jsx";
import { inboxMessage } from "../notifications/notificationInboxMessages.js";
import { notificationInboxEnabled } from "../notifications/notificationInboxMode.js";
import { getJobById } from "../jobs/jobService.js";
import { NotificationControl } from "../notifications/NotificationControl.jsx";
import { useOneSignalIdentity } from "../notifications/useOneSignalIdentity.js";
import { PwaUpdatePrompt } from "../pwa/PwaUpdatePrompt.jsx";
import { usePayoutsController } from "../payouts/usePayoutsController.js";
import { WhatsNewPanel } from "../releases/WhatsNewPanel.jsx";
import { startManagerFunctionWarmup } from "../../services/firebase/managerFunctionWarmup.js";
import { useCleanersController } from "../cleaners/useCleanersController.js";
import { useClientsController } from "../clients/useClientsController.js";
import { useDashboardController } from "../dashboard/useDashboardController.js";
import { useDevCenterController } from "../dev-center/useDevCenterController.js";
import { canShowEnvironmentNavigation } from "../../environment.js";
import {
  createJobListFilters,
  dashboardJobListFilters,
} from "../jobs/jobListFilters.js";
import { useJobDetailController } from "../jobs/useJobDetailController.js";
import { useJobsWorklist } from "../jobs/useJobsWorklist.js";
import { useTranslation } from "../../i18n/translations.js";
import { useManagerPageLoadTelemetry } from "../telemetry/useManagerPageLoadTelemetry.js";
import { DeveloperEnvironmentControls } from "../../components/EnvironmentBanner.jsx";
import { usePropertiesController } from "../properties/usePropertiesController.js";
import { useManagerNavigation } from "./useManagerNavigation.js";
import { PropertyViews } from "./views/PropertyViews.jsx";
import { CleanerViews } from "./views/CleanerViews.jsx";
import { PayoutViews } from "./views/PayoutViews.jsx";
import { ClientViews } from "./views/ClientViews.jsx";
import { HomeViews } from "./views/HomeViews.jsx";
import { DeveloperViews } from "./views/DeveloperViews.jsx";
import { JobViews } from "./views/JobViews.jsx";

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
  const [weeklyCloseSelection, setWeeklyCloseSelection] = useState(null);
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
      refreshWorkedTime,
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
      saveJobPriceCorrection,
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
      pendingHoursJobs, missingAgreementJobs,
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
    setWeeklyCloseSelection(null);
    showPayouts();
    window.history.pushState(window.history.state, "", "/weekly-close-preview");
    setView("weekly-close-preview");
  }

  function openWeeklyCloseJob(job, selection) {
    setWeeklyCloseSelection(selection);
    setJobDetailInitialFocus(null);
    setActiveSection("payouts");
    setJobDetailOrigin("weekly-close");
    openJobDetail(job);
    setView("job-detail");
  }

  function returnToWeeklyClose() {
    closeJobDetail();
    window.history.replaceState(window.history.state, "", "/weekly-close-preview");
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
        <DeveloperViews
          view={view}
          canPreviewLifecycle={canPreviewLifecycle}
          showDashboard={showDashboard}
          devCenterController={devCenterController}
          authUser={authUser}
          translate={translate}
          setActiveSection={setActiveSection}
          setView={setView}
        />
        <PayoutViews
          view={view}
          showPayouts={showPayouts}
          payoutGroups={payoutGroups}
          pendingHoursJobs={pendingHoursJobs}
          missingAgreementJobs={missingAgreementJobs}
          recentPayouts={recentPayouts}
          isLoadingPayouts={isLoadingPayouts}
          hasPayoutsError={hasPayoutsError}
          paidPayoutSummary={paidPayoutSummary}
          refreshPayouts={refreshPayouts}
          showWeeklyClose={showWeeklyClose}
          weeklyCloseSelection={weeklyCloseSelection}
          openWeeklyCloseJob={openWeeklyCloseJob}
          openPayoutReview={openPayoutReview}
          attachProof={attachProof}
          getProofUrl={getProofUrl}
          translate={translate}
          language={language}
          selectedPayoutGroup={selectedPayoutGroup}
          recordPayout={recordPayout}
          showRecordedPayout={showRecordedPayout}
        />
        <HomeViews
          view={view}
          inbox={inbox}
          language={language}
          showDashboard={showDashboard}
          openInboxTarget={openInboxTarget}
          dashboardData={dashboardData}
          isLoadingDashboard={isLoadingDashboard}
          hasDashboardError={hasDashboardError}
          translate={translate}
          refreshDashboard={refreshDashboard}
          openDashboardJob={openDashboardJob}
          showJobs={showJobs}
          showJobsWithFilter={showJobsWithFilter}
          openInboxItemFromHome={openInboxItemFromHome}
          setView={setView}
        />

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

        <JobViews
          view={view}
          selectedProperty={selectedProperty}
          properties={properties}
          isLoadingProperties={isLoadingProperties}
          hasPropertyError={hasPropertyError}
          setView={setView}
          returnToJobs={returnToJobs}
          openJob={openJob}
          jobs={jobs}
          isLoadingJobs={isLoadingJobs}
          hasJobError={hasJobError}
          showNewJob={showNewJob}
          jobListFilters={jobListFilters}
          cleaners={cleaners}
          jobFilterCleaners={jobFilterCleaners}
          setJobListFilters={setJobListFilters}
          hasMoreJobs={hasMoreJobs}
          isLoadingMoreJobs={isLoadingMoreJobs}
          loadMoreJobs={loadMoreJobs}
          jobsScrollRestore={jobsScrollRestore}
          setJobsScrollRestore={setJobsScrollRestore}
          canManageExcludedRecords={canManageExcludedRecords}
          showExcludedRecords={showExcludedRecords}
          setShowExcludedRecords={setShowExcludedRecords}
          selectedJob={selectedJob}
          showServicesPane={showServicesPane}
          translate={translate}
          jobDetailInitialFocus={jobDetailInitialFocus}
          directoryCleaners={directoryCleaners}
          isLoadingCleaners={isLoadingCleaners}
          hasCleanerError={hasCleanerError}
          offersCreatedCount={offersCreatedCount}
          jobOffers={jobOffers}
          isLoadingOffers={isLoadingOffers}
          hasOffersError={hasOffersError}
          jobAssignments={jobAssignments}
          isLoadingAssignments={isLoadingAssignments}
          hasAssignmentsError={hasAssignmentsError}
          jobIssues={jobIssues}
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
          jobDetailOrigin={jobDetailOrigin}
          showDashboard={showDashboard}
          returnToPropertyDetail={returnToPropertyDetail}
          returnToClientDetail={returnToClientDetail}
          returnToCleanerDetail={returnToCleanerDetail}
          returnToCleanerAgenda={returnToCleanerAgenda}
          returnToWeeklyClose={returnToWeeklyClose}
          showOfferCleaners={showOfferCleaners}
          refreshJobOffers={refreshJobOffers}
          refreshJobIssues={refreshJobIssues}
          refreshChecklistRun={refreshChecklistRun}
          refreshWorkedTime={refreshWorkedTime}
          createAndOpenChecklistRun={createAndOpenChecklistRun}
          openChecklistRun={openChecklistRun}
          refreshChecklistCapability={refreshChecklistCapability}
          issueJobChecklistCapability={issueJobChecklistCapability}
          prepareChecklistReminder={prepareChecklistReminder}
          revokeJobChecklistCapability={revokeJobChecklistCapability}
          createCleanerOfferLink={createCleanerOfferLink}
          revokeCleanerOffer={revokeCleanerOffer}
          assignCleaner={assignCleaner}
          decideCleanerOffer={decideCleanerOffer}
          reopenCleanerOffer={reopenCleanerOffer}
          setCleanerSpots={setCleanerSpots}
          markReminderSent={markReminderSent}
          assignCleanerDirectly={assignCleanerDirectly}
          removeCleanerAssignment={removeCleanerAssignment}
          replaceCleanerAssignment={replaceCleanerAssignment}
          startCleaning={startCleaning}
          completeCleaning={completeCleaning}
          saveJobPrices={saveJobPrices}
          saveJobPriceCorrection={saveJobPriceCorrection}
          saveJobDetails={saveJobDetails}
          saveJobSchedule={saveJobSchedule}
          offerManualReplacement={offerManualReplacement}
          openAssignedCleanerJob={openAssignedCleanerJob}
          resolveJobIssue={resolveJobIssue}
          saveJobDataProvenance={saveJobDataProvenance}
          archiveJobRecord={archiveJobRecord}
          removeJobFromWorklist={removeJobFromWorklist}
          restoreJobRecord={restoreJobRecord}
          isRefreshingChecklistRun={isRefreshingChecklistRun}
          approveChecklistRun={approveChecklistRun}
          submitChecklistRunForReview={submitChecklistRunForReview}
          abandonChecklistRunAndCompleteJob={abandonChecklistRunAndCompleteJob}
          returnToJobDetail={returnToJobDetail}
          recordOffersCreated={recordOffersCreated}
        />

        <CleanerViews
          view={view}
          directoryCleaners={directoryCleaners}
          isLoadingDirectoryCleaners={isLoadingDirectoryCleaners}
          hasDirectoryCleanersError={hasDirectoryCleanersError}
          openCleaner={openCleaner}
          showNewCleaner={showNewCleaner}
          canManageExcludedRecords={canManageExcludedRecords}
          showExcludedRecords={showExcludedRecords}
          setShowExcludedRecords={setShowExcludedRecords}
          showCleanerAgenda={showCleanerAgenda}
          showCleanerAlerts={showCleanerAlerts}
          showCleaners={showCleaners}
          openCleanerAgendaJob={openCleanerAgendaJob}
          selectedCleaner={selectedCleaner}
          showEditCleaner={showEditCleaner}
          openCleanerJob={openCleanerJob}
          saveCleanerDataProvenance={saveCleanerDataProvenance}
          archiveCleanerRecord={archiveCleanerRecord}
          restoreCleanerRecord={restoreCleanerRecord}
          saveCleaner={saveCleaner}
          setView={setView}
          showCleanerDetail={showCleanerDetail}
          savedCleaner={savedCleaner}
        />

        <ClientViews
          view={view}
          clients={clients}
          isLoadingClients={isLoadingClients}
          hasClientsError={hasClientsError}
          showNewClient={showNewClient}
          openClient={openClient}
          canManageExcludedRecords={canManageExcludedRecords}
          showExcludedRecords={showExcludedRecords}
          setShowExcludedRecords={setShowExcludedRecords}
          selectedClient={selectedClient}
          clientProperties={clientProperties}
          isLoadingClientProperties={isLoadingClientProperties}
          hasClientPropertiesError={hasClientPropertiesError}
          clientJobHistory={clientJobHistory}
          hasClientJobHistoryError={hasClientJobHistoryError}
          showClients={showClients}
          openClientProperty={openClientProperty}
          showNewPropertyForClient={showNewPropertyForClient}
          showEditClient={showEditClient}
          openClientJob={openClientJob}
          saveClientDataProvenance={saveClientDataProvenance}
          archiveClientRecord={archiveClientRecord}
          restoreClientRecord={restoreClientRecord}
          showJobsForClient={showJobsForClient}
          setView={setView}
          saveClientEdit={saveClientEdit}
          saveClient={saveClient}
        />

    </AppShell>
  );
}

function initialsFor(name) {
  const words = String(name || "").replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] || "C") + (words[1]?.[0] || "")).toUpperCase();
}

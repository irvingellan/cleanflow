import { NotificationInbox } from "../../notifications/NotificationInbox.jsx";
import { notificationInboxEnabled } from "../../notifications/notificationInboxMode.js";
import { Dashboard } from "../../dashboard/Dashboard.jsx";

/** The home screens of the manager application: the Inbox and the Dashboard. */
export function HomeViews({
  view,
  inbox,
  language,
  showDashboard,
  openInboxTarget,
  dashboardData,
  isLoadingDashboard,
  hasDashboardError,
  translate,
  refreshDashboard,
  openDashboardJob,
  showJobs,
  showJobsWithFilter,
  openInboxItemFromHome,
  setView,
}) {
  return (
    <>
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
    </>
  );
}

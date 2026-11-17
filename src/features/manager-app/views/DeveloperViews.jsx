import { StateCard } from "../../../components/UiPrimitives.jsx";
import { DevCenter } from "../../dev-center/DevCenter.jsx";
import { SandboxLifecyclePreview } from "../../jobs/SandboxLifecyclePreview.jsx";
import { ManagerPageLoadDiagnostics } from "../../telemetry/ManagerPageLoadDiagnostics.jsx";

/** The developer screens of the manager application: lifecycle preview, Developer center and load-time diagnostics. */
export function DeveloperViews({
  view,
  canPreviewLifecycle,
  showDashboard,
  devCenterController,
  authUser,
  translate,
  setActiveSection,
  setView,
}) {
  return (
    <>
      {import.meta.env.MODE === "sandbox" && canPreviewLifecycle && view === "sandbox-lifecycle-preview"
        && <SandboxLifecyclePreview onBack={showDashboard} />}

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
    </>
  );
}

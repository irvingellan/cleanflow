import { CleanerDetail } from "../../cleaners/CleanerDetail.jsx";
import { CleanerDirectory } from "../../cleaners/CleanerDirectory.jsx";
import { CleanerProfileForm, CleanerProfileSuccess } from "../../cleaners/CleanerProfileForm.jsx";
import { CleanerAgendaView } from "../../cleaner-agenda/CleanerAgendaView.jsx";
import { CleanerAlertsView } from "../../cleaner-alerts/CleanerAlertsView.jsx";

/** The cleaner screens of the manager application: list, agenda, alerts, detail, create, edit and saved. */
export function CleanerViews({
  view,
  directoryCleaners,
  isLoadingDirectoryCleaners,
  hasDirectoryCleanersError,
  openCleaner,
  showNewCleaner,
  canManageExcludedRecords,
  showExcludedRecords,
  setShowExcludedRecords,
  showCleanerAgenda,
  showCleanerAlerts,
  showCleaners,
  openCleanerAgendaJob,
  selectedCleaner,
  showEditCleaner,
  openCleanerJob,
  saveCleanerDataProvenance,
  archiveCleanerRecord,
  restoreCleanerRecord,
  saveCleaner,
  setView,
  showCleanerDetail,
  savedCleaner,
}) {
  return (
    <>
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
    </>
  );
}

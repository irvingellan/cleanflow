import { ClientDetail } from "../../clients/ClientDetail.jsx";
import { ClientDirectory } from "../../clients/ClientDirectory.jsx";
import { ClientForm } from "../../clients/ClientForm.jsx";

/** The client screens of the manager application: list, detail, edit and create. */
export function ClientViews({
  view,
  clients,
  isLoadingClients,
  hasClientsError,
  showNewClient,
  openClient,
  canManageExcludedRecords,
  showExcludedRecords,
  setShowExcludedRecords,
  selectedClient,
  clientProperties,
  isLoadingClientProperties,
  hasClientPropertiesError,
  clientJobHistory,
  hasClientJobHistoryError,
  showClients,
  openClientProperty,
  showNewPropertyForClient,
  showEditClient,
  openClientJob,
  saveClientDataProvenance,
  archiveClientRecord,
  restoreClientRecord,
  showJobsForClient,
  setView,
  saveClientEdit,
  saveClient,
}) {
  return (
    <>
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
    </>
  );
}

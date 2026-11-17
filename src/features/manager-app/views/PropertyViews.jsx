import { PropertyDetail } from "../../properties/PropertyDetail.jsx";
import { PropertyDirectory } from "../../properties/PropertyDirectory.jsx";
import { PropertyClientLinkForm, PropertyEditForm, PropertyForm } from "../../properties/PropertyForm.jsx";

/** The property screens of the manager application: list, create, detail, edit and client link. */
export function PropertyViews({
  view,
  properties,
  isLoadingProperties,
  hasPropertyError,
  openProperty,
  showNewProperty,
  canManageExcludedRecords,
  showExcludedRecords,
  setShowExcludedRecords,
  propertyDetailOrigin,
  selectedClient,
  returnToClientDetail,
  showProperties,
  saveProperty,
  clearProperty,
  setView,
  selectProperty,
  selectedProperty,
  showEditProperty,
  openPropertyJob,
  showPropertyClientLink,
  savePropertyDataProvenance,
  archivePropertyRecord,
  restorePropertyRecord,
  showJobsForProperty,
  savePropertyChecklistSettings,
  savePropertyCleanerAccess,
  savePropertyEdit,
  linkClient,
}) {
  return (
    <>
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
    </>
  );
}

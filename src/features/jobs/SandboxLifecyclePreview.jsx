import { useState } from "react";
import { JobDetail } from "./JobDetail.jsx";
import { buildServiceLifecycleFixtures } from "../../../scripts/serviceLifecycleFixtures.mjs";
import { useTranslation } from "../../i18n/translations.js";

// A labelled visual fixture, never a data-service fallback. Mounted only inside
// the authenticated manager boundary in the dedicated Sandbox build.
export function SandboxLifecyclePreview({ onBack }) {
  const { translate } = useTranslation();
  const [scenarioId, setScenarioId] = useState("unassigned");
  const [notice, setNotice] = useState(false);
  const scenarios = buildServiceLifecycleFixtures();
  const fixture = scenarios.find((scenario) => scenario.id === scenarioId);
  const inspectOnly = () => setNotice(true);
  const rejectWrite = async () => {
    setNotice(true);
    throw new Error("Synthetic preview is read-only.");
  };
  return <>
    <aside className="service-preview-notice">
      <h2>{translate("lifecycle.previewTitle")}</h2>
      <p>{translate("lifecycle.previewDescription")}</p>
      <label>{translate("lifecycle.scenario")}
        <select value={scenarioId} onChange={(event) => { setScenarioId(event.target.value); setNotice(false); }}>
          {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
        </select>
      </label>
      {notice && <p role="status">{translate("lifecycle.previewAction")}</p>}
    </aside>
    <JobDetail key={fixture.job.id} {...fixture} property={null}
      availableCleaners={fixture.knownCleaners} checklistCapability={fixture.checklistCapability}
      onBack={onBack} onOpenChecklistRun={inspectOnly} onOfferToCleaners={inspectOnly}
      onRefreshOffers={inspectOnly} onRefreshIssues={inspectOnly} onRefreshChecklistRun={inspectOnly}
      onRefreshChecklistCapability={inspectOnly} onSimulateAssignedCleaner={inspectOnly}
      onCreateChecklistRun={rejectWrite} onIssueChecklistCapability={rejectWrite}
      onPrepareChecklistReminder={rejectWrite} onRevokeChecklistCapability={rejectWrite}
      onCreatePublicOfferLink={rejectWrite} onAssignCleaner={rejectWrite}
      onAssignCleanerDirectly={rejectWrite} onRemoveAssignment={rejectWrite}
      onReplaceAssignment={rejectWrite} onStartCleaning={rejectWrite} onCompleteCleaning={rejectWrite}
      onUpdatePrices={rejectWrite} onUpdateDetails={rejectWrite} onUpdateSchedule={rejectWrite}
      onSaveDataProvenance={rejectWrite} onResolveIssue={rejectWrite}
      onArchive={rejectWrite} onRestore={rejectWrite} />
  </>;
}

// Test-only harness rendering the actual Job Detail, never the Workspace preview.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { JobDetail } from "../../src/features/jobs/JobDetail.jsx";
import { TranslationProvider } from "../../src/i18n/translations.js";
import "../../src/index.css";
const noop = () => {};
function Fixture() {
  const [scenario, setScenario] = useState("unassigned");
  const [opened, setOpened] = useState(false);
  const job = { id: `synthetic-${scenario}`, schemaVersion: 2, propertyName: "Garden Apartment — Demo", clientName: "Demo Client", scheduledDate: "2026-10-05", scheduledStart: "11:00", dataProvenance: "DEMO", assignedCleanerIds: scenario === "unassigned" ? [] : ["synthetic-cleaner"], operationalStatus: scenario === "unassigned" ? "UNASSIGNED" : scenario === "completed" ? "COMPLETED" : "ASSIGNED" };
  const run = scenario === "draft" || scenario === "ready" ? { id: "initial", status: scenario === "draft" ? "DRAFT" : "READY_FOR_REVIEW" } : null;
  return <main className="app-shell"><label>Local synthetic scenario <select aria-label="Local synthetic scenario" value={scenario} onChange={(event) => { setScenario(event.target.value); setOpened(false); }}>{["unassigned", "assigned", "draft", "ready", "completed"].map((item) => <option key={item}>{item}</option>)}</select></label>
    {opened && <p role="status">Existing Run open callback reached (synthetic).</p>}
    <JobDetail key={job.id} job={job} property={null} knownCleaners={[{ id: "synthetic-cleaner", name: "Alex Demo" }]} availableCleaners={[{ id: "synthetic-cleaner", name: "Alex Demo", active: true }, { id: "ingrid-demo", name: "Ingrid Demo", active: true }, { id: "karina-demo", name: "Karina Demo", active: true }, { id: "inactive-demo", name: "Ingrid Inactive", active: false }]} offers={[]} assignments={scenario === "unassigned" ? [] : [{ id: "synthetic-assignment", cleanerId: "synthetic-cleaner", isActive: true }]} issues={[]} checklistRun={run} checklistCapability={{ state: "NONE" }}
      onBack={noop} onOfferToCleaners={noop} onRefreshOffers={noop} onRefreshIssues={noop} onRefreshChecklistRun={noop} onCreateChecklistRun={noop} onOpenChecklistRun={() => setOpened(true)} onRefreshChecklistCapability={noop} onIssueChecklistCapability={noop} onRevokeChecklistCapability={noop} onCreatePublicOfferLink={noop} onAssignCleaner={noop} onAssignCleanerDirectly={noop} onRemoveAssignment={noop} onReplaceAssignment={noop} onStartCleaning={noop} onCompleteCleaning={noop} onUpdatePrices={noop} onUpdateDetails={noop} onUpdateSchedule={noop} onSaveDataProvenance={noop} onArchive={noop} onRestore={noop} />
  </main>;
}
if (import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(location.hostname)) createRoot(document.getElementById("root")).render(<TranslationProvider><Fixture /></TranslationProvider>);

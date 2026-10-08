import { useState } from "react";
import { createRoot } from "react-dom/client";
import { JobDetailV2Pilot } from "../../src/features/jobs/JobDetailV2Pilot.jsx";
import { TranslationProvider } from "../../src/i18n/translations.js";
import { getServiceLifecycleFixture, serviceLifecycleScenarios } from "../../scripts/serviceLifecycleFixtures.mjs";
import "../../src/index.css";

const mutations = ["onOfferToCleaners", "onCreateChecklistRun", "onIssueChecklistCapability", "onPrepareChecklistReminder", "onRevokeChecklistCapability", "onCreatePublicOfferLink", "onAssignCleaner", "onAssignCleanerDirectly", "onRemoveAssignment", "onReplaceAssignment", "onStartCleaning", "onCompleteCleaning", "onUpdatePrices", "onUpdateDetails", "onUpdateSchedule", "onSimulateAssignedCleaner", "onResolveIssue", "onSaveDataProvenance", "onArchive", "onRestore"];
const reads = ["onBack", "onRefreshOffers", "onRefreshIssues", "onRefreshChecklistRun", "onOpenChecklistRun", "onRefreshChecklistCapability"];
function Fixture() {
  const [scenario, setScenario] = useState(new URLSearchParams(location.search).get("scenario") || "assigned-draft");
  const fixture = getServiceLifecycleFixture(scenario === "archived" ? "completed" : scenario === "unknown" ? "unassigned" : scenario);
  if (scenario === "archived") fixture.job = { ...fixture.job, id: "synthetic-archived", archivedAt: "2026-10-03T18:00:00Z" };
  if (scenario === "unknown") fixture.job = { ...fixture.job, operationalStatus: "UNRECOGNIZED" };
  const handlers = Object.fromEntries([...mutations, ...reads].map(name => [name, () => { window.__f1Calls.push(name); }]));
  return <main className="app-shell" style={{ maxWidth: "1560px" }}>
    <div className="lifecycle-fixture-toolbar"><label>Local synthetic scenario<select aria-label="Local synthetic scenario" value={scenario} onChange={event => { window.__f1Calls = []; setScenario(event.target.value); }}>
      {[...serviceLifecycleScenarios, { id: "archived", label: "Archived" }, { id: "unknown", label: "Unknown" }].map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label></div>
    <JobDetailV2Pilot key={scenario} {...fixture} availableCleaners={fixture.knownCleaners} canRestore={false} {...handlers} />
  </main>;
}
if (import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(location.hostname)) {
  const params = new URLSearchParams(location.search);
  localStorage.setItem("cleanflow-language", params.get("lang") || "en");
  document.documentElement.dataset.theme = params.get("theme") || "light";
  window.__f1Calls = []; window.__lifecycleProviderCalls = [];
  createRoot(document.getElementById("root")).render(<TranslationProvider><Fixture /></TranslationProvider>);
}

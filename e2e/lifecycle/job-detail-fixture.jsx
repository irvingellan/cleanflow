// DEV + loopback only. Render the actual Job Detail with shared synthetic props.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { JobDetail } from "../../src/features/jobs/JobDetail.jsx";
import { TranslationProvider } from "../../src/i18n/translations.js";
import {
  getServiceLifecycleFixture,
  serviceLifecycleScenarios,
} from "../../scripts/serviceLifecycleFixtures.mjs";
import "../../src/index.css";

const additionalScenarios = [
  { id: "unknown", label: "Unknown state — synthetic safety check" },
  { id: "archived", label: "Archived — synthetic safety check" },
];

function scenarioFixture(id) {
  if (id === "unknown") {
    const fixture = getServiceLifecycleFixture("unassigned");
    return {
      ...fixture,
      job: { ...fixture.job, id: "synthetic-lifecycle-unknown", operationalStatus: "UNRECOGNIZED" },
      hasChecklistRunError: true,
    };
  }
  if (id === "archived") {
    const fixture = getServiceLifecycleFixture("in-progress");
    return {
      ...fixture,
      job: { ...fixture.job, id: "synthetic-lifecycle-archived", archivedAt: "2026-10-03T18:00:00.000Z" },
    };
  }
  return getServiceLifecycleFixture(id);
}

const mutationNames = [
  "onOfferToCleaners", "onCreateChecklistRun", "onIssueChecklistCapability",
  "onPrepareChecklistReminder", "onRevokeChecklistCapability", "onCreatePublicOfferLink",
  "onAssignCleaner", "onAssignCleanerDirectly", "onRemoveAssignment", "onReplaceAssignment",
  "onStartCleaning", "onCompleteCleaning", "onUpdatePrices", "onUpdateDetails",
  "onUpdateSchedule", "onSimulateAssignedCleaner", "onResolveIssue", "onSaveDataProvenance",
  "onArchive", "onRestore",
];
const readNames = [
  "onBack", "onRefreshOffers", "onRefreshIssues", "onRefreshChecklistRun",
  "onOpenChecklistRun", "onRefreshChecklistCapability",
];

function Fixture() {
  const [scenario, setScenario] = useState("unassigned");
  const fixture = scenarioFixture(scenario);
  const handlers = Object.fromEntries([
    ...mutationNames.map((name) => [name, (...args) => {
      window.__lifecycleHarness.mutationCalls.push({ name, argumentCount: args.length });
    }]),
    ...readNames.map((name) => [name, (...args) => {
      window.__lifecycleHarness.readCalls.push({ name, argumentCount: args.length });
    }]),
  ]);

  return (
    <main className="app-shell">
      <div className="lifecycle-fixture-toolbar">
        <label>
          Local synthetic scenario
          <select
            aria-label="Local synthetic scenario"
            value={scenario}
            onChange={(event) => {
              const nextScenario = event.target.value;
              window.__lifecycleHarness = { scenario: nextScenario, mutationCalls: [], readCalls: [] };
              setScenario(nextScenario);
            }}
          >
            {[...serviceLifecycleScenarios, ...additionalScenarios].map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <JobDetail
        key={scenario}
        {...fixture}
        property={null}
        availableCleaners={fixture.knownCleaners.map((cleaner) => ({ ...cleaner, active: true }))}
        isLoadingCleaners={false}
        hasCleanerError={false}
        isLoadingOffers={false}
        hasOffersError={false}
        isLoadingAssignments={false}
        hasAssignmentsError={false}
        isLoadingIssues={false}
        hasIssuesError={false}
        isLoadingChecklistRun={false}
        hasChecklistRunError={Boolean(fixture.hasChecklistRunError)}
        isCreatingChecklistRun={false}
        hasCreateChecklistRunError={false}
        isLoadingChecklistCapability={false}
        hasChecklistCapabilityError={false}
        isIssuingChecklistCapability={false}
        hasIssueChecklistCapabilityError={false}
        isRevokingChecklistCapability={false}
        hasRevokeChecklistCapabilityError={false}
        canRestore={false}
        {...handlers}
      />
    </main>
  );
}

if (import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(location.hostname)) {
  window.__lifecycleHarness = { scenario: "unassigned", mutationCalls: [], readCalls: [] };
  window.__lifecycleProviderCalls = [];
  createRoot(document.getElementById("root")).render(<TranslationProvider><Fixture /></TranslationProvider>);
}

import { createRoot } from "react-dom/client";
import { JobDetail } from "../../src/features/jobs/JobDetail.jsx";
import { OfferCleaners } from "../../src/features/jobs/JobWorkflowViews.jsx";
import { TranslationProvider } from "../../src/i18n/translations.js";
import "../../src/index.css";
import "../../src/styles/system.css";

const job = {
  id: "synthetic-service",
  schemaVersion: 2,
  propertyId: "synthetic-house",
  propertyName: "Casa fictícia de demonstração",
  scheduledDate: "2026-11-14",
  scheduledStart: "11:00",
  operationalStatus: "UNASSIGNED",
  assignedCleanerIds: [],
};
const cleaners = [
  { id: "new", name: "Alex Demo", active: true },
  { id: "scheduled", name: "Jamie Demo", active: true },
  { id: "experienced", name: "Riley Demo", active: true },
  { id: "returning", name: "Taylor Demo", active: true },
];
const noop = () => {};
const params = new URLSearchParams(location.search);
const view = params.get("view") === "assign" ? "assign" : "offer";
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
localStorage.setItem("cleanflow-language", "pt");

if (import.meta.env.DEV && location.hostname === "127.0.0.1") {
  createRoot(document.getElementById("root")).render(
    <TranslationProvider>
      <main className="app-shell">
        {view === "assign" ? (
          <JobDetail job={job} knownCleaners={cleaners} availableCleaners={cleaners} offers={[]} assignments={[]} issues={[]}
            onBack={noop} onOfferToCleaners={noop} onAssignCleanerDirectly={() => { throw new Error("Unexpected assignment"); }} />
        ) : (
          <OfferCleaners job={job} cleaners={cleaners} onBack={noop} />
        )}
      </main>
    </TranslationProvider>
  );
}

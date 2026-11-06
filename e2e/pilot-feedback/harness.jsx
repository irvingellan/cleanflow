// Pilot feedback UX harness — synthetic, local only. See vite.config.js.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { JobDetail } from "../../src/features/jobs/JobDetail.jsx";
import { CleanerHubApp } from "../../src/features/cleaner-hub/CleanerHubApp.jsx";
import { PublicChecklistPage } from "../../src/features/checklists/PublicChecklistPage.jsx";
import { PublicClientReportPage } from "../../src/features/checklists/PublicClientReportPage.jsx";
import { ClientReportControls } from "../../src/features/checklists/ClientReportControls.jsx";
import { ChecklistRunDetail } from "../../src/features/checklists/ChecklistRunDetail.jsx";
import { JobsPage, createJobListFilters } from "../../src/features/jobs/JobsPage.jsx";
import { TranslationProvider } from "../../src/i18n/translations.js";
import { hubEntries, managerCleaners, managerScenarios, submittedEntry } from "./fixtures.js";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
const screen = params.get("screen") || "manager";
const scenario = params.get("scenario") || "one";
const lang = params.get("lang") || "pt";
document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
try {
  localStorage.setItem("cleanflow-language", lang);
  localStorage.setItem("cleanflow.cleanerHub.language", lang);
  localStorage.setItem("cleanflow.cleanerHub.onboarded", "synthetic-uid");
} catch { /* preview only */ }
const noop = () => {};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function Strip() {
  return <div data-testid="synthetic-strip" style={{ position: "relative", zIndex: 5, padding: "4px 12px", background: "#fff6e6", color: "#6f501d", font: "600 12px/1.4 system-ui, sans-serif", borderBottom: "1px solid #e8d5ad" }}>
    Prévia sintética local · dados fictícios · nada é salvo
    {params.get("checklistPreview") === "1" && " · checklist: contrato futuro não publicado"}
  </div>;
}

function Manager() {
  const data = managerScenarios[scenario] || managerScenarios.one;
  const [offers, setOffers] = useState(data.offers);
  const [job, setJob] = useState({ id: `synthetic-${scenario}`, schemaVersion: 2, propertyName: "Casa Jasmim (exemplo)", clientName: "Cliente Exemplo", scheduledDate: "2026-11-20", scheduledStart: "11:00", dataProvenance: "DEMO", operationalStatus: data.status, assignedCleanerIds: [] });
  const [assignments, setAssignments] = useState([]);
  const assign = async (offer) => {
    await wait(300);
    setJob((current) => ({ ...current, operationalStatus: "ASSIGNED", assignedCleanerIds: [offer.cleanerId] }));
    setAssignments([{ id: "synthetic-assignment", cleanerId: offer.cleanerId, cleanerName: offer.cleanerName, isActive: true, sourceOfferId: offer.id }]);
    setOffers((current) => current.map((item) => item.id === offer.id ? item : item));
  };
  // Same container as the real manager app (App.jsx: .foundation, 680px).
  return <main className="app-shell"><section className="foundation"><JobDetail key={job.id} job={job} property={null} knownCleaners={managerCleaners} availableCleaners={managerCleaners}
    offers={offers} isLoadingOffers={false} hasOffersError={false} assignments={assignments} isLoadingAssignments={false} hasAssignmentsError={false}
    issues={[]} isLoadingIssues={false} hasIssuesError={false} checklistRun={null} checklistCapability={{ state: "NONE" }}
    initialFocus={params.get("focus")}
    onBack={noop} onOfferToCleaners={noop} onRefreshOffers={noop} onRefreshIssues={noop} onRefreshChecklistRun={noop} onCreateChecklistRun={noop} onOpenChecklistRun={noop}
    onRefreshChecklistCapability={noop} onIssueChecklistCapability={noop} onRevokeChecklistCapability={noop} onCreatePublicOfferLink={noop}
    onAssignCleaner={assign} onAssignCleanerDirectly={noop} onRemoveAssignment={noop} onReplaceAssignment={noop} onStartCleaning={noop} onCompleteCleaning={noop}
    onUpdatePrices={noop} onUpdateDetails={noop} onUpdateSchedule={noop} onSaveDataProvenance={noop} onArchive={noop} onRestore={noop} /></section></main>;
}

function hubService() {
  const session = { status: "signed-in", uid: "synthetic-uid", organizationId: "demo-org", cleanerId: "ana-demo", sessionId: "synthetic-session" };
  const preparedEntries = scenario === "submitted" ? [submittedEntry, ...hubEntries()] : hubEntries();
  // Release A does not yet publish checklist projection fields. The opt-in view
  // demonstrates the prepared UI only; default fixtures model the deployed contract.
  const entries = params.get("checklistPreview") === "1" ? preparedEntries : preparedEntries.map(({ checklist: _checklist, ...entry }) => entry);
  return {
    subscribeCleanerSession: (callback) => { callback(session); return noop; },
    subscribeMembership: (_scope, callback) => { callback({ state: "active", displayName: "Ana", preferredLanguage: lang }); return noop; },
    subscribeAgenda: (_scope, onAgenda) => { setTimeout(() => onAgenda({ entries, fromCache: false }), 0); return noop; },
    verifyFromServer: async () => ({ active: true, entries }),
    reconnectAgenda: async () => {},
    redeemAccessCode: async () => {},
    signOutCleaner: async () => {},
    openMyChecklist: async () => ({ state: "not-ready" }),
    respondToMyOffer: async () => ({ state: "answered" }),
  };
}
const inboxItems = [
  { id: "synthetic-job-notice", type: "ASSIGNED", read: false, openable: true, serviceLabel: "Casa Jasmim (exemplo)", createdAtMs: Date.now() },
  { id: "synthetic-offer-notice", type: "NEW_OFFER", read: false, openable: true, serviceLabel: "Casa Bromélia (exemplo)", createdAtMs: Date.now() - 60_000 },
];
const inboxService = {
  list: async () => ({ items: inboxItems, unreadCount: 2, hasOlder: true, nextCursor: null }),
  mark: async (_role, id) => {
    const item = inboxItems.find((entry) => entry.id === id);
    if (item) item.read = true;
    return { state: item ? "read" : "unavailable" };
  },
  open: async (_role, id) => {
    const item = inboxItems.find((entry) => entry.id === id);
    if (!item) return { state: "unavailable" };
    item.read = true;
    return { state: "opened", destination: { kind: id === "synthetic-job-notice" ? "JOB" : "OFFER", jobId: id === "synthetic-job-notice" ? "job-1" : "offer-1" } };
  },
};
const hubOptions = { service: hubService(), inboxService };

const reportJob = { id: "synthetic-report", clientId: "client-1", clientName: "Cliente Exemplo", propertyName: "Casa Jasmim (exemplo)", scheduledDate: "2026-11-20" };
const reportContact = async () => ({ name: "Dana Exemplo", phone: "(555) 010-2030", email: "dana@example.com" });

function ReportManager() {
  return <main className="app-shell"><section className="foundation"><div className="panel">
    <ClientReportControls jobId={reportJob.id} job={reportJob} getContact={reportContact} />
  </div></section></main>;
}

const photoColors = ["#cfe0d6", "#d9e3ec", "#eadfcf", "#e1d9ea", "#d4e6e4", "#e8d6d6", "#dfe6cf", "#d6dbe8"];
async function syntheticEvidence(_jobId, _requirementId, evidenceId) {
  const index = Number(String(evidenceId || "photo-1").split("-").pop()) - 1;
  await wait(150 + (index % 4) * 120);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="${photoColors[index % photoColors.length]}"/><text x="450" y="610" font-family="sans-serif" font-size="56" text-anchor="middle" fill="#41524a">${lang === "pt" ? "Foto fictícia" : "Sample photo"} ${index + 1}</text></svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

function ChecklistManager() {
  const count = Number(params.get("photos") || 24);
  const evidence = Array.from({ length: count }, (_, i) => ({ evidenceId: `photo-${i + 1}`, requirementId: i ? "additional" : "living-belongings", hiddenFromReport: i === 3 }));
  const run = { id: "initial", status: "READY_FOR_REVIEW", property: { name: "Casa Jasmim (exemplo)" }, checklistItemCount: 9, inventoryItemCount: 3, evidence,
    draft: { revision: 2, lastSavedAt: null, checklistAnswers: {}, inventoryAnswers: {}, issueNotes: "", generalNotes: "" } };
  return <main className="app-shell"><section className="foundation"><ChecklistRunDetail job={{ ...reportJob, clientId: undefined, id: "synthetic-checklist-job", operationalStatus: "COMPLETED" }}
    checklistRun={run} loadEvidence={syntheticEvidence} setPhotoVisibility={async () => {}} onBack={noop} onRefresh={noop} /></section></main>;
}

const listJobs = [
  ["a", "Casa Jasmim (exemplo)", "2026-11-20", "COMPLETED"], ["b", "Casa Bromélia (exemplo)", "2026-11-19", "COMPLETED"],
  ["c", "Loft Ipê (exemplo)", "2026-11-21", "IN_PROGRESS"], ["d", "Studio Acácia (exemplo)", "2026-11-22", "ASSIGNED"],
  ["e", "Casa Hibisco (exemplo)", "2026-11-18", "COMPLETED"],
].map(([id, propertyName, scheduledDate, operationalStatus]) => ({ id: `job-${id}`, propertyName, clientName: "Cliente Exemplo", scheduledDate, scheduledStart: "10:00", operationalStatus, dataProvenance: "DEMO", assignedCleanerIds: [] }));
const listCounts = { "job-a": { photoCount: 42 }, "job-b": { photoCount: 0 }, "job-c": { photoCount: 7 }, "job-e": { photoCount: 18 } };

function Services() {
  const [filters, setFilters] = useState(createJobListFilters({ withPhotos: params.get("withPhotos") === "1" }));
  return <main className="app-shell"><section className="foundation"><JobsPage jobs={listJobs} isLoading={false} hasError={false} onSelect={noop} onCreate={noop}
    filters={filters} cleaners={[]} properties={[]} onFiltersChange={(changes) => setFilters((current) => ({ ...current, ...changes }))}
    onClearFilters={() => setFilters(createJobListFilters())} hasMore={false} isLoadingMore={false} onLoadMore={noop}
    loadPhotoCounts={async () => { await wait(200); return listCounts; }} /></section></main>;
}

function App() {
  if (screen === "checklist-manager") return <><Strip /><ChecklistManager /></>;
  if (screen === "services") return <><Strip /><Services /></>;
  if (screen === "report") return <><Strip /><PublicClientReportPage token="synthetic-token" /></>;
  if (screen === "report-manager") return <><Strip /><ReportManager /></>;
  if (screen === "hub") return <><Strip /><CleanerHubApp hubOptions={hubOptions} /></>;
  if (screen === "checklist") return <><Strip /><PublicChecklistPage token="synthetic-checklist" /></>;
  return <><Strip /><Manager /></>;
}

if (["localhost", "127.0.0.1"].includes(location.hostname)) createRoot(document.getElementById("root")).render(<TranslationProvider><App /></TranslationProvider>);

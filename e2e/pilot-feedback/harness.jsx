// Pilot feedback UX harness — synthetic, local only. See vite.config.js.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { JobDetail } from "../../src/features/jobs/JobDetail.jsx";
import { CleanerHubApp } from "../../src/features/cleaner-hub/CleanerHubApp.jsx";
import { PublicChecklistPage } from "../../src/features/checklists/PublicChecklistPage.jsx";
import { TranslationProvider } from "../../src/i18n/translations.js";
import { fictitiousAccess, hubEntries, managerCleaners, managerScenarios, submittedEntry } from "./fixtures.js";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
const screen = params.get("screen") || "manager";
const scenario = params.get("scenario") || "one";
const lang = params.get("lang") || "pt";
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
  const entries = scenario === "submitted" ? [submittedEntry, ...hubEntries()] : hubEntries();
  const access = { access: fictitiousAccess, revoked: { state: "revoked" }, "not-provided": { state: "not-provided" } }[params.get("access") || "access"];
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
    ...(params.get("access") === "none" ? {} : { getMyJobAccess: async () => { await wait(150); return access; } }),
  };
}
const hubOptions = { service: hubService() };

function App() {
  if (screen === "hub") return <><Strip /><CleanerHubApp hubOptions={hubOptions} /></>;
  if (screen === "checklist") return <><Strip /><PublicChecklistPage token="synthetic-checklist" /></>;
  return <><Strip /><Manager /></>;
}

if (["localhost", "127.0.0.1"].includes(location.hostname)) createRoot(document.getElementById("root")).render(<TranslationProvider><App /></TranslationProvider>);

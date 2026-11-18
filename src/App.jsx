import { lazy, Suspense, useLayoutEffect } from "react";
import { guardEntryLoad } from "./app/entryLoadRecovery.js";
import {
  isChecklistPreviewPath,
  isCleanerHubPath,
  publicChecklistTokenFromSearch,
  publicClientPortalTokenFromSearch,
  publicClientReportTokenFromSearch,
  publicOfferTokenFromPathname,
} from "./app/entryRoute.js";
import { ThemeProvider } from "./theme/theme.js";

export { isCleanerHubPath };

// One chunk per audience: a cleaner or a client never downloads the manager application.
const entryLoaders = {
  cleanerHub: () => import("./features/cleaner-hub/CleanerHubApp.jsx").then((module) => ({ default: module.CleanerHubApp })),
  publicOffer: () => import("./features/public-offers/PublicOfferPage.jsx").then((module) => ({ default: module.PublicOfferPage })),
  publicChecklist: () => import("./features/checklists/PublicChecklistPage.jsx").then((module) => ({ default: module.PublicChecklistPage })),
  clientPortal: () => import("./features/client-portal/PublicClientPortalPage.jsx").then((module) => ({ default: module.PublicClientPortalPage })),
  clientReport: () => import("./features/checklists/PublicClientReportPage.jsx").then((module) => ({ default: module.PublicClientReportPage })),
  checklistPreview: () => import("./features/checklist-preview/CleaningChecklistPreview.jsx").then((module) => ({ default: module.CleaningChecklistPreview })),
  manager: () => import("./features/manager-app/ManagerRoot.jsx").then((module) => ({ default: module.ManagerRoot })),
};

const entryDownloads = new Map();
function downloadEntry(name) {
  if (!entryDownloads.has(name)) entryDownloads.set(name, guardEntryLoad(entryLoaders[name]));
  return entryDownloads.get(name);
}

const entries = Object.fromEntries(Object.keys(entryLoaders).map((name) => [name, lazy(() => downloadEntry(name))]));

function currentEntry() {
  // Cleaner Hub has its own Firebase app/session; the manager session is never read there.
  if (isCleanerHubPath()) return { name: "cleanerHub" };
  const publicOfferToken = publicOfferTokenFromPathname();
  if (publicOfferToken !== null) return { name: "publicOffer", token: publicOfferToken };
  const publicChecklistToken = publicChecklistTokenFromSearch();
  if (publicChecklistToken !== null) return { name: "publicChecklist", token: publicChecklistToken };
  const publicClientPortalToken = publicClientPortalTokenFromSearch();
  if (publicClientPortalToken !== null) return { name: "clientPortal", token: publicClientPortalToken };
  const publicClientReportToken = publicClientReportTokenFromSearch();
  if (publicClientReportToken !== null) return { name: "clientReport", token: publicClientReportToken };
  if (isChecklistPreviewPath()) return { name: "checklistPreview" };
  return { name: "manager" };
}

// Start the actual browser entry before the first render; lazy() reuses its promise.
export function preloadCurrentEntry() {
  return downloadEntry(currentEntry().name);
}

function StartupCommit() {
  useLayoutEffect(() => { window.__cleanflowStartup?.mounted() }, []);
  return null;
}

function renderEntry({ name, token }) {
  const Entry = entries[name];
  // Cleaner Hub, the checklist preview and the manager root provide their own theme.
  if (["cleanerHub", "checklistPreview", "manager"].includes(name)) return <Entry />;
  return <ThemeProvider><Entry token={token} /></ThemeProvider>;
}

function App() {
  // The HTML startup fallback stays visible until the entry has rendered and committed.
  return (
    <Suspense fallback={null}>
      {renderEntry(currentEntry())}
      <StartupCommit />
    </Suspense>
  );
}

export default App;

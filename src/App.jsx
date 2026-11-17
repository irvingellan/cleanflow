import {
  isChecklistPreviewPath,
  isCleanerHubPath,
  publicChecklistTokenFromSearch,
  publicClientPortalTokenFromSearch,
  publicClientReportTokenFromSearch,
  publicOfferTokenFromPathname,
} from "./app/entryRoute.js";
import { PublicOfferPage } from "./features/public-offers/PublicOfferPage.jsx";
import { CleaningChecklistPreview } from "./features/checklist-preview/CleaningChecklistPreview.jsx";
import { PublicChecklistPage } from "./features/checklists/PublicChecklistPage.jsx";
import { CleanerHubApp } from "./features/cleaner-hub/CleanerHubApp.jsx";
import { PublicClientReportPage } from "./features/checklists/PublicClientReportPage.jsx";
import { PublicClientPortalPage } from "./features/client-portal/PublicClientPortalPage.jsx";
import { ManagerRoot } from "./features/manager-app/ManagerRoot.jsx";
import { ThemeProvider } from "./theme/theme.js";

export { isCleanerHubPath };

function App() {
  const publicOfferToken = publicOfferTokenFromPathname();
  const isPublicOfferRoute = publicOfferToken !== null;
  const publicChecklistToken = publicChecklistTokenFromSearch();
  const isPublicChecklistRoute = publicChecklistToken !== null;
  const publicClientReportToken = publicClientReportTokenFromSearch();
  const isPublicClientPortalRoute = publicClientPortalTokenFromSearch() !== null;
  const isPublicClientReportRoute = publicClientReportToken !== null || isPublicClientPortalRoute;
  const isChecklistPreviewRoute = isChecklistPreviewPath();
  // Cleaner Hub has its own Firebase app/session; the manager session is never read there.
  const isCleanerHubRoute = isCleanerHubPath();

  if (isCleanerHubRoute) {
    return <CleanerHubApp />;
  }

  if (isPublicOfferRoute) {
    return <ThemeProvider><PublicOfferPage token={publicOfferToken} /></ThemeProvider>;
  }

  if (isPublicChecklistRoute) {
    return <ThemeProvider><PublicChecklistPage token={publicChecklistToken} /></ThemeProvider>;
  }

  if (isPublicClientReportRoute) {
    if (isPublicClientPortalRoute) return <ThemeProvider><PublicClientPortalPage token={publicClientPortalTokenFromSearch()} /></ThemeProvider>;
    return <ThemeProvider><PublicClientReportPage token={publicClientReportToken} /></ThemeProvider>;
  }

  if (isChecklistPreviewRoute) {
    return <CleaningChecklistPreview />;
  }

  return <ManagerRoot />;
}

export default App;

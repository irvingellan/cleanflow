import { useState } from "react";
import { ManagerAccessBoundary } from "../auth/ManagerAccessBoundary.jsx";
import { AuthenticationLoading, ManagerLogin } from "../auth/ManagerSignIn.jsx";
import { signOutManager } from "../auth/authService.js";
import { useInitialManagerSession } from "../auth/useInitialManagerSession.js";
import { useOrganizationScope } from "../auth/useOrganizationScope.js";
import { abortManagerPushSignOut, prepareManagerPushSignOut } from "../notifications/notificationService.js";
import { clearOneSignalUser } from "../notifications/oneSignalService.js";
import { currentOrganizationId } from "../../services/organization/currentOrganization.js";
import { ThemeProvider } from "../../theme/theme.js";
import { ManagerApplication } from "./ManagerApplication.jsx";

/** The manager entry: session restore, sign-in, and the signed-in application. */
export function ManagerRoot() {
  const { authUser, status: authStatus, retry: retryAuth } = useInitialManagerSession(true);
  const { ready: organizationReady } = useOrganizationScope(authUser);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasSignOutError, setHasSignOutError] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    setHasSignOutError(false);
    let pushSignOutPreparation;

    try {
      pushSignOutPreparation = await prepareManagerPushSignOut().catch(() => undefined);
      await signOutManager();
      await clearOneSignalUser().catch(() => undefined);
    } catch {
      abortManagerPushSignOut(pushSignOutPreparation);
      setHasSignOutError(true);
    } finally {
      setIsSigningOut(false);
    }
  }

  if (authUser === undefined) {
    return <ThemeProvider><AuthenticationLoading status={authStatus} onRetry={retryAuth} /></ThemeProvider>;
  }

  if (!authUser) {
    return <ThemeProvider><ManagerLogin /></ThemeProvider>;
  }

  // Nothing below may mount before the account's organization is selected.
  if (!organizationReady) {
    return <ThemeProvider><AuthenticationLoading status="loading" onRetry={retryAuth} /></ThemeProvider>;
  }

  return (
    <ThemeProvider>
      <ManagerAccessBoundary
        key={`${authUser.uid}:${currentOrganizationId()}`}
        user={authUser}
        onSignOut={handleSignOut}
        isSigningOut={isSigningOut}
        hasSignOutError={hasSignOutError}
      >
        <ManagerApplication
          authUser={authUser}
          hasSignOutError={hasSignOutError}
          isSigningOut={isSigningOut}
          onSignOut={handleSignOut}
        />
      </ManagerAccessBoundary>
    </ThemeProvider>
  );
}

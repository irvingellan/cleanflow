import { useOrganizationScope } from "../auth/useOrganizationScope.js";
import { useState } from "react";
import { ManagerAccessBoundary } from "../auth/ManagerAccessBoundary.jsx";
import { AuthenticationLoading, ManagerLogin } from "../auth/ManagerSignIn.jsx";
import { signOutManager } from "../auth/authService.js";
import { useInitialManagerSession } from "../auth/useInitialManagerSession.js";
import { abortManagerPushSignOut, prepareManagerPushSignOut } from "../notifications/notificationService.js";
import { clearOneSignalUser } from "../notifications/oneSignalService.js";
import { ThemeProvider } from "../../theme/theme.js";
import { PlatformPage } from "../dev-center/PlatformPage.jsx";
import { ManagerApplication } from "./ManagerApplication.jsx";

/** The manager entry: session restore, sign-in, and the signed-in application. */
export function ManagerRoot() {
  const { authUser, status: authStatus, retry: retryAuth } = useInitialManagerSession(true);
  const platformRoute = ["/platform", "/platform/"].includes(window.location.pathname);
  const organization = useOrganizationScope(platformRoute ? null : authUser);
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

  // Platform access belongs to the developer account, independently of membership.
  if (platformRoute) {
    return (
      <ThemeProvider>
        <PlatformPage key={authUser.uid} onSignOut={handleSignOut}
          isSigningOut={isSigningOut} hasSignOutError={hasSignOutError} />
      </ThemeProvider>
    );
  }

  if (!organization.ready) return <ThemeProvider><AuthenticationLoading /></ThemeProvider>;

  return (
    <ThemeProvider>
      <ManagerAccessBoundary
        key={authUser.uid}
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

import { useTranslation } from "../../i18n/translations.js";
import { useManagerAccess } from "./useManagerAccess.js";

export function ManagerAccessBoundary({ user, onSignOut, isSigningOut, hasSignOutError, children }) {
  const { translate } = useTranslation();
  const { status: access, retry } = useManagerAccess(user);
  const pending = access === "loading" || access === "reconnecting";
  const copyKey = {
    loading: "Loading", reconnecting: "Reconnecting", offline: "Offline", error: "Error", denied: "Denied",
  }[access];

  if (access === "allowed") return children;

  return (
    <main className="app-shell">
      <section className="foundation auth-foundation panel">
        <h1>CleanFlow</h1>
        <p role={pending ? "status" : "alert"}>
          {translate(`auth.managerAccess${copyKey}`)}
        </p>
        {hasSignOutError && <p role="alert">{translate("auth.signOutError")}</p>}
        {(access === "error" || access === "offline") && (
          <button className="button button--primary" type="button" onClick={retry}>
            {translate("auth.managerAccessRetry")}
          </button>
        )}
        <button className="button" type="button" onClick={onSignOut} disabled={isSigningOut}>
          {translate(isSigningOut ? "auth.signingOut" : "auth.signOut")}
        </button>
      </section>
    </main>
  );
}

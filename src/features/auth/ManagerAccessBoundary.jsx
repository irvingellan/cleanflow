import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { subscribeToManagerAccess } from "./managerAccessService.js";

export function ManagerAccessBoundary({ user, onSignOut, isSigningOut, hasSignOutError, children }) {
  const { translate } = useTranslation();
  const [access, setAccess] = useState("loading");

  useEffect(() => {
    return subscribeToManagerAccess(
      user,
      (allowed) => setAccess(allowed ? "allowed" : "denied"),
      () => setAccess("error"),
    );
  }, [user]);

  if (access === "allowed") return children;

  return (
    <main className="app-shell">
      <section className="foundation auth-foundation panel">
        <h1>CleanFlow</h1>
        <p role={access === "loading" ? "status" : "alert"}>
          {translate(`auth.managerAccess${access === "loading" ? "Loading" : access === "error" ? "Error" : "Denied"}`)}
        </p>
        {hasSignOutError && <p role="alert">{translate("auth.signOutError")}</p>}
        <button className="button" type="button" onClick={onSignOut} disabled={isSigningOut}>
          {translate(isSigningOut ? "auth.signingOut" : "auth.signOut")}
        </button>
      </section>
    </main>
  );
}

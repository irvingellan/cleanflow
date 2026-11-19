import { LanguageSelector } from "../../components/LanguageSelector.jsx";
import { Icon } from "../../components/Icon.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { ThemeToggle } from "../auth/ManagerSignIn.jsx";
import { PlatformConsole } from "./PlatformConsole.jsx";
import { SystemStatusPanel } from "./SystemStatusPanel.jsx";
import "./platformPage.css";

export function PlatformPage({ onSignOut, isSigningOut, hasSignOutError }) {
  const { language, setLanguage, translate } = useTranslation();
  return (
    <main className="platform-page">
      <header className="platform-page__bar">
        <span className="cf-brand cf-brand--on-surface">
          <span className="cf-brand__mark" aria-hidden="true"><Icon name="broom" size={18} /></span>
          <span className="cf-brand__name">CleanFlow</span>
        </span>
        <div className="platform-page__controls">
          <LanguageSelector language={language} onChange={setLanguage} />
          <ThemeToggle />
          <button type="button" className="button button--small" disabled={isSigningOut} onClick={onSignOut}>
            {translate(isSigningOut ? "auth.signingOut" : "auth.signOut")}
          </button>
        </div>
      </header>
      {hasSignOutError && <p role="alert">{translate("auth.signOutError")}</p>}
      <h1 className="cf-page-title">{translate("platform.tab")}</h1>
      <p className="cf-page-context">{translate("platform.intro")}</p>
      <PlatformConsole><SystemStatusPanel /></PlatformConsole>
    </main>
  );
}

import { useEffect, useState } from "react";
import { appVersion } from "../../appVersion.js";
import { content } from "../../app/content.js";
import { Icon } from "../../components/Icon.jsx";
import { LanguageSelector } from "../../components/LanguageSelector.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { signInWithEmail } from "./authService.js";
import { recordManagerAccessDiagnostic } from "./managerAccessDiagnostics.js";
import { useTranslation } from "../../i18n/translations.js";
import { useTheme } from "../../theme/theme.js";

// The sign-in screens share the language selector with the manager shell and the public offer page.
export { LanguageSelector };

export function AuthenticationLoading({ status, onRetry }) {
  const { language, setLanguage, translate } = useTranslation();
  const pending = status === "loading";
  const copy = pending ? "auth.loading" : status === "offline" ? "auth.managerAccessOffline" : "auth.restoreError";

  return (
    <AuthenticationLayout language={language} onLanguageChange={setLanguage}>
      <StateCard message={translate(copy)} status={pending ? "status" : "alert"} isError={!pending} />
      {!pending && (
        <button className="button button--primary" type="button" onClick={onRetry}>
          {translate("auth.managerAccessRetry")}
        </button>
      )}
    </AuthenticationLayout>
  );
}

export function ManagerLogin() {
  const { language, setLanguage, translate } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [signInSlow, setSignInSlow] = useState(false);

  useEffect(() => {
    if (!isSigningIn) return undefined;
    const startedAt = Date.now();
    let reported = false;
    const expire = (force) => {
      if (reported || (force !== true && Date.now() - startedAt < 20_000)) return;
      reported = true;
      setSignInSlow(true);
      recordManagerAccessDiagnostic("auth_signin_timeout", { durationMs: Date.now() - startedAt, reason: "timeout" });
    };
    const timer = setTimeout(() => expire(true), 20_000);
    window.addEventListener("pageshow", expire);
    document.addEventListener("visibilitychange", expire);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pageshow", expire);
      document.removeEventListener("visibilitychange", expire);
    };
  }, [isSigningIn]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSigningIn) return;

    if (!email.trim() || !password) {
      setErrorMessage(translate("auth.credentialsRequired"));
      return;
    }

    setIsSigningIn(true);
    setSignInSlow(false);
    setErrorMessage("");

    try {
      await signInWithEmail({ email: email.trim(), password });
    } catch {
      setErrorMessage(translate("auth.signInError"));
      setIsSigningIn(false);
    }
  }

  return (
    <AuthenticationLayout language={language} onLanguageChange={setLanguage}>
      <section className="panel auth-panel" aria-labelledby="login-title">
        <h2 id="login-title" className="panel__title">
          {translate("auth.signIn")}
        </h2>

        <form className="cleaning-form" noValidate onSubmit={handleSubmit}>
          <label>
            {translate("auth.email")}
            <input
              autoComplete="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            {translate("auth.password")}
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {(errorMessage || signInSlow) && (
            <p className="form-error" role="alert">
              {errorMessage || translate("auth.signInSlow")}
            </p>
          )}

          <div className="button-row">
            <button className="button button--primary" type="submit" disabled={isSigningIn}>
              {isSigningIn && !signInSlow ? translate("auth.signingIn") : translate("auth.signIn")}
            </button>
          </div>
        </form>
      </section>
    </AuthenticationLayout>
  );
}

export function AuthenticationLayout({ children, language, onLanguageChange }) {
  const { translate } = useTranslation();

  return (
    <main className="cf-auth">
      <section className="cf-auth__card" aria-labelledby="page-title">
        <header className="cf-auth__header">
          <div className="cf-brand cf-brand--on-surface">
            <span className="cf-brand__mark" aria-hidden="true"><Icon name="broom" size={18} /></span>
            <h1 id="page-title" className="cf-brand__name">{content.productName}</h1>
          </div>
          <LanguageSelector language={language} onChange={onLanguageChange} />
        </header>
        <p className="cf-auth__tagline">{translate("brand.operationsPlatform")}</p>
        {children}
        <p className="cf-auth__version"><span className="badge">{appVersion}</span></p>
      </section>
    </main>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { translate } = useTranslation();
  const isDark = theme === "dark";
  const label = isDark ? translate("theme.switchToLight") : translate("theme.switchToDark");

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span className="theme-toggle__track" aria-hidden="true"><span className="theme-toggle__thumb"><Icon name={isDark ? "moon" : "sun"} size={13} /></span></span>
      <span className="theme-toggle__text" aria-hidden="true">{translate(isDark ? "shell.themeDark" : "shell.themeLight")}</span>
    </button>
  );
}

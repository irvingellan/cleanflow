import { appBuildId } from "../buildInfo.js";
import { canShowEnvironmentNavigation, cleanflowEnvironment, environmentNavigationTarget } from "../environment.js";
import { useTranslation } from "../i18n/translations.js";

export function EnvironmentBanner({ environment = cleanflowEnvironment }) {
  if (environment !== "sandbox") return null;
  return <aside className="environment-banner" role="status">SANDBOX · TEST DATA</aside>;
}

export function DeveloperEnvironmentControls({ user, environment = cleanflowEnvironment, buildId = appBuildId }) {
  const { translate } = useTranslation();
  if (!canShowEnvironmentNavigation(user, environment)) return null;
  const target = environmentNavigationTarget(environment);
  return <span className="developer-environment">
    <small title={buildId}>{environment.toUpperCase()} · Build {buildId.slice(0, 12)}</small>
    {target && <a className="button button--small" href={target.href}>{translate(target.labelKey)}</a>}
  </span>;
}
